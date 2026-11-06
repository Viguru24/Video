import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { toRealPath } from '../utils/videoUtils';

interface UseWifiTransferParams {
  videos: VideoItem[];
  selectedIds: Set<string>;
  addLog: (m: string) => void;
}

export function useWifiTransfer({ videos, selectedIds, addLog }: UseWifiTransferParams) {
  const [wifiShareOpen, setWifiShareOpen] = useState(false);
  const [volumeRepeatOpen, setVolumeRepeatOpen] = useState(false);
  const [wifiShareItems, setWifiShareItems] = useState<any[]>([]);

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
        setWifiShareOpen(true);
      })
      .catch((err) => {
        addLog(`Wi-Fi Share ERROR: ${err}`);
        setWifiShareOpen(true);
      });
  }, [videos, selectedIds, addLog]);

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
