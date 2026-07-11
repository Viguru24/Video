import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { toRealPath, toCosmoUrl, getFileNameFromPath } from '../utils/videoUtils';

interface UseStickerCreatorProps {
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  setSortOrder: (order: string) => void;
  setFocusedId: (id: string | null) => void;
  addLog: (m: string) => void;
}

export function useStickerCreator({
  setVideos,
  setSortOrder,
  setFocusedId,
  addLog
}: UseStickerCreatorProps) {
  const [stickerLoadingId, setStickerLoadingId] = useState<string | null>(null);
  const activeStickerProcessRef = useRef<string | null>(null);

  const handleCreateSticker = async (video: VideoItem) => {
    const rawPath = (video.folderFiles && video.currentIdx !== undefined)
      ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url)
      : (video.realPath || video.url);
      
    if (!rawPath) {
      addLog("Sticker Error: Native path missing");
      return;
    }
    
    const targetPath = toRealPath(rawPath) || rawPath;
    
    setStickerLoadingId(video.id);
    activeStickerProcessRef.current = video.id;
    addLog(`AI: Extracting subject to create sticker from: ${video.title}...`);
    
    try {
      const newPath = await invoke<string>('extract_subject_on_disk', { path: targetPath });
      
      if (activeStickerProcessRef.current !== video.id) {
        addLog(`AI Sticker creation canceled for: ${video.title}`);
        return;
      }
      
      const filename = getFileNameFromPath(newPath);
      const newSticker: VideoItem = {
        id: `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: filename.replace(/\.[^/.]+$/, "") + " (Cutout)",
        url: toCosmoUrl(newPath),
        realPath: newPath,
        repeatMode: 'none',
        repeatCount: 0,
        cols: 1,
        playing: false,
        muted: true,
        created: video.created ? video.created + 1 : Date.now(),
        modified: video.modified ? video.modified + 1 : Date.now()
      };
      setVideos(prev => {
        const idx = prev.findIndex(x => x.id === video.id);
        if (idx === -1) return [...prev, newSticker];
        const next = [...prev];
        next.splice(idx + 1, 0, newSticker);
        return next;
      });
      setSortOrder('custom');
      setFocusedId(newSticker.id);
      addLog(`AI Sticker Success: Cutout generated -> ${filename}`);
    } catch (err) {
      if (activeStickerProcessRef.current === video.id) {
        addLog(`AI Sticker Error: ${err}`);
      }
    } finally {
      if (activeStickerProcessRef.current === video.id) {
        setStickerLoadingId(null);
        activeStickerProcessRef.current = null;
      }
    }
  };

  const handleCancelSticker = () => {
    if (activeStickerProcessRef.current) {
      addLog(`AI Sticker creation canceled by user.`);
      activeStickerProcessRef.current = null;
      setStickerLoadingId(null);
    }
  };

  return {
    stickerLoadingId,
    handleCreateSticker,
    handleCancelSticker
  };
}
