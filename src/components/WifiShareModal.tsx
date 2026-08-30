import React, { useEffect, useState } from 'react';
import { 
  X, 
  Wifi, 
  ShieldCheck, 
  Download, 
  FolderOpen, 
  RefreshCw, 
  Smartphone, 
  Monitor, 
  CheckCircle, 
  Loader2, 
  Trash2, 
  Copy, 
  ExternalLink,
  ArrowRight,
  ArrowDownToLine,
  HardDrive
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

interface WifiShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sharedFiles: Array<{ id: string; title: string; realPath?: string; url: string }>;
  onLog: (m: string) => void;
  onAddMultipleFiles: (paths: string[]) => void;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function WifiShareModal({ isOpen, onClose, sharedFiles, onLog, onAddMultipleFiles }: WifiShareModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [shareUrl, setShareUrl] = useState<string>('');
  const [receiverConnected, setReceiverConnected] = useState<boolean>(false);
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const [isImportingAll, setIsImportingAll] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importingFileIds, setImportingFileIds] = useState<Set<string>>(new Set());
  const [deletingFileIds, setDeletingFileIds] = useState<Set<string>>(new Set());

  const [autoRemoveAfterImport, setAutoRemoveAfterImport] = useState<boolean>(() => {
    return localStorage.getItem('cosmo-wifi-auto-remove') !== 'false';
  });

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

  const toggleAutoRemove = () => {
    setAutoRemoveAfterImport((prev) => {
      const next = !prev;
      localStorage.setItem('cosmo-wifi-auto-remove', next ? 'true' : 'false');
      return next;
    });
  };

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
          setError('Could not connect to Wi-Fi Share server. Please verify the app is running locally.');
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
    }, 2000);

    return () => clearInterval(intervalId);
  }, [isOpen, shareUrl]);

  if (!isOpen) return null;

  // Copy share URL
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onLog('Wi-Fi Share: Link copied to clipboard.');
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  // Delete/Unshare a single file from the room
  const handleDeleteRoomFile = async (fileId: string, filename: string, isPhone: boolean) => {
    setDeletingFileIds((prev) => new Set(prev).add(fileId));
    try {
      const res = await fetch(`http://127.0.0.1:48273/api/rooms/local/files/${fileId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRoomFiles(data.room?.files || []);
          onLog(`Wi-Fi Share: Removed ${isPhone ? 'uploaded file' : 'shared file'} "${filename}".`);
        }
      }
    } catch (err) {
      console.error('Failed to delete room file:', err);
      onLog(`Wi-Fi Share ERROR: Failed to remove file "${filename}": ${err}`);
    } finally {
      setDeletingFileIds((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  // Clear all files for a specific side (PC or Phone)
  const handleClearAllSide = async (isPhoneSide: boolean) => {
    const targetFiles = roomFiles.filter((f: any) => isPhoneSide ? f.isPhoneUpload : !f.isPhoneUpload);
    if (targetFiles.length === 0) return;

    for (const f of targetFiles) {
      try {
        await fetch(`http://127.0.0.1:48273/api/rooms/local/files/${f.id}`, { method: 'DELETE' });
      } catch {}
    }

    // Refresh room status
    try {
      const res = await fetch('http://127.0.0.1:48273/api/rooms/local/status?role=sender');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.room) {
          setRoomFiles(data.room.files || []);
        }
      }
    } catch {}

    onLog(`Wi-Fi Share: Cleared all ${isPhoneSide ? 'incoming phone uploads' : 'outgoing PC shared files'}.`);
  };

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
        
        // If auto-remove is enabled, remove from room queue
        if (autoRemoveAfterImport) {
          await fetch(`http://127.0.0.1:48273/api/rooms/local/files/${fileId}`, { method: 'DELETE' }).catch(() => {});
          setRoomFiles((prev) => prev.filter((f) => f.id !== fileId));
        }

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
    const phoneUploads = roomFiles.filter((f: any) => f.isPhoneUpload);
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
          if (autoRemoveAfterImport) {
            await fetch(`http://127.0.0.1:48273/api/rooms/local/files/${file.id}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      } catch (err) {
        onLog(`Wi-Fi Share ERROR: Failed to download "${file.name}": ${err}`);
      }
    }

    setIsImportingAll(false);
    setImportProgress(null);

    if (autoRemoveAfterImport) {
      setRoomFiles((prev) => prev.filter((f) => !f.isPhoneUpload));
    }

    if (downloadedPaths.length > 0) {
      onLog(`Wi-Fi Share: Ingesting ${downloadedPaths.length} downloaded file(s) into workspace...`);
      await onAddMultipleFiles(downloadedPaths);
      onClose();
    }
  };

  // Separate files into PC side (Outgoing) and Phone side (Incoming)
  const pcFiles = roomFiles.filter((f: any) => !f.isPhoneUpload);
  const phoneFiles = roomFiles.filter((f: any) => f.isPhoneUpload);

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
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
          background: 'linear-gradient(180deg, rgba(16, 18, 26, 0.98) 0%, rgba(10, 12, 18, 0.99) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 210, 255, 0.08)',
          position: 'relative',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '14px 18px 12px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.2), rgba(0, 255, 136, 0.2))',
              border: '1px solid rgba(0, 255, 136, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Wifi size={15} style={{ color: '#00ff88' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', margin: 0 }}>
                Wi-Fi Direct Share
              </h2>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                Transfer files between Desktop PC & Mobile Phone
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 8px',
              borderRadius: '12px',
              background: receiverConnected ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${receiverConnected ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
              fontSize: '9.5px',
              fontWeight: 700,
              color: receiverConnected ? '#00ff88' : 'rgba(255, 255, 255, 0.5)'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: receiverConnected ? '#00ff88' : 'rgba(255, 255, 255, 0.4)',
                animation: receiverConnected ? 'pulse 1s infinite alternate' : 'none'
              }} />
              <span>{receiverConnected ? 'Phone Connected' : 'Waiting for Phone'}</span>
            </div>

            <button 
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                padding: '5px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', gap: '8px' }}>
              <RefreshCw size={24} className="spin" style={{ color: '#00d2ff' }} />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Initializing Wi-Fi connection...</span>
            </div>
          ) : error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', gap: '10px', textAlign: 'center' }}>
              <ShieldCheck size={32} style={{ color: '#ff4d4d' }} />
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', maxWidth: '280px', margin: 0 }}>{error}</p>
            </div>
          ) : (
            <>
              {/* Connection & QR Header Card */}
              <div style={{
                display: 'flex',
                gap: '14px',
                alignItems: 'center',
                background: 'rgba(0, 0, 0, 0.35)',
                padding: '10px 12px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                {qrDataUrl && (
                  <div style={{ 
                    background: '#ffffff', 
                    padding: '5px', 
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    flexShrink: 0
                  }}>
                    <img src={qrDataUrl} alt="Scan QR Code" style={{ width: '84px', height: '84px', display: 'block' }} />
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.6px' }}>
                    📱 Connect Phone (Scan QR or Open URL):
                  </span>
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#00d2ff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {shareUrl}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                    <button
                      onClick={handleCopyLink}
                      style={{
                        background: copied ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        border: `1px solid ${copied ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.15)'}`,
                        color: copied ? '#00ff88' : '#ffffff',
                        borderRadius: '6px',
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
                      <Copy size={10} />
                      <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          await invoke('open_external_url', { url: shareUrl });
                        } catch (err) {
                          console.error('Failed to open link:', err);
                        }
                      }}
                      style={{
                        background: 'rgba(0, 210, 255, 0.15)',
                        border: '1px solid rgba(0, 210, 255, 0.35)',
                        color: '#00d2ff',
                        borderRadius: '6px',
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
                      <ExternalLink size={10} />
                      <span>Open on this PC</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ══════════════════════════════════════════════════════════════════
                  ZONE 1: 🖥️ DESKTOP PC SIDE (OUTGOING TO PHONE) - ELECTRIC BLUE
                 ══════════════════════════════════════════════════════════════════ */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(0, 119, 182, 0.12) 0%, rgba(13, 27, 42, 0.5) 100%)',
                border: '1.5px solid rgba(0, 210, 255, 0.35)',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {/* Zone Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      padding: '3px 6px',
                      borderRadius: '5px',
                      background: '#00d2ff',
                      color: '#000000',
                      fontSize: '9px',
                      fontWeight: 900,
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}>
                      <Monitor size={10} />
                      <span>PC SIDE</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#00d2ff' }}>
                        Outgoing Files (Sent from this PC ➔ Phone)
                      </span>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                        Files hosted by this computer ({pcFiles.length})
                      </span>
                    </div>
                  </div>

                  {pcFiles.length > 0 && (
                    <button
                      onClick={() => handleClearAllSide(false)}
                      style={{
                        background: 'rgba(255, 77, 77, 0.12)',
                        border: '1px solid rgba(255, 77, 77, 0.3)',
                        color: '#ff6666',
                        borderRadius: '5px',
                        padding: '2px 7px',
                        fontSize: '9px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                      title="Stop sharing and clear all PC files from room"
                    >
                      <Trash2 size={9} />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                {/* PC Files List */}
                <div style={{
                  maxHeight: '110px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '8px',
                  padding: '5px'
                }}>
                  {pcFiles.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40px', color: 'rgba(255,255,255,0.4)', fontSize: '9.5px', fontStyle: 'italic' }}>
                      No files currently being shared from PC
                    </div>
                  ) : (
                    pcFiles.map((file) => {
                      const isDeleting = deletingFileIds.has(file.id);
                      return (
                        <div
                          key={file.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 8px',
                            background: 'rgba(0, 210, 255, 0.06)',
                            border: '1px solid rgba(0, 210, 255, 0.15)',
                            borderRadius: '6px',
                            gap: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                            <Monitor size={11} style={{ color: '#00d2ff', flexShrink: 0 }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={file.name}>
                                {file.name}
                              </span>
                              <span style={{ fontSize: '8.5px', color: 'rgba(0, 210, 255, 0.8)', fontWeight: 600 }}>
                                {formatFileSize(file.size)} • Ready for phone download
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteRoomFile(file.id, file.name, false)}
                            disabled={isDeleting}
                            style={{
                              background: 'rgba(255, 77, 77, 0.12)',
                              border: '1px solid rgba(255, 77, 77, 0.25)',
                              color: '#ff6666',
                              borderRadius: '4px',
                              padding: '3px 6px',
                              fontSize: '8.5px',
                              fontWeight: 700,
                              cursor: isDeleting ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                              flexShrink: 0
                            }}
                            title="Remove file from Wi-Fi share"
                          >
                            <Trash2 size={9} />
                            <span>Remove</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ══════════════════════════════════════════════════════════════════
                  ZONE 2: 📱 MOBILE PHONE SIDE (INCOMING TO PC) - NEON GREEN
                 ══════════════════════════════════════════════════════════════════ */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(6, 44, 28, 0.4) 0%, rgba(16, 28, 20, 0.5) 100%)',
                border: '1.5px solid rgba(0, 255, 136, 0.35)',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {/* Zone Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      padding: '3px 6px',
                      borderRadius: '5px',
                      background: '#00ff88',
                      color: '#000000',
                      fontSize: '9px',
                      fontWeight: 900,
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}>
                      <Smartphone size={10} />
                      <span>PHONE SIDE</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#00ff88' }}>
                        Incoming Files (Uploaded from Phone ➔ PC)
                      </span>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                        Files received from your phone ({phoneFiles.length})
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {phoneFiles.length > 0 && (
                      <>
                        <button
                          onClick={handleImportAll}
                          disabled={isImportingAll}
                          style={{
                            background: '#00ff88',
                            border: 'none',
                            color: '#000000',
                            borderRadius: '5px',
                            padding: '3px 8px',
                            fontSize: '9px',
                            fontWeight: 800,
                            cursor: isImportingAll ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                          title="Import all phone files to grid"
                        >
                          {isImportingAll ? (
                            <>
                              <Loader2 size={9} className="spin" />
                              <span>Importing ({importProgress?.current}/{importProgress?.total})...</span>
                            </>
                          ) : (
                            <>
                              <Download size={9} />
                              <span>Import All</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleClearAllSide(true)}
                          style={{
                            background: 'rgba(255, 77, 77, 0.12)',
                            border: '1px solid rgba(255, 77, 77, 0.3)',
                            color: '#ff6666',
                            borderRadius: '5px',
                            padding: '2px 6px',
                            fontSize: '9px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}
                          title="Delete all phone uploads from server"
                        >
                          <Trash2 size={9} />
                          <span>Clear</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Phone Files List */}
                <div style={{
                  maxHeight: '130px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '8px',
                  padding: '5px'
                }}>
                  {phoneFiles.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '45px', color: 'rgba(255,255,255,0.4)', fontSize: '9.5px', fontStyle: 'italic' }}>
                      No files uploaded from phone yet
                    </div>
                  ) : (
                    phoneFiles.map((file) => {
                      const isImporting = importingFileIds.has(file.id);
                      const isDeleting = deletingFileIds.has(file.id);

                      return (
                        <div
                          key={file.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 8px',
                            background: 'rgba(0, 255, 136, 0.06)',
                            border: '1px solid rgba(0, 255, 136, 0.15)',
                            borderRadius: '6px',
                            gap: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                            <Smartphone size={11} style={{ color: '#00ff88', flexShrink: 0 }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={file.name}>
                                {file.name}
                              </span>
                              <span style={{ fontSize: '8.5px', color: 'rgba(0, 255, 136, 0.8)', fontWeight: 600 }}>
                                {formatFileSize(file.size)} • Ready to import
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            <button
                              onClick={() => handleImportUploaded(file.id, file.name)}
                              disabled={isImporting || isImportingAll}
                              style={{
                                background: '#00ff88',
                                color: '#000000',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '3px 8px',
                                fontSize: '9px',
                                fontWeight: 800,
                                cursor: isImporting ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              {isImporting ? (
                                <>
                                  <Loader2 size={9} className="spin" />
                                  <span>Importing...</span>
                                </>
                              ) : (
                                <>
                                  <Download size={9} />
                                  <span>Import to Grid</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handleDeleteRoomFile(file.id, file.name, true)}
                              disabled={isDeleting}
                              style={{
                                background: 'rgba(255, 77, 77, 0.12)',
                                border: '1px solid rgba(255, 77, 77, 0.25)',
                                color: '#ff6666',
                                borderRadius: '4px',
                                padding: '3px 6px',
                                fontSize: '8.5px',
                                fontWeight: 700,
                                cursor: isDeleting ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="Delete file from server"
                            >
                              <Trash2 size={9} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ══════════════════════════════════════════════════════════════════
                  BOTTOM SETTINGS: DOWNLOAD FOLDER & AUTO-REMOVE TOGGLE
                 ══════════════════════════════════════════════════════════════════ */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                {/* Auto-remove toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '9.5px', color: 'rgba(255,255,255,0.85)', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={autoRemoveAfterImport}
                    onChange={toggleAutoRemove}
                    style={{ accentColor: '#00ff88', cursor: 'pointer' }}
                  />
                  <span>Automatically remove files from queue once imported to PC</span>
                </label>

                {/* Destination folder */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontWeight: 800, whiteSpace: 'nowrap' }}>
                    Save to:
                  </span>
                  <div style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '9.5px',
                    color: customDownloadDir ? '#00d2ff' : 'rgba(255, 255, 255, 0.5)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {customDownloadDir || 'Default (Downloads)'}
                  </div>
                  <button
                    onClick={selectDownloadDir}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '9px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <FolderOpen size={9} />
                    <span>Change</span>
                  </button>
                  {customDownloadDir && (
                    <button
                      onClick={resetDownloadDir}
                      style={{
                        background: 'rgba(255, 77, 77, 0.1)',
                        border: '1px solid rgba(255, 77, 77, 0.25)',
                        color: '#ff6666',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '9px',
                        cursor: 'pointer'
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

