import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { toRealPath, isTauri } from '../utils/videoUtils';
import { wifiShareFetch } from '../utils/wifiShareClient';

interface UseWifiTransferParams {
  videos: VideoItem[];
  selectedIds: Set<string>;
  addLog: (m: string) => void;
  setToast?: (msg: string | null) => void;
  setToastPath?: (path: string | null) => void;
}

export function useWifiTransfer({ videos, selectedIds, addLog, setToast, setToastPath }: UseWifiTransferParams) {
  const [wifiShareOpen, setWifiShareOpen] = useState(false);
  const [volumeRepeatOpen, setVolumeRepeatOpen] = useState(false);
  const [wifiShareItems, setWifiShareItems] = useState<any[]>([]);

  const processingIdsRef = useRef<Set<string>>(new Set());
  const isCheckingRef = useRef(false);

  // Background watcher for incoming mobile transfers (Instant 0-Click direct share)
  // Obeying strict idle budget: completely paused when document is hidden/unfocused!
  useEffect(() => {
    if (!isTauri()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const checkIncomingFiles = async () => {
      if (isCancelled || isCheckingRef.current || document.hidden) return;
      isCheckingRef.current = true;

      try {
        const res = await wifiShareFetch('/api/rooms/local/status?role=sender').catch(() => null);
        if (!res || !res.ok) {
          isCheckingRef.current = false;
          return;
        }

        const data = await res.json().catch(() => null);
        if (!data || !data.success || !data.room || !Array.isArray(data.room.files)) {
          isCheckingRef.current = false;
          return;
        }

        const phoneFiles: any[] = data.room.files.filter((f: any) => f.isPhoneUpload);
        const newFiles = phoneFiles.filter((f: any) => !processingIdsRef.current.has(f.id));

        if (newFiles.length > 0) {
          const customDir = localStorage.getItem('cosmo-wifi-download-dir') || '';
          const destLabel = customDir ? (customDir.split(/[\\/]/).pop() || customDir) : 'Downloads';

          for (const file of newFiles) {
            processingIdsRef.current.add(file.id);
            try {
              const downloadedPath = await invoke<string>('download_shared_file_to_downloads', {
                code: 'local',
                fileId: file.id,
                fileName: file.name,
                customDir: customDir || null
              });

              // Clean up the file from the room queue so it won't be reprocessed
              await wifiShareFetch(`/api/rooms/local/files/${file.id}`, { method: 'DELETE' }).catch(() => {});

              addLog(`⚡ CosmoShare: Auto-saved "${file.name}" to ${destLabel}`);
              setToast?.(`⚡ CosmoShare: Saved "${file.name}" to ${destLabel}!`);
              if (downloadedPath && setToastPath) {
                setToastPath(downloadedPath);
              }
            } catch (err: any) {
              console.warn('[useWifiTransfer] Error auto-downloading shared file:', err);
              processingIdsRef.current.delete(file.id);
            }
          }
        }
      } catch (err) {
        // Silent error ignore on idle check
      } finally {
        isCheckingRef.current = false;
      }
    };

    const clearPollTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const scheduleNextCheck = () => {
      clearPollTimer();
      if (isCancelled || document.hidden) return;
      timer = setTimeout(async () => {
        timer = null;
        if (!document.hidden && !isCancelled) {
          await checkIncomingFiles();
          scheduleNextCheck();
        }
      }, 30000);
    };

    // Trigger immediate check on focus or visibility return; halt polling while hidden
    const handleFocusOrVisibility = () => {
      if (document.hidden) {
        clearPollTimer();
        return;
      }
      checkIncomingFiles();
      scheduleNextCheck();
    };

    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    // Initial check after server starts
    const initialTimer = setTimeout(() => {
      if (!document.hidden) checkIncomingFiles();
    }, 1500);

    if (!document.hidden) scheduleNextCheck();

    return () => {
      isCancelled = true;
      clearTimeout(initialTimer);
      clearPollTimer();
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
    };
  }, [addLog, setToast, setToastPath]);

  const handleTriggerWifiShare = useCallback((targetVideos?: VideoItem[]) => {
    let candidateList: VideoItem[] | undefined = targetVideos;
    if (candidateList && candidateList.length > 0) {
      // User targeted specific video(s)
    } else if (selectedIds.size > 0) {
      candidateList = videos.filter(item => selectedIds.has(item.id));
    } else {
      setWifiShareOpen(true);
      return;
    }

    const resolvedItems = candidateList.map(item => {
      const targetPath = (item.folderFiles && item.currentIdx !== undefined)
        ? (item.folderFiles[item.currentIdx]?.path || item.folderFiles[item.currentIdx]?.url || item.realPath || item.url)
        : (item.realPath || item.url);
      const effectiveRealPath = toRealPath(targetPath) || targetPath;
      const effectiveTitle = (item.folderFiles && item.currentIdx !== undefined)
        ? (item.folderFiles[item.currentIdx]?.name || item.title)
        : item.title;
      return { id: item.id, title: effectiveTitle, url: item.url, realPath: effectiveRealPath };
    });

    const realPaths = resolvedItems.map(x => x.realPath || '').filter(Boolean);
    addLog(`Wi-Fi Share: Preparing ${realPaths.length} file(s) for mobile transfer...`);

    invoke('set_wifi_shared_files', { paths: realPaths })
      .then(() => {
        setWifiShareItems(resolvedItems);
        addLog(`⚡ Wi-Fi Share: Shared ${realPaths.length} file(s) to mobile queue.`);
        setToast?.(`⚡ CosmoShare: Sharing ${realPaths.length} file(s) with mobile.`);
        setWifiShareOpen(true);
      })
      .catch((err) => {
        addLog(`Wi-Fi Share ERROR: ${err}`);
        setWifiShareOpen(true);
      });
  }, [videos, selectedIds, addLog, setToast]);

  return {
    wifiShareOpen,
    setWifiShareOpen,
    volumeRepeatOpen,
    setVolumeRepeatOpen,
    wifiShareItems,
    setWifiShareItems,
    handleTriggerWifiShare,
  };
}

export type UseWifiTransferReturn = ReturnType<typeof useWifiTransfer>;
