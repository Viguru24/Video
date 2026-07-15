import React, { useEffect, useState } from 'react';
import { X, Wifi, ShieldCheck, Download, FolderOpen, RefreshCw, Smartphone, Monitor } from 'lucide-react';
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

  const [customDownloadDir, setCustomDownloadDir] = useState<string>(() => {
    return localStorage.getItem('cosmo-wifi-download-dir') || '';
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
        onLog(`Wi-Fi Share: Custom download directory set to "${selected}"`);
      }
    } catch (err) {
      console.error('Failed to open directory picker:', err);
    }
  };

  // 1. Initialise the sharing room on mount or when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);
    setError(null);

    async function initRoom() {
      try {
        const response = await fetch('http://127.0.0.1:48273/api/rooms/create', { method: 'POST' });
        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }
        const data = await response.json();
        if (active && data.success) {
          setShareUrl(data.shareUrl);
          setQrDataUrl(data.qrDataUrl || '');
          if (data.room) {
            setReceiverConnected(data.room.receiverConnected);
            setRoomFiles(data.room.files || []);
          }
          setLoading(false);
        }
      } catch (err: any) {
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

            // Check if there are newly uploaded files from the phone to auto-import
            const uploadedFromPhone = (data.room.files || []).filter(
              (f: any) => f.isPhoneUpload
            );
            
            // If the user wants to auto-download, we can handle it here or let them import manually
          }
        }
      } catch (err) {
        console.warn('Wi-Fi share room poll failed:', err);
      }
    }, 2500);

    return () => clearInterval(intervalId);
  }, [isOpen, shareUrl]);

  if (!isOpen) return null;

  // Import uploaded files to workspace
  const handleImportUploaded = (fileId: string, name: string) => {
    const dest = customDownloadDir ? `"${customDownloadDir}"` : 'Downloads';
    onLog(`Wi-Fi Share: Downloading phone upload "${name}" to ${dest}...`);
    invoke<string>('download_shared_file_to_downloads', { 
      code: 'local', 
      fileId,
      custom_dir: customDownloadDir || null
    })
      .then((downloadedPath) => {
        onLog(`Wi-Fi Share: Download complete. Path: ${downloadedPath}`);
        onAddMultipleFiles([downloadedPath]);
      })
      .catch((err) => {
        onLog(`Wi-Fi Share ERROR: Failed to download "${name}": ${err}`);
      });
  };

  // Import all uploaded files
  const handleImportAll = () => {
    const phoneUploads = roomFiles.filter(
      (f: any) => f.isPhoneUpload
    );
    if (phoneUploads.length === 0) return;

    onLog(`Wi-Fi Share: Importing all ${phoneUploads.length} uploaded files...`);
    phoneUploads.forEach((file) => {
      handleImportUploaded(file.id, file.name);
    });
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
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '20px'
      }}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(20, 20, 25, 0.95)',
          border: '1px solid rgba(0, 255, 136, 0.2)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 255, 136, 0.08)',
          position: 'relative',
          color: '#ffffff',
          fontFamily: 'sans-serif'
        }}
      >
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.5)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            transition: 'background 0.2s, color 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
          }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <Wifi size={24} style={{ color: 'var(--accent, #00ff88)' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', margin: 0 }}>
            Wi-Fi Share Protocol
          </h2>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', gap: '12px' }}>
            <RefreshCw size={32} className="spin" style={{ color: 'var(--accent, #00ff88)' }} />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Generating QR Code link...</span>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', gap: '16px', textAlign: 'center' }}>
            <ShieldCheck size={48} style={{ color: 'var(--danger, #ff4d4d)' }} />
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', maxWidth: '300px', margin: 0 }}>{error}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top row: QR code and Instructions */}
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              {qrDataUrl && (
                <div style={{ 
                  background: '#ffffff', 
                  padding: '12px', 
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  flexShrink: 0
                }}>
                  <img src={qrDataUrl} alt="Wi-Fi QR Code" style={{ width: '150px', height: '150px', display: 'block' }} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Instructions
                </span>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, margin: 0 }}>
                  1. Scan the QR code or open: <br />
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
                    style={{ color: 'var(--accent, #00ff88)', textDecoration: 'underline', fontWeight: 'bold', wordBreak: 'break-all', cursor: 'pointer' }}
                  >
                    {shareUrl}
                  </a>
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    onClick={async () => {
                      try {
                        await invoke('open_external_url', { url: shareUrl });
                      } catch (err) {
                        console.error('Failed to open link:', err);
                      }
                    }}
                    style={{
                      background: 'rgba(0, 255, 136, 0.1)',
                      border: '1px solid rgba(0, 255, 136, 0.25)',
                      color: 'var(--accent, #00ff88)',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.18)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.1)'}
                  >
                    <Monitor size={12} />
                    Open Share Page on this PC
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: receiverConnected ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.4)', marginTop: '6px' }}>
                  <span style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    background: receiverConnected ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.3)',
                    animation: receiverConnected ? 'pulse 1s infinite alternate' : 'none'
                  }} />
                  <span>{receiverConnected ? 'Phone/Web Client Connected' : 'Waiting for connection...'}</span>
                </div>
              </div>
            </div>

            {/* Middle part: Shared items list */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Shared Files ({sharedFiles.length})
                </span>
              </div>
              <div style={{ 
                maxHeight: '120px', 
                overflowY: 'auto', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '8px', 
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                {sharedFiles.map((file) => (
                  <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px' }} title={file.title}>
                      {file.title}
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--accent, #00ff88)', padding: '2px 6px', border: '1px solid rgba(0, 255, 136, 0.2)', borderRadius: '4px', textTransform: 'uppercase' }}>
                      Ready to get
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Download Folder Settings */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                Download Destination Folder
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  color: customDownloadDir ? '#ffffff' : 'rgba(255, 255, 255, 0.4)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {customDownloadDir || 'Default (System Downloads Folder)'}
                </div>
                <button
                  onClick={selectDownloadDir}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                >
                  <FolderOpen size={14} />
                  Choose
                </button>
                {customDownloadDir && (
                  <button
                    onClick={() => {
                      setCustomDownloadDir('');
                      localStorage.removeItem('cosmo-wifi-download-dir');
                    }}
                    style={{
                      background: 'rgba(255, 77, 77, 0.1)',
                      border: '1px solid rgba(255, 77, 77, 0.3)',
                      color: '#ff4d4d',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.2)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.1)'}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Bottom part: uploads from phone */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Uploaded From Phone ({phoneUploads.length})
                </span>
                {phoneUploads.length > 0 && (
                  <button 
                    onClick={handleImportAll}
                    style={{
                      background: 'rgba(0, 255, 136, 0.1)',
                      border: '1px solid rgba(0, 255, 136, 0.3)',
                      color: 'var(--accent, #00ff88)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      textTransform: 'uppercase'
                    }}
                  >
                    Import All
                  </button>
                )}
              </div>
              <div style={{ 
                maxHeight: '120px', 
                overflowY: 'auto', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '8px', 
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                {phoneUploads.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60px', color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontStyle: 'italic' }}>
                    No files uploaded from phone yet
                  </div>
                ) : (
                  phoneUploads.map((file) => (
                    <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }} title={file.name}>
                        {file.name}
                      </span>
                      <button
                        onClick={() => handleImportUploaded(file.id, file.name)}
                        style={{
                          background: 'var(--accent, #00ff88)',
                          color: '#000000',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '10px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Download size={10} />
                        <span>Import</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
