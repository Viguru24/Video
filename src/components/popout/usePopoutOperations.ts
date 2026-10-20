import React, { useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  convertToVideoUrl,
  toCosmoUrl,
  extractBasePrefix,
  safeSetLocalStorage,
} from '../../utils/videoUtils';
import type { VideoItem } from '../../types';

interface UsePopoutOperationsProps {
  activeVideo: VideoItem | null;
  setActiveVideo: React.Dispatch<React.SetStateAction<VideoItem | null>>;
  playlist: VideoItem[];
  setPlaylist: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  onUpdateVideo: (id: any, updates: any) => void;
  addLog: (msg: string) => void;
  setToast: (msg: string | null) => void;
  setAiServerOffline: (offline: boolean) => void;
}

export function usePopoutOperations({
  activeVideo,
  setActiveVideo,
  playlist,
  setPlaylist,
  onUpdateVideo,
  addLog,
  setToast,
  setAiServerOffline,
}: UsePopoutOperationsProps) {
  // Cropping States
  const [cropBox, setCropBox] = useState({ x: 15, y: 15, w: 70, h: 70 });
  const [isCropping, setIsCropping] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>('free');
  const [showSaveCropOptions, setShowSaveCropOptions] = useState(false);

  // Upscale States
  const [upscaleTarget, setUpscaleTarget] = useState<VideoItem | null>(null);
  const [showSaveUpscaleOptions, setShowSaveUpscaleOptions] = useState(false);
  const [upscaleStatus, setUpscaleStatus] = useState<'idle' | 'enhancing' | 'success' | 'failed'>('idle');
  const [enhancingVideoId, setEnhancingVideoId] = useState<string | null>(null);
  const [upscaleProgressPercent, setUpscaleProgressPercent] = useState<number | null>(null);
  const [upscaleStage, setUpscaleStage] = useState<string | null>(null);
  const [lastEnhancedTitle, setLastEnhancedTitle] = useState('');
  const enhancementCancelled = useRef(false);

  const handleSaveCrop = async (overwrite: boolean, useAi: boolean) => {
    try {
      if (!activeVideo) return;
      enhancementCancelled.current = false;
      let img: HTMLImageElement | null = document.querySelector('img.popout-image');

      if (!img || !img.complete || img.naturalWidth === 0) {
        const freshImg = new Image();
        freshImg.crossOrigin = 'anonymous';
        const loadPromise = new Promise<void>((resolve, reject) => {
          freshImg.onload = () => resolve();
          freshImg.onerror = () => reject(new Error('Image failed to load'));
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Image load timed out. Try again.')), 10000)
        );
        freshImg.src = convertToVideoUrl(activeVideo);
        await Promise.race([loadPromise, timeoutPromise]);
        img = freshImg;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get 2d context");

      const cropX = (cropBox.x / 100) * img.naturalWidth;
      const cropY = (cropBox.y / 100) * img.naturalHeight;
      const cropW = (cropBox.w / 100) * img.naturalWidth;
      const cropH = (cropBox.h / 100) * img.naturalHeight;

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(
        img,
        cropX, cropY, cropW, cropH,
        0, 0, cropW, cropH
      );

      const originalPath = activeVideo.realPath || activeVideo.url || '';
      const dotIdx = originalPath.lastIndexOf('.');
      const originalExt = dotIdx !== -1 ? originalPath.substring(dotIdx).toLowerCase() : '.png';
      
      let mimeType = 'image/png';
      if (originalExt === '.jpg' || originalExt === '.jpeg') {
        mimeType = 'image/jpeg';
      } else if (originalExt === '.webp') {
        mimeType = 'image/webp';
      }

      let base64 = canvas.toDataURL(mimeType, mimeType === 'image/png' ? undefined : 0.95);
      setIsCropping(false);
      setShowSaveCropOptions(false);

      const targetId = activeVideo.id;
      const activeVideoCopy = { ...activeVideo };

      (async () => {
        try {
          if (useAi) {
            setEnhancingVideoId(targetId);
            setAiServerOffline(false);
            setUpscaleStatus('enhancing');
            setLastEnhancedTitle('Image Crop');
            try {
              const rawBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
              const enhancedBase64 = await invoke<string>('enhance_image_crop', { base64Data: rawBase64 });
              if (enhancementCancelled.current) return;
              base64 = `data:image/png;base64,${enhancedBase64}`;
              addLog("AI Enhancement successful (4x Resolution)!");
              setUpscaleStatus('success');
            } catch (err) {
              if (enhancementCancelled.current) return;
              console.error("AI Server error:", err);
              setAiServerOffline(true);
              setEnhancingVideoId(null);
              setUpscaleStatus('failed');
              setTimeout(() => setUpscaleStatus('idle'), 5000);
              return;
            }
          }

          if (enhancementCancelled.current) return;
          const separator = activeVideoCopy.realPath?.includes('\\') ? '\\' : '/';
          const dirPath = activeVideoCopy.realPath?.substring(0, activeVideoCopy.realPath.lastIndexOf(separator)) || '';
          const originalFileName = activeVideoCopy.realPath?.substring(activeVideoCopy.realPath.lastIndexOf(separator) + 1) || 'crop.png';

          let fileNameToUse = originalFileName;
          if (!overwrite) {
            const extIdx = originalFileName.lastIndexOf('.');
            const nameWithoutExt = extIdx !== -1 ? originalFileName.substring(0, extIdx) : originalFileName;
            const ext = extIdx !== -1 ? originalFileName.substring(extIdx) : '.png';
            
            const cleanPrefix = extractBasePrefix(nameWithoutExt);
            
            let maxNum = 0;
            try {
              const existingFiles = await invoke<any[]>('get_folder_videos', { path: dirPath, mode: 'all' });
              const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`^${escapeRegExp(cleanPrefix)}_(\\d+)`, 'i');
              for (const file of existingFiles) {
                const fNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
                const match = regex.exec(fNameWithoutExt);
                if (match) {
                  const num = parseInt(match[1], 10);
                  if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                  }
                }
              }
            } catch (e) {
              console.warn("Failed to scan folder, falling back to 0", e);
            }
            
            const nextNum = maxNum + 1;
            fileNameToUse = `${cleanPrefix}_${String(nextNum).padStart(3, '0')}${ext}`;

            let counter = nextNum;
            while (playlist.some(v => v.realPath && v.realPath.toLowerCase().endsWith(fileNameToUse.toLowerCase()))) {
              counter++;
              fileNameToUse = `${cleanPrefix}_${String(counter).padStart(3, '0')}${ext}`;
            }
          }

          const savedPath = await invoke<string>('save_snapshot', {
            base64Data: base64,
            fileName: fileNameToUse,
            customDir: dirPath
          });

          if (overwrite) {
            const cacheBuster = `t=${Date.now()}`;
            onUpdateVideo(targetId, {
              url: `${toCosmoUrl(savedPath)}?${cacheBuster}`,
              realPath: savedPath
            });
            addLog("Media overwritten successfully!");
            setToast("Media overwritten successfully!");
            setTimeout(() => setToast(null), 4000);
          } else {
            const newFileNameWithExt = savedPath.substring(savedPath.lastIndexOf(separator) + 1);
            const extIdx = newFileNameWithExt.lastIndexOf('.');
            const newTitle = extIdx !== -1 ? newFileNameWithExt.substring(0, extIdx) : newFileNameWithExt;

            const newUnit: VideoItem = {
              id: `crop-${Date.now()}`,
              title: newTitle,
              url: toCosmoUrl(savedPath),
              realPath: savedPath,
              currentTime: 0,
              playing: false,
              muted: false,
              repeatMode: 'none',
              repeatCount: 0,
              cols: activeVideoCopy.cols || 1
            };

            setPlaylist(prev => {
              const currentIdx = prev.findIndex(item => item.id === targetId);
              let updated;
              if (currentIdx !== -1) {
                updated = [...prev];
                updated.splice(currentIdx + 1, 0, newUnit);
              } else {
                updated = [...prev, newUnit];
              }
              safeSetLocalStorage('cosmo-v2', JSON.stringify(updated));
              return updated;
            });
            setActiveVideo(newUnit);
            addLog(`Cropped still saved as copy: ${newTitle}`);
            setToast(`Cropped still saved as copy: ${newTitle}`);
            setTimeout(() => setToast(null), 4000);
          }
          setEnhancingVideoId(null);
          setUpscaleStatus('idle');
        } catch (err) {
          console.error("Save crop error:", err);
          addLog(`Save crop failed: ${err}`);
          setEnhancingVideoId(null);
          setUpscaleStatus('idle');
        }
      })();
    } catch (err) {
      console.error("Crop save failed:", err);
      addLog(`Crop failed: ${err}`);
    }
  };

  const handleUpscale = useCallback((v: VideoItem) => {
    const effectiveRealPath = (v.folderFiles && v.currentIdx !== undefined)
      ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
      : v.realPath;
    const effectiveTitle = (v.folderFiles && v.currentIdx !== undefined)
      ? (v.folderFiles[v.currentIdx]?.name || v.title)
      : v.title;

    if (!effectiveRealPath) {
      addLog("Upscale Error: Native path missing.");
      return;
    }
    setUpscaleTarget({
      ...v,
      parentUnitId: v.id,
      realPath: effectiveRealPath,
      title: effectiveTitle,
      folderIdx: (v.folderFiles && v.currentIdx !== undefined) ? v.currentIdx : undefined
    });
    setShowSaveUpscaleOptions(true);
  }, [addLog]);

  const executeUpscale = async (overwrite: boolean) => {
    if (!upscaleTarget) return;
    const v = upscaleTarget;
    setShowSaveUpscaleOptions(false);
    setEnhancingVideoId(v.parentUnitId || v.id);
    setUpscaleStatus('enhancing');
    setLastEnhancedTitle(v.title);
    setUpscaleProgressPercent(null);
    setUpscaleStage(null);
    enhancementCancelled.current = false;

    const isVideo = v.realPath?.toLowerCase().match(/\.(mp4|webm|mov|mkv|avi|ts|mpeg|mpg)$/);
    let unlistenProgress: (() => void) | undefined;

    addLog(`Upscaling: ${v.title} (${overwrite ? 'Overwrite' : 'Save As'}) — running local ${isVideo ? 'video' : 'image'} super-resolution...`);
    try {
      if (isVideo) {
        const win = getCurrentWindow();
        unlistenProgress = await win.listen<{ frame: number, total: number, stage: string }>('upscale-progress', (event) => {
          const { frame, total, stage } = event.payload;
          setUpscaleStage(stage);
          if (stage === 'upscaling' && total > 0) {
            setUpscaleProgressPercent(Math.round((frame / total) * 100));
          } else if (stage === 'extracting') {
            setUpscaleProgressPercent(10);
          } else if (stage === 'assembling') {
            setUpscaleProgressPercent(95);
          }
        });
      }

      const result = await invoke<string>(isVideo ? 'upscale_video' : 'upscale_image', { path: v.realPath, overwrite });
      if (unlistenProgress) unlistenProgress();
      if (enhancementCancelled.current) return;
      
      addLog("Local RTX AI Upscaling Successful!");
      setUpscaleStatus('success');

      if (overwrite) {
        const cacheBuster = `t=${Date.now()}`;
        const newUrl = `${toCosmoUrl(result)}?${cacheBuster}`;
        
        onUpdateVideo(v.parentUnitId || v.id, {
          url: newUrl,
          realPath: result
        });
      } else {
        const separator = result.includes('\\') ? '\\' : '/';
        const fileNameWithExt = result.substring(result.lastIndexOf(separator) + 1);
        const extIdx = fileNameWithExt.lastIndexOf('.');
        const cleanTitle = extIdx !== -1 ? fileNameWithExt.substring(0, extIdx) : fileNameWithExt;

        const newUnit: VideoItem = {
          id: `upscale-${Date.now()}`,
          title: cleanTitle,
          url: toCosmoUrl(result),
          realPath: result,
          currentTime: 0,
          playing: false,
          muted: false,
          repeatMode: 'none',
          repeatCount: 0,
          cols: v.cols || 1
        };

        setPlaylist(prev => {
          const currentIdx = prev.findIndex(item => item.id === (v.parentUnitId || v.id));
          let updated;
          if (currentIdx !== -1) {
            updated = [...prev];
            updated.splice(currentIdx + 1, 0, newUnit);
          } else {
            updated = [...prev, newUnit];
          }
          safeSetLocalStorage('cosmo-v2', JSON.stringify(updated));
          return updated;
        });
        setActiveVideo(newUnit);
      }

      setTimeout(() => {
        setUpscaleStatus('idle');
        setEnhancingVideoId(null);
        setUpscaleProgressPercent(null);
        setUpscaleStage(null);
      }, 5000);

    } catch (err) {
      if (unlistenProgress) unlistenProgress();
      if (enhancementCancelled.current) return;
      console.error("Upscaling failed:", err);
      addLog(`Upscale Failed: ${err}`);
      setUpscaleStatus('failed');
      setTimeout(() => {
        setUpscaleStatus('idle');
        setEnhancingVideoId(null);
        setUpscaleProgressPercent(null);
        setUpscaleStage(null);
      }, 5000);
    }
  };

  const cancelEnhancement = useCallback(() => {
    enhancementCancelled.current = true;
    setUpscaleStatus('idle');
    setEnhancingVideoId(null);
    setUpscaleTarget(null);
    setUpscaleProgressPercent(null);
    setUpscaleStage(null);
    invoke('cancel_video_upscale').catch(err => console.error("Failed to cancel video upscale:", err));
    addLog('Enhancement cancelled by user.');
  }, [addLog]);

  return {
    cropBox,
    setCropBox,
    isCropping,
    setIsCropping,
    aspectRatio,
    setAspectRatio,
    showSaveCropOptions,
    setShowSaveCropOptions,
    handleSaveCrop,
    upscaleTarget,
    setUpscaleTarget,
    showSaveUpscaleOptions,
    setShowSaveUpscaleOptions,
    upscaleStatus,
    setUpscaleStatus,
    enhancingVideoId,
    setEnhancingVideoId,
    upscaleProgressPercent,
    upscaleStage,
    lastEnhancedTitle,
    handleUpscale,
    executeUpscale,
    cancelEnhancement,
  };
}
