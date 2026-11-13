import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getWifiShareToken, wifiShareFetch } from '../../utils/wifiShareClient';

export interface WifiRoomFile {
  id: string;
  name: string;
  size: number;
  mime?: string;
  isPhoneUpload?: boolean;
  [key: string]: unknown;
}

interface UseWifiShareRoomOptions {
  isOpen: boolean;
  onClose: () => void;
  setWifiShareItems?: React.Dispatch<React.SetStateAction<any[]>>;
  onClearSharedFiles?: () => void;
  onLog: (m: string) => void;
  onAddMultipleFiles: (paths: string[]) => Promise<unknown> | void;
}

/**
 * Manages local Wi-Fi Share room initialization, adaptive visibility-aware polling,
 * download directory preferences, and phone/PC file transfers.
 */
export function useWifiShareRoom({
  isOpen,
  onClose,
  setWifiShareItems,
  onClearSharedFiles,
  onLog,
  onAddMultipleFiles
}: UseWifiShareRoomOptions) {
  const [activeTab, setActiveTab] = useState<'phone' | 'pc'>('phone');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [pairingToken, setPairingToken] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [receiverConnected, setReceiverConnected] = useState(false);
  const [roomFiles, setRoomFiles] = useState<WifiRoomFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [isImportingAll, setIsImportingAll] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importingFileIds, setImportingFileIds] = useState<Set<string>>(new Set());
  const [deletingFileIds, setDeletingFileIds] = useState<Set<string>>(new Set());

  const [autoRemoveAfterImport, setAutoRemoveAfterImport] = useState(
    () => localStorage.getItem('cosmo-wifi-auto-remove') !== 'false'
  );
  const [addToGrid, setAddToGrid] = useState(
    () => localStorage.getItem('cosmo-wifi-add-to-grid') === 'true'
  );
  const [customDownloadDir, setCustomDownloadDir] = useState(
    () => localStorage.getItem('cosmo-wifi-download-dir') || ''
  );

  const prevPhoneCountRef = useRef(0);

  useEffect(() => {
    const currentPhoneCount = roomFiles.filter((f) => f.isPhoneUpload).length;
    if (currentPhoneCount > prevPhoneCountRef.current) {
      setActiveTab('phone');
    }
    prevPhoneCountRef.current = currentPhoneCount;
  }, [roomFiles]);

  useEffect(() => {
    if (localStorage.getItem('cosmo-wifi-download-dir')) return;
    invoke<string | null>('load_persistence', { key: 'cosmo-wifi-download-dir' })
      .then((saved) => {
        if (saved && typeof saved === 'string' && saved.trim()) {
          setCustomDownloadDir(saved.trim());
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;

    async function initRoom() {
      if (!isOpen) return;
      setLoading(true);
      setError(null);

      try {
        const tok = await getWifiShareToken();
        if (active && tok) setPairingToken(tok);
        let response = await wifiShareFetch('/api/rooms/create', { method: 'POST' }).catch(() => null);
        if (!response || !response.ok) {
          try {
            await invoke('ensure_wifi_share_server');
            await new Promise((r) => setTimeout(r, 600));
            response = await wifiShareFetch('/api/rooms/create', { method: 'POST' }).catch(() => null);
          } catch { /* ignore retry failure */ }
        }
        if (!response || !response.ok) {
          throw new Error(`Server returned status ${response?.status ?? 'unreachable'}`);
        }
        const data = await response.json();
        if (active && data.success) {
          if (data.token) setPairingToken(data.token);
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

  useEffect(() => {
    if (!isOpen || !shareUrl) return;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let consecutiveIdleOrErr = 0;

    const scheduleNext = () => {
      if (cancelled || document.hidden) return;
      const delayMs = Math.min(30000, 5000 * Math.pow(2, Math.min(consecutiveIdleOrErr, 3)));
      timerId = setTimeout(() => {
        void pollOnce();
      }, delayMs);
    };

    const pollOnce = async () => {
      if (cancelled || document.hidden) return;
      try {
        const res = await wifiShareFetch('/api/rooms/local/status?role=sender');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.room) {
            setReceiverConnected(data.room.receiverConnected);
            setRoomFiles(data.room.files || []);
            consecutiveIdleOrErr = data.room.receiverConnected ? 1 : consecutiveIdleOrErr + 1;
          }
        } else {
          consecutiveIdleOrErr += 1;
        }
      } catch (err) {
        consecutiveIdleOrErr += 1;
        console.warn('Wi-Fi share room poll failed:', err);
      } finally {
        scheduleNext();
      }
    };

    void pollOnce();
    const onVisibility = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (!document.hidden && !cancelled) {
        consecutiveIdleOrErr = 0;
        void pollOnce();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isOpen, shareUrl]);

  const toggleAddToGrid = () => {
    setAddToGrid((prev) => {
      const next = !prev;
      localStorage.setItem('cosmo-wifi-add-to-grid', next ? 'true' : 'false');
      return next;
    });
  };

  const toggleAutoRemove = () => {
    setAutoRemoveAfterImport((prev) => {
      const next = !prev;
      localStorage.setItem('cosmo-wifi-auto-remove', next ? 'true' : 'false');
      return next;
    });
  };

  const selectDownloadDir = async () => {
    try {
      let selected: string | null = null;
      try {
        const dialogRes = await open({
          directory: true,
          multiple: false,
          defaultPath: customDownloadDir || undefined
        });
        if (dialogRes && typeof dialogRes === 'string') {
          selected = dialogRes;
        }
      } catch (dialogErr) {
        console.warn('plugin-dialog open failed, attempting backend select_folder_cmd fallback:', dialogErr);
      }

      if (!selected) {
        try {
          const rustRes = await invoke<string>('select_folder_cmd');
          if (rustRes && typeof rustRes === 'string' && rustRes !== 'Cancelled') {
            selected = rustRes;
          }
        } catch { /* ignore native dialog error */ }
      }

      if (selected && typeof selected === 'string') {
        setCustomDownloadDir(selected);
        localStorage.setItem('cosmo-wifi-download-dir', selected);
        try {
          await invoke('save_persistence', { key: 'cosmo-wifi-download-dir', data: selected });
        } catch { /* ignore persistence save failure */ }
        onLog(`Wi-Fi Share: Destination directory set to "${selected}"`);
      }
    } catch (err) {
      console.error('Failed to select directory:', err);
    }
  };

  const resetDownloadDir = () => {
    setCustomDownloadDir('');
    localStorage.removeItem('cosmo-wifi-download-dir');
    invoke('save_persistence', { key: 'cosmo-wifi-download-dir', data: '' }).catch(() => {});
    onLog('Wi-Fi Share: Reset download directory to system Downloads');
  };

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

  const handleCopyToken = async () => {
    if (!pairingToken) return;
    try {
      await navigator.clipboard.writeText(pairingToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
      onLog('Wi-Fi Share: Pairing token copied to clipboard.');
    } catch { /* ignore clipboard write failure */ }
  };

  const handleDeleteRoomFile = async (fileId: string, filename: string, isPhone: boolean) => {
    setRoomFiles((prev) => prev.filter((f) => f.id !== fileId));
    setDeletingFileIds((prev) => new Set(prev).add(fileId));

    if (!isPhone && setWifiShareItems) {
      setWifiShareItems((prev) => prev.filter((f) => f.id !== fileId));
    }

    try {
      await wifiShareFetch(`/api/rooms/local/files/${fileId}`, { method: 'DELETE' });
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

  const handleClearAllSide = async (isPhoneSide: boolean) => {
    const targetFiles = roomFiles.filter((f) => (isPhoneSide ? f.isPhoneUpload : !f.isPhoneUpload));
    if (targetFiles.length === 0) return;

    if (isPhoneSide) {
      setRoomFiles((prev) => prev.filter((f) => !f.isPhoneUpload));
    } else {
      setRoomFiles((prev) => prev.filter((f) => f.isPhoneUpload));
      if (setWifiShareItems) setWifiShareItems([]);
      if (onClearSharedFiles) onClearSharedFiles();
      try {
        await invoke('set_wifi_shared_files', { paths: [] });
      } catch { /* ignore cleanup failure */ }
    }

    await Promise.all(
      targetFiles.map((f) =>
        wifiShareFetch(`/api/rooms/local/files/${f.id}`, { method: 'DELETE' }).catch(() => {})
      )
    );
    onLog(`Wi-Fi Share: Cleared all ${isPhoneSide ? 'incoming phone uploads' : 'outgoing PC shared files'}.`);
  };

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
        fileName: name,
        customDir: customDownloadDir || null
      });
      if (downloadedPath) {
        onLog(`Wi-Fi Share: Download complete. Path: ${downloadedPath}`);
        if (autoRemoveAfterImport) {
          await wifiShareFetch(`/api/rooms/local/files/${fileId}`, { method: 'DELETE' }).catch(() => {});
          setRoomFiles((prev) => prev.filter((f) => f.id !== fileId));
        }
        if (addToGrid) {
          await onAddMultipleFiles([downloadedPath]);
        }
        onClose();
      }
    } catch (err: unknown) {
      console.error(`Wi-Fi Share error downloading ${name}:`, err);
      const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : JSON.stringify(err);
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

  const handleImportAll = async () => {
    const phoneUploads = roomFiles.filter((f) => f.isPhoneUpload);
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
          fileName: file.name,
          customDir: customDownloadDir || null
        });
        if (path) {
          downloadedPaths.push(path);
          successfulFileIds.push(file.id);
          if (autoRemoveAfterImport) {
            await wifiShareFetch(`/api/rooms/local/files/${file.id}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      } catch (err: unknown) {
        console.error(`Wi-Fi Share error downloading ${file.name}:`, err);
        const errStr = typeof err === 'string' ? err : err instanceof Error ? err.message : 'Download error';
        failedFiles.push({ name: file.name, error: errStr });
        onLog(`Wi-Fi Share ERROR: Failed to download "${file.name}": ${errStr}`);
      }
    }

    setIsImportingAll(false);
    setImportProgress(null);

    if (autoRemoveAfterImport && successfulFileIds.length > 0) {
      setRoomFiles((prev) => prev.filter((f) => !successfulFileIds.includes(f.id)));
    }

    if (failedFiles.length > 0) {
      setImportError(
        `Failed to import ${failedFiles.length} of ${phoneUploads.length} file(s). Error: ${failedFiles[0].name} (${failedFiles[0].error})`
      );
    }

    if (downloadedPaths.length > 0) {
      if (addToGrid) {
        onLog(`Wi-Fi Share: Ingesting ${downloadedPaths.length} downloaded file(s) into workspace...`);
        try {
          await onAddMultipleFiles(downloadedPaths);
        } catch (ingestErr: unknown) {
          console.error('Failed to ingest paths:', ingestErr);
          onLog(`Wi-Fi Share ERROR: Failed to add files to workspace: ${String(ingestErr)}`);
        }
      } else {
        onLog(`Wi-Fi Share: Successfully saved ${downloadedPaths.length} file(s) to destination folder.`);
      }

      if (failedFiles.length === 0) {
        onClose();
      }
    }
  };

  const pcFiles = roomFiles.filter((f) => !f.isPhoneUpload);
  const phoneFiles = roomFiles.filter((f) => f.isPhoneUpload);

  return {
    activeTab,
    setActiveTab,
    qrDataUrl,
    shareUrl,
    pairingToken,
    tokenCopied,
    copied,
    receiverConnected,
    loading,
    error,
    importError,
    setImportError,
    isImportingAll,
    importProgress,
    importingFileIds,
    deletingFileIds,
    autoRemoveAfterImport,
    addToGrid,
    customDownloadDir,
    pcFiles,
    phoneFiles,
    toggleAddToGrid,
    toggleAutoRemove,
    selectDownloadDir,
    resetDownloadDir,
    handleCopyLink,
    handleCopyToken,
    handleDeleteRoomFile,
    handleClearAllSide,
    handleImportUploaded,
    handleImportAll
  };
}
