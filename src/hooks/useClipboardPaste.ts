import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem, RepeatMode, MediaMode } from '../types';
import { 
  isTauri, 
  toCosmoUrl, 
  getFileNameFromPath, 
  generateUUID 
} from '../utils/videoUtils';

interface UseClipboardPasteProps {
  focusedId: string | null;
  selectedIds: Set<string>;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addLog: (msg: string) => void;
  setToast: (msg: string | null) => void;
  setMediaMode: (mode: MediaMode) => void;
}

export function useClipboardPaste({
  focusedId,
  selectedIds,
  setVideos,
  addLog,
  setToast,
  setMediaMode
}: UseClipboardPasteProps) {
  const handlePasteImage = useCallback((targetTileId?: string | null, customDataUrl?: string) => {
    const processDataUrl = async (dataUrl: string) => {
      const timestamp = Date.now();
      const timeStr = new Date(timestamp).toLocaleTimeString();
      let realPath: string | undefined = undefined;
      let finalUrl = dataUrl;
      let fileTitle = `Screenshot ${timeStr}.png`;

      // In Tauri runtime: save screenshot directly to disk as a real PNG file
      if (isTauri()) {
        try {
          const savedPath = await invoke<string>('save_pasted_clipboard_image', { base64Data: dataUrl });
          if (savedPath) {
            realPath = savedPath;
            finalUrl = toCosmoUrl(savedPath);
            fileTitle = getFileNameFromPath(savedPath);
          }
        } catch (err) {
          console.error("Failed to save screenshot image to disk:", err);
        }
      }

      const targetId = targetTileId || focusedId || (selectedIds.size === 1 ? Array.from(selectedIds)[0] : null);

      if (targetId) {
        setVideos((prev) =>
          prev.map((v) => {
            if (v.id === targetId) {
              return {
                ...v,
                url: finalUrl,
                realPath: realPath || v.realPath,
                title: fileTitle,
              };
            }
            return v;
          })
        );
        addLog(`Pasted screenshot into tile [${targetId}] (${fileTitle})`);
        setToast(`📋 Saved & Pasted: ${fileTitle}`);
        setTimeout(() => setToast(null), 2500);
      } else {
        const newUnit: VideoItem = {
          id: generateUUID(),
          url: finalUrl,
          realPath: realPath,
          title: fileTitle,
          playing: false,
          muted: false,
          repeatMode: 'none' as RepeatMode,
          repeatCount: 1,
          cols: 1,
          modified: Date.now(),
          created: Date.now()
        };
        setVideos((prev) => [newUnit, ...prev]);
        setMediaMode('picture');
        addLog(`Pasted screenshot as new tile [${fileTitle}] → Auto-switched to Stills tab`);
        setToast(`📋 Saved & Pasted: ${fileTitle}`);
        setTimeout(() => setToast(null), 2500);
      }
    };

    if (customDataUrl) {
      processDataUrl(customDataUrl);
      return;
    }

    if (navigator.clipboard && navigator.clipboard.read) {
      navigator.clipboard.read().then(async (items) => {
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const reader = new FileReader();
            reader.onload = (e) => {
              const resultUrl = e.target?.result as string;
              if (resultUrl) processDataUrl(resultUrl);
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
        addLog("No image found on clipboard to paste.");
        setToast("⚠️ No screenshot found on clipboard");
        setTimeout(() => setToast(null), 2500);
      }).catch((err) => {
        console.warn("Clipboard API error:", err);
      });
    }
  }, [focusedId, selectedIds, setVideos, addLog, setToast, setMediaMode]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
        return; // Don't intercept typing in inputs
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              const dataUrl = evt.target?.result as string;
              if (dataUrl) handlePasteImage(undefined, dataUrl);
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePasteImage]);

  return { handlePasteImage };
}
