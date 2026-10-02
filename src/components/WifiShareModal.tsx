import React, { useEffect, useState, useRef } from 'react';
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
  Check,
  Loader2, 
  Trash2, 
  Copy, 
  ExternalLink,
  Film,
  Image as ImageIcon,
  FileText
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

interface WifiShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sharedFiles: Array<{ id: string; title: string; realPath?: string; url: string }>;
  setWifiShareItems?: React.Dispatch<React.SetStateAction<any[]>>;
  onClearSharedFiles?: () => void;
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

function getMediaIcon(filename: string, mime?: string) {
  const lower = ((filename || '') + ' ' + (mime || '')).toLowerCase();
  if (lower.includes('video') || lower.endsWith('.mp4') || lower.endsWith('.mkv') || lower.endsWith('.mov') || lower.endsWith('.webm')) {
    return <Film size={11} style={{ color: '#00d2ff', flexShrink: 0 }} />;
  }
  if (lower.includes('image') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp') || lower.endsWith('.gif')) {
    return <ImageIcon size={11} style={{ color: '#00ff88', flexShrink: 0 }} />;
  }
  return <FileText size={11} style={{ color: 'rgba(255,255,255,0.7)', flexShrink: 0 }} />;
}

export function WifiShareModal({ 
  isOpen, 
  onClose, 
  sharedFiles, 
  setWifiShareItems, 
  onClearSharedFiles, 
  onLog, 
  onAddMultipleFiles 
}: WifiShareModalProps) {
  const [activeTab, setActiveTab] = useState<'phone' | 'pc'>('phone');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [shareUrl, setShareUrl] = useState<string>('');
  const [receiverConnected, setReceiverConnected] = useState<boolean>(false);
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const prevPhoneCountRef = useRef(0);

  // Auto-switch to phone tab if new phone uploads arrive
  useEffect(() => {
    const currentPhoneCount = roomFiles.filter((f: any) => f.isPhoneUpload).length;
    if (currentPhoneCount > prevPhoneCountRef.current) {
      setActiveTab('phone');
    }
    prevPhoneCountRef.current = currentPhoneCount;
  }, [roomFiles]);

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
    // 1. Optimistically remove from state immediately
    setRoomFiles((prev) => prev.filter((f) => f.id !== fileId));
    setDeletingFileIds((prev) => new Set(prev).add(fileId));

    if (!isPhone) {
      if (setWifiShareItems) {
        setWifiShareItems((prev) => prev.filter((f) => f.id !== fileId));
      }
    }

    try {
      await fetch(`http://127.0.0.1:48273/api/rooms/local/files/${fileId}`, {
        method: 'DELETE'
      });
      onLog(`Wi-Fi Share: Removed ${isPhone ? 'uploaded file' : 'shared file'} "${filename}".`);
    } catch (err) {
      console.error('Failed to delete room file:', err);
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

    // 1. Optimistically clear the UI immediately
    if (isPhoneSide) {
      setRoomFiles((prev) => prev.filter((f) => !f.isPhoneUpload));
    } else {
      setRoomFiles((prev) => prev.filter((f) => f.isPhoneUpload));
      if (setWifiShareItems) setWifiShareItems([]);
      if (onClearSharedFiles) onClearSharedFiles();
      try {
        await invoke('set_wifi_shared_files', { paths: [] });
      } catch {}
    }

    // 2. Delete all items from room on server in parallel
    await Promise.all(
      targetFiles.map((f) =>
        fetch(`http://127.0.0.1:48273/api/rooms/local/files/${f.id}`, { method: 'DELETE' }).catch(() => {})
      )
    );

    onLog(`Wi-Fi Share: Cleared all ${isPhoneSide ? 'incoming phone uploads' : 'outgoing PC shared files'}.`);
  };

  // Import single uploaded file to workspace
  const handleImportUploaded = async (fileId: string, name: string) => {
    if (importingFileIds.has(fileId)) return;
    setImportingFileIds((prev) => new Set(prev).add(fileId));
    setImportError(null);
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
    } catch (err: any) {
      console.error(`Wi-Fi Share error downloading ${name}:`, err);
      const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      setImportError(`Failed to import "${name}": ${msg}`);
      onLog(`Wi-Fi Share ERROR: Failed to download "${name}": ${msg}`);
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
    setImportError(null);
    setImportProgress({ current: 0, total: phoneUploads.length });
    onLog(`Wi-Fi Share: Starting batch import of ${phoneUploads.length} uploaded files...`);

    const downloadedPaths: string[] = [];
    const successfulFileIds: string[] = [];
    const failedFiles: { name: string; error: string }[] = [];

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
          successfulFileIds.push(file.id);
          if (autoRemoveAfterImport) {
            await fetch(`http://127.0.0.1:48273/api/rooms/local/files/${file.id}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      } catch (err: any) {
        console.error(`Wi-Fi Share error downloading ${file.name}:`, err);
        const errStr = typeof err === 'string' ? err : err?.message || 'Download error';
        failedFiles.push({ name: file.name, error: errStr });
        onLog(`Wi-Fi Share ERROR: Failed to download "${file.name}": ${errStr}`);
      }
    }

    setIsImportingAll(false);
    setImportProgress(null);

    // Only remove the files that were ACTUALLY downloaded from the room list
    if (autoRemoveAfterImport && successfulFileIds.length > 0) {
      setRoomFiles((prev) => prev.filter((f) => !successfulFileIds.includes(f.id)));
    }

    if (failedFiles.length > 0) {
      const errorMsg = `Failed to import ${failedFiles.length} of ${phoneUploads.length} file(s). Error: ${failedFiles[0].name} (${failedFiles[0].error})`;
      setImportError(errorMsg);
    }

    if (downloadedPaths.length > 0) {
      onLog(`Wi-Fi Share: Ingesting ${downloadedPaths.length} downloaded file(s) into workspace...`);
      try {
        await onAddMultipleFiles(downloadedPaths);
      } catch (ingestErr: any) {
        console.error('Failed to ingest paths:', ingestErr);
        onLog(`Wi-Fi Share ERROR: Failed to add files to workspace: ${ingestErr}`);
      }

      if (failedFiles.length === 0) {
        onClose();
      }
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
          maxWidth: '470px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 210, 255, 0.08)',
          position: 'relative',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '7px',
              background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.2), rgba(0, 255, 136, 0.2))',
              border: '1px solid rgba(0, 255, 136, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Wifi size={14} style={{ color: '#00ff88' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '12.5px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', margin: 0 }}>
                Wi-Fi Share
              </h2>
              <span style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                Direct workspace sync with mobile
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 7px',
              borderRadius: '10px',
              background: receiverConnected ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${receiverConnected ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
              fontSize: '9px',
              fontWeight: 700,
              color: receiverConnected ? '#00ff88' : 'rgba(255, 255, 255, 0.5)'
            }}>
              <span style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: receiverConnected ? '#00ff88' : 'rgba(255, 255, 255, 0.4)'
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
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', gap: '8px' }}>
              <RefreshCw size={22} className="spin" style={{ color: '#00d2ff' }} />
              <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.6)' }}>Initializing Wi-Fi connection...</span>
            </div>
          ) : error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', gap: '8px', textAlign: 'center' }}>
              <ShieldCheck size={28} style={{ color: '#ff4d4d' }} />
              <p style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.7)', maxWidth: '280px', margin: 0 }}>{error}</p>
            </div>
          ) : (
            <>
              {/* Connection & QR Header Card */}
              <div style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                background: 'rgba(0, 0, 0, 0.35)',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                {qrDataUrl && (
                  <div style={{ 
                    background: '#ffffff', 
                    padding: '3px', 
                    borderRadius: '6px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    flexShrink: 0
                  }}>
                    <img src={qrDataUrl} alt="Scan QR Code" style={{ width: '60px', height: '60px', display: 'block' }} />
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>
                      Scan QR or open on phone:
                    </span>
                    <a
                      href={`http://${window.location.hostname || '127.0.0.1'}:48273/CosmoShare.apk`}
                      download="CosmoShare.apk"
                      style={{
                        fontSize: '8px',
                        fontWeight: 800,
                        color: '#00ff88',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        background: 'rgba(0, 255, 136, 0.1)',
                        border: '1px solid rgba(0, 255, 136, 0.25)',
                        padding: '1px 5px',
                        borderRadius: '4px'
                      }}
                      title="Download CosmoShare Android APK"
                    >
                      <Smartphone size={8} />
                      <span>CosmoShare APK</span>
                    </a>
                  </div>

                  <div 
                    onClick={handleCopyLink}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '5px',
                      padding: '2px 7px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#00d2ff',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer'
                    }}
                    title="Click to copy URL"
                  >
                    {shareUrl}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '5px', marginTop: '1px', alignItems: 'center' }}>
                    <button
                      onClick={handleCopyLink}
                      style={{
                        background: copied ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 255, 255, 0.07)',
                        border: `1px solid ${copied ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.12)'}`,
                        color: copied ? '#00ff88' : '#ffffff',
                        borderRadius: '5px',
                        padding: '2px 7px',
                        fontSize: '9px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {copied ? <Check size={9} /> : <Copy size={9} />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
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
                        background: 'rgba(0, 210, 255, 0.12)',
                        border: '1px solid rgba(0, 210, 255, 0.3)',
                        color: '#00d2ff',
                        borderRadius: '5px',
                        padding: '2px 7px',
                        fontSize: '9px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        whiteSpace: 'nowrap'
                      }}
                      title="Open share page in your browser"
                    >
                      <ExternalLink size={9} />
                      <span>Open</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Segmented Control Tabs */}
              <div style={{
                display: 'flex',
                background: 'rgba(0, 0, 0, 0.45)',
                padding: '2px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                gap: '2px'
              }}>
                <button
                  onClick={() => setActiveTab('phone')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'phone' 
                      ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.2) 0%, rgba(0, 200, 110, 0.12) 100%)' 
                      : 'transparent',
                    color: activeTab === 'phone' ? '#00ff88' : 'rgba(255, 255, 255, 0.5)',
                    boxShadow: activeTab === 'phone' ? '0 2px 6px rgba(0, 255, 136, 0.15), inset 0 0 0 1px rgba(0, 255, 136, 0.3)' : 'none',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Smartphone size={12} />
                  <span>Phone Uploads</span>
                  <span style={{
                    fontSize: '8.5px',
                    padding: '0.5px 5px',
                    borderRadius: '8px',
                    background: activeTab === 'phone' ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                    color: activeTab === 'phone' ? '#00ff88' : 'rgba(255, 255, 255, 0.6)',
                    fontWeight: 800
                  }}>
                    {phoneFiles.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('pc')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'pc' 
                      ? 'linear-gradient(135deg, rgba(0, 210, 255, 0.2) 0%, rgba(0, 150, 255, 0.12) 100%)' 
                      : 'transparent',
                    color: activeTab === 'pc' ? '#00d2ff' : 'rgba(255, 255, 255, 0.5)',
                    boxShadow: activeTab === 'pc' ? '0 2px 6px rgba(0, 210, 255, 0.15), inset 0 0 0 1px rgba(0, 210, 255, 0.3)' : 'none',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Monitor size={12} />
                  <span>Shared from PC</span>
                  <span style={{
                    fontSize: '8.5px',
                    padding: '0.5px 5px',
                    borderRadius: '8px',
                    background: activeTab === 'pc' ? 'rgba(0, 210, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                    color: activeTab === 'pc' ? '#00d2ff' : 'rgba(255, 255, 255, 0.6)',
                    fontWeight: 800
                  }}>
                    {pcFiles.length}
                  </span>
                </button>
              </div>

              {/* TAB 1: PHONE UPLOADS */}
              {activeTab === 'phone' && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(6, 44, 28, 0.3) 0%, rgba(16, 28, 20, 0.4) 100%)',
                  border: '1px solid rgba(0, 255, 136, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {/* Phone Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#00ff88' }}>
                        Incoming Files
                      </span>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)' }}>
                        ({phoneFiles.length})
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {phoneFiles.length > 0 && (
                        <>
                          <button
                            onClick={handleImportAll}
                            disabled={isImportingAll}
                            style={{
                              background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                              border: 'none',
                              color: '#000000',
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '9px',
                              fontWeight: 800,
                              cursor: isImportingAll ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                              boxShadow: '0 2px 6px rgba(0, 255, 136, 0.25)'
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
                                <span>Import All ({phoneFiles.length})</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleClearAllSide(true)}
                            style={{
                              background: 'rgba(255, 77, 77, 0.12)',
                              border: '1px solid rgba(255, 77, 77, 0.25)',
                              color: '#ff6666',
                              borderRadius: '4px',
                              padding: '2px 5px',
                              fontSize: '8.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                            title="Delete all phone uploads from room"
                          >
                            <Trash2 size={8} />
                            <span>Clear</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Import Error Banner */}
                  {importError && (
                    <div style={{
                      background: 'rgba(255, 77, 77, 0.15)',
                      border: '1px solid rgba(255, 77, 77, 0.4)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      fontSize: '9.5px',
                      color: '#ff7b7b'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>⚠️</span>
                        <span>{importError}</span>
                      </div>
                      <button
                        onClick={() => setImportError(null)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'rgba(255,255,255,0.6)',
                          cursor: 'pointer',
                          padding: '1px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}

                  {/* Phone Files List */}
                  <div style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: '6px',
                    padding: '4px'
                  }}>
                    {phoneFiles.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '65px', color: 'rgba(255,255,255,0.4)', fontSize: '9px', gap: '3px' }}>
                        <Smartphone size={14} style={{ opacity: 0.4 }} />
                        <span>No files uploaded from phone yet</span>
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
                              padding: '3px 6px',
                              background: 'rgba(0, 255, 136, 0.05)',
                              border: '1px solid rgba(0, 255, 136, 0.12)',
                              borderRadius: '5px',
                              gap: '6px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flex: 1 }}>
                              {getMediaIcon(file.name, file.mimeType)}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={file.name}>
                                  {file.name}
                                </span>
                                <span style={{ fontSize: '8px', color: 'rgba(0, 255, 136, 0.8)', fontWeight: 600 }}>
                                  {formatFileSize(file.size)}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                              <button
                                onClick={() => handleImportUploaded(file.id, file.name)}
                                disabled={isImporting || isImportingAll}
                                style={{
                                  background: '#00ff88',
                                  color: '#000000',
                                  border: 'none',
                                  borderRadius: '3px',
                                  padding: '2px 6px',
                                  fontSize: '8.5px',
                                  fontWeight: 800,
                                  cursor: isImporting ? 'wait' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '2px'
                                }}
                              >
                                {isImporting ? <Loader2 size={8} className="spin" /> : <Download size={8} />}
                                <span>Import</span>
                              </button>

                              <button
                                onClick={() => handleDeleteRoomFile(file.id, file.name, true)}
                                disabled={isDeleting}
                                style={{
                                  background: 'rgba(255, 77, 77, 0.1)',
                                  border: '1px solid rgba(255, 77, 77, 0.2)',
                                  color: '#ff6666',
                                  borderRadius: '3px',
                                  padding: '2px 4px',
                                  fontSize: '8px',
                                  cursor: isDeleting ? 'wait' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                title="Delete upload"
                              >
                                <Trash2 size={8} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: PC SHARED FILES */}
              {activeTab === 'pc' && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(0, 119, 182, 0.1) 0%, rgba(13, 27, 42, 0.4) 100%)',
                  border: '1px solid rgba(0, 210, 255, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {/* PC Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#00d2ff' }}>
                        Shared with Phone
                      </span>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)' }}>
                        ({pcFiles.length})
                      </span>
                    </div>

                    {pcFiles.length > 0 && (
                      <button
                        onClick={() => handleClearAllSide(false)}
                        style={{
                          background: 'rgba(255, 77, 77, 0.12)',
                          border: '1px solid rgba(255, 77, 77, 0.25)',
                          color: '#ff6666',
                          borderRadius: '4px',
                          padding: '2px 5px',
                          fontSize: '8.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px'
                        }}
                        title="Clear all PC files from room"
                      >
                        <Trash2 size={8} />
                        <span>Clear All</span>
                      </button>
                    )}
                  </div>

                  {/* PC Files List */}
                  <div style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: '6px',
                    padding: '4px'
                  }}>
                    {pcFiles.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '65px', color: 'rgba(255,255,255,0.4)', fontSize: '9px', gap: '3px' }}>
                        <Monitor size={14} style={{ opacity: 0.4 }} />
                        <span>No files currently shared from PC</span>
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
                              padding: '3px 6px',
                              background: 'rgba(0, 210, 255, 0.05)',
                              border: '1px solid rgba(0, 210, 255, 0.12)',
                              borderRadius: '5px',
                              gap: '6px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flex: 1 }}>
                              {getMediaIcon(file.name, file.mimeType)}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={file.name}>
                                  {file.name}
                                </span>
                                <span style={{ fontSize: '8px', color: 'rgba(0, 210, 255, 0.8)', fontWeight: 600 }}>
                                  {formatFileSize(file.size)} • Ready for phone
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleDeleteRoomFile(file.id, file.name, false)}
                              disabled={isDeleting}
                              style={{
                                background: 'rgba(255, 77, 77, 0.1)',
                                border: '1px solid rgba(255, 77, 77, 0.2)',
                                color: '#ff6666',
                                borderRadius: '3px',
                                padding: '2px 4px',
                                fontSize: '8px',
                                cursor: isDeleting ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Remove from room"
                            >
                              <Trash2 size={8} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Bottom Settings Bar */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '8px',
                padding: '5px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '9px', color: 'rgba(255,255,255,0.7)', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={autoRemoveAfterImport}
                    onChange={toggleAutoRemove}
                    style={{ accentColor: '#00ff88', cursor: 'pointer', width: '12px', height: '12px' }}
                  />
                  <span>Auto-remove on import</span>
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 800 }}>
                    Save:
                  </span>
                  <span 
                    style={{ 
                      fontSize: '9px', 
                      color: customDownloadDir ? '#00d2ff' : 'rgba(255, 255, 255, 0.7)', 
                      maxWidth: '120px', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap' 
                    }} 
                    title={customDownloadDir || 'Default Downloads folder'}
                  >
                    {customDownloadDir ? customDownloadDir.split(/[\\/]/).pop() || customDownloadDir : 'Downloads'}
                  </span>
                  <button
                    onClick={selectDownloadDir}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      borderRadius: '4px',
                      padding: '2px 5px',
                      fontSize: '8.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                    title="Change destination folder"
                  >
                    <FolderOpen size={8} />
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

