import React, { useEffect, useState } from 'react';
import { X, Wifi, ShieldCheck, Download, FolderOpen, RefreshCw, Smartphone, Monitor, CheckCircle, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

interface WifiShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sharedFiles: Array<{ id: string; title: string; realPath?: string; url: string }>;
  onLog: (m: string) => void;
  onAddMultipleFiles: (paths: string[]) => void;
}

export function WifiShareModal({ isOpen, onClose, sharedFiles, onLog, onAddMultipleFiles }: WifiShareModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [shareUrl, setShareUrl] = useState<string>('');
  const [receiverConnected, setReceiverConnected] = useState<boolean>(false);
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [isImportingAll, setIsImportingAll] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importingFileIds, setImportingFileIds] = useState<Set<string>>(new Set());
  const [importedFileIds, setImportedFileIds] = useState<Set<string>>(new Set());

  const [customDownloadDir, setCustomDownloadDir] = useState<string>(() => {
    return localStorage.getItem('cosmo-wifi-download-dir') || '';
  });

  const [folderHistory, setFolderHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('cosmo-wifi-folder-history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const selectDownloadDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: customDownloadDir || undefined
      });
      if (selected && typeof selected === 'string') {
        setCustomDownloadDir(selected);
        localStorage.setItem('cosmo-wifi-download-dir', selected);

        setFolderHistory((prev) => {
          const updated = [selected, ...prev.filter((p) => p !== selected)].slice(0, 8);
          localStorage.setItem('cosmo-wifi-folder-history', JSON.stringify(updated));
          return updated;
        });

        onLog(`Wi-Fi Share: Custom download directory set to "${selected}"`);
      }
    } catch (err) {
      console.error('Failed to select directory:', err);
    }
  };

  const resetDownloadDir = () => {
    setCustomDownloadDir('');
    localStorage.removeItem('cosmo-wifi-download-dir');
    onLog('Wi-Fi Share: Reset download directory to system Downloads');
  };

  // 1. Initialize room when modal opens
  useEffect(() => {
    let active = true;

    async function initRoom() {
      if (!isOpen) return;
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('http://127.0.0.1:48273/api/rooms/create', { method: 'POST' });
        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }
        const data = await response.json();
        if (active && data.success) {
          setShareUrl(data.shareUrl);
          setQrDataUrl(data.qrDataUrl || '');
          setReceiverConnected(data.room?.receiverConnected || false);
          setRoomFiles(data.room?.files || []);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to init Wi-Fi share room:', err);
        if (active) {
          setError('Could not connect to Wi-Fi Share server. Please verify the app restarted.');
          setLoading(false);
        }
      }
    }

    initRoom();

    return () => {
      active = false;
    };
  }, [isOpen]);

  // 2. Poll room status for connections and uploads from phone
  useEffect(() => {
    if (!isOpen || !shareUrl) return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('http://127.0.0.1:48273/api/rooms/local/status?role=sender');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.room) {
            setReceiverConnected(data.room.receiverConnected);
            setRoomFiles(data.room.files || []);
          }
        }
      } catch (err) {
        console.warn('Wi-Fi share room poll failed:', err);
      }
    }, 2500);

    return () => clearInterval(intervalId);
  }, [isOpen, shareUrl]);

  if (!isOpen) return null;

  // Import single uploaded file to workspace
  const handleImportUploaded = async (fileId: string, name: string) => {
    if (importingFileIds.has(fileId)) return;
    setImportingFileIds((prev) => new Set(prev).add(fileId));
    const dest = customDownloadDir ? `"${customDownloadDir}"` : 'Downloads';
    onLog(`Wi-Fi Share: Downloading phone upload "${name}" to ${dest}...`);
    try {
      const downloadedPath = await invoke<string>('download_shared_file_to_downloads', { 
        code: 'local', 
        fileId,
        customDir: customDownloadDir || null
      });
      if (downloadedPath) {
        onLog(`Wi-Fi Share: Download complete. Path: ${downloadedPath}`);
        setImportedFileIds((prev) => new Set(prev).add(fileId));
        await onAddMultipleFiles([downloadedPath]);
        onClose();
      }
    } catch (err) {
      onLog(`Wi-Fi Share ERROR: Failed to download "${name}": ${err}`);
    } finally {
      setImportingFileIds((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  // Import all uploaded files
  const handleImportAll = async () => {
    const phoneUploads = roomFiles.filter(
      (f: any) => f.isPhoneUpload
    );
    if (phoneUploads.length === 0 || isImportingAll) return;

    setIsImportingAll(true);
    setImportProgress({ current: 0, total: phoneUploads.length });
    onLog(`Wi-Fi Share: Starting batch import of ${phoneUploads.length} uploaded files...`);

    const downloadedPaths: string[] = [];
    for (let i = 0; i < phoneUploads.length; i++) {
      const file = phoneUploads[i];
      setImportProgress({ current: i + 1, total: phoneUploads.length });
      try {
        const path = await invoke<string>('download_shared_file_to_downloads', {
          code: 'local',
          fileId: file.id,
          customDir: customDownloadDir || null
        });
        if (path) {
          downloadedPaths.push(path);
          setImportedFileIds((prev) => new Set(prev).add(file.id));
        }
      } catch (err) {
        onLog(`Wi-Fi Share ERROR: Failed to download "${file.name}": ${err}`);
      }
    }

    setIsImportingAll(false);
    setImportProgress(null);

    if (downloadedPaths.length > 0) {
      onLog(`Wi-Fi Share: Ingesting ${downloadedPaths.length} downloaded file(s) into workspace...`);
      await onAddMultipleFiles(downloadedPaths);
      onClose();
    }
  };

  const phoneUploads = roomFiles.filter(
    (f: any) => f.isPhoneUpload
  );

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '16px'
      }}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(16, 16, 22, 0.96)',
          border: '1px solid rgba(0, 255, 136, 0.25)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '430px',
          padding: '16px 18px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 255, 136, 0.08)',
          position: 'relative',
          color: '#ffffff',
          fontFamily: 'sans-serif'
        }}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.6)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
          }}
        >
          <X size={15} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '12px' }}>
          <Wifi size={16} style={{ color: 'var(--accent, #00ff88)' }} />
          <h2 style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', margin: 0 }}>
            Wi-Fi Share Protocol
          </h2>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', gap: '8px' }}>
            <RefreshCw size={24} className="spin" style={{ color: 'var(--accent, #00ff88)' }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Generating QR link...</span>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', gap: '10px', textAlign: 'center' }}>
            <ShieldCheck size={32} style={{ color: 'var(--danger, #ff4d4d)' }} />
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', maxWidth: '280px', margin: 0 }}>{error}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Top row: QR code and Instructions */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', background: 'rgba(0, 0, 0, 0.25)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
              {qrDataUrl && (
                <div style={{ 
                  background: '#ffffff', 
                  padding: '6px', 
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  flexShrink: 0
                }}>
                  <img src={qrDataUrl} alt="Wi-Fi QR Code" style={{ width: '96px', height: '96px', display: 'block' }} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Scan or Open URL:
                </span>
                <a 
                  href={shareUrl}
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      await invoke('open_external_url', { url: shareUrl });
                    } catch (err) {
                      console.error('Failed to open link:', err);
                    }
                  }}
                  style={{ color: 'var(--accent, #00ff88)', textDecoration: 'none', fontSize: '11px', fontWeight: 'bold', wordBreak: 'break-all', cursor: 'pointer' }}
                  title="Click to open in browser"
                >
                  {shareUrl}
                </a>
                <div style={{ display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                  <button
                    onClick={async () => {
                      try {
                        await invoke('open_external_url', { url: shareUrl });
                      } catch (err) {
                        console.error('Failed to open link:', err);
                      }
                    }}
                    style={{
                      background: 'rgba(0, 255, 136, 0.12)',
                      border: '1px solid rgba(0, 255, 136, 0.3)',
                      color: 'var(--accent, #00ff88)',
                      borderRadius: '5px',
                      padding: '3px 8px',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <Monitor size={10} />
                    <span>Open on this PC</span>
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9.5px', color: receiverConnected ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                  <span style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    background: receiverConnected ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.3)',
                    animation: receiverConnected ? 'pulse 1s infinite alternate' : 'none'
                  }} />
                  <span>{receiverConnected ? 'Client Connected' : 'Waiting for connection...'}</span>
                </div>
              </div>
            </div>

            {/* Middle part: Shared items list (only if sharedFiles > 0) */}
            {sharedFiles.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                    Shared Files ({sharedFiles.length})
                  </span>
                </div>
                <div style={{ 
                  maxHeight: '65px', 
                  overflowY: 'auto', 
                  background: 'rgba(0,0,0,0.2)', 
                  borderRadius: '6px', 
                  padding: '4px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {sharedFiles.map((file) => (
                    <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px', background: 'rgba(255,255,255,0.02)', borderRadius: '3px' }}>
                      <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }} title={file.title}>
                        {file.title}
                      </span>
                      <span style={{ fontSize: '8px', color: 'var(--accent, #00ff88)', padding: '1px 4px', border: '1px solid rgba(0, 255, 136, 0.2)', borderRadius: '3px', textTransform: 'uppercase' }}>
                        Ready
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Download Folder Settings */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', display: 'block', marginBottom: '5px' }}>
                Download Destination Folder
              </span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '5px',
                  padding: '4px 8px',
                  fontSize: '10.5px',
                  color: customDownloadDir ? '#ffffff' : 'rgba(255, 255, 255, 0.4)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {customDownloadDir || 'Default (Downloads)'}
                </div>
                <button
                  onClick={selectDownloadDir}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    borderRadius: '5px',
                    padding: '4px 8px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <FolderOpen size={11} />
                  <span>Choose</span>
                </button>
                {customDownloadDir && (
                  <button
                    onClick={resetDownloadDir}
                    title="Reset to default Downloads folder"
                    style={{
                      background: 'rgba(255, 77, 77, 0.1)',
                      border: '1px solid rgba(255, 77, 77, 0.25)',
                      color: '#ff6666',
                      borderRadius: '5px',
                      padding: '4px 7px',
                      fontSize: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Saved Download Folders Quick Selector */}
              {folderHistory.length > 0 && (
                <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                    Recent:
                  </span>
                  {folderHistory.map((folderPath) => {
                    const isSelected = customDownloadDir === folderPath;
                    const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
                    return (
                      <button
                        key={folderPath}
                        onClick={() => {
                          setCustomDownloadDir(folderPath);
                          localStorage.setItem('cosmo-wifi-download-dir', folderPath);
                          onLog(`Wi-Fi Share: Selected download folder "${folderPath}"`);
                        }}
                        title={folderPath}
                        style={{
                          background: isSelected ? 'rgba(0, 255, 136, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                          border: `1px solid ${isSelected ? 'rgba(0, 255, 136, 0.45)' : 'rgba(255, 255, 255, 0.08)'}`,
                          color: isSelected ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.75)',
                          borderRadius: '4px',
                          padding: '1px 6px',
                          fontSize: '9px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <FolderOpen size={8} />
                        <span>{folderName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom part: uploads from phone */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Uploaded From Phone ({phoneUploads.length})
                </span>
                {phoneUploads.length > 0 && (
                  <button 
                    onClick={handleImportAll}
                    disabled={isImportingAll}
                    style={{
                      background: isImportingAll ? 'rgba(0, 255, 136, 0.25)' : 'rgba(0, 255, 136, 0.12)',
                      border: '1px solid rgba(0, 255, 136, 0.4)',
                      color: 'var(--accent, #00ff88)',
                      borderRadius: '5px',
                      padding: '3px 8px',
                      fontSize: '9px',
                      cursor: isImportingAll ? 'wait' : 'pointer',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isImportingAll ? (
                      <>
                        <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>Importing ({importProgress?.current || 0}/{importProgress?.total || phoneUploads.length})...</span>
                      </>
                    ) : (
                      <>
                        <Download size={10} />
                        <span>Import All</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div style={{ 
                maxHeight: '105px', 
                overflowY: 'auto', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '6px', 
                padding: '5px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                {phoneUploads.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '45px', color: 'rgba(255,255,255,0.3)', fontSize: '10px', fontStyle: 'italic' }}>
                    No files uploaded from phone yet
                  </div>
                ) : (
                  phoneUploads.map((file) => {
                    const isImporting = importingFileIds.has(file.id);
                    const isImported = importedFileIds.has(file.id);

                    return (
                      <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 5px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                        <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }} title={file.name}>
                          {file.name}
                        </span>
                        <button
                          onClick={() => handleImportUploaded(file.id, file.name)}
                          disabled={isImporting || isImportingAll}
                          style={{
                            background: isImported ? 'rgba(0, 255, 136, 0.2)' : 'var(--accent, #00ff88)',
                            color: isImported ? '#00ff88' : '#000000',
                            border: isImported ? '1px solid rgba(0, 255, 136, 0.4)' : 'none',
                            borderRadius: '4px',
                            padding: '2px 7px',
                            fontSize: '9px',
                            cursor: (isImporting || isImportingAll) ? 'wait' : 'pointer',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            opacity: (isImporting || isImportingAll) ? 0.7 : 1
                          }}
                        >
                          {isImporting ? (
                            <>
                              <Loader2 size={9} style={{ animation: 'spin 1s linear infinite' }} />
                              <span>Importing...</span>
                            </>
                          ) : isImported ? (
                            <>
                              <CheckCircle size={9} />
                              <span>Imported</span>
                            </>
                          ) : (
                            <>
                              <Download size={9} />
                              <span>Import</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
