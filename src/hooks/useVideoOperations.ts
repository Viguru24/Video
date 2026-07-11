import { useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { VideoItem } from '../types';
import { toCosmoUrl, toRealPath, isValidPictureExtension } from '../utils/videoUtils';

interface UseVideoOperationsProps {
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  focusedVideo: VideoItem | null;
  mediaMode: 'all' | 'video' | 'picture';
  setMediaMode: (mode: 'all' | 'video' | 'picture') => void;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addLog: (m: string) => void;
  setToast: (msg: string | null) => void;
  setToastPath: (path: string | null) => void;
}

export function useVideoOperations({
  focusedId,
  setFocusedId,
  focusedVideo,
  mediaMode,
  setMediaMode,
  setVideos,
  addLog,
  setToast,
  setToastPath
}: UseVideoOperationsProps) {
  // Crop states
  const [isCropping, setIsCropping] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 15, y: 15, w: 70, h: 70 });
  const [aspectRatio, setAspectRatio] = useState<'free' | '1:1' | '16:9' | '4:3'>('free');
  const [showSaveCropOptions, setShowSaveCropOptions] = useState(false);

  // Upscale states
  const [showSaveUpscaleOptions, setShowSaveUpscaleOptions] = useState(false);
  const [upscaleTarget, setUpscaleTarget] = useState<VideoItem | null>(null);
  const [enhancingVideoId, setEnhancingVideoId] = useState<string | null>(null);
  const [aiServerOffline, setAiServerOffline] = useState(false);
  const [upscaleStatus, setUpscaleStatus] = useState<'idle' | 'enhancing' | 'success' | 'failed' | 'fallback'>('idle');
  const [upscaleProgressPercent, setUpscaleProgressPercent] = useState<number | null>(null);
  const [upscaleStage, setUpscaleStage] = useState<string | null>(null);
  const [lastEnhancedTitle, setLastEnhancedTitle] = useState('');

  // Resize states
  const [showResizeModal, setShowResizeModal] = useState(false);
  const [resizeTarget, setResizeTarget] = useState<VideoItem | null>(null);

  // Ref to cancel in-progress enhancement
  const enhancementCancelled = useRef(false);

  const handleSaveCrop = async (overwrite: boolean, useAi: boolean) => {
    try {
      if (!focusedId || !focusedVideo) return;

      const originalPath = toRealPath(focusedVideo.realPath || focusedVideo.url) || focusedVideo.realPath || focusedVideo.url;
      if (!originalPath) {
        alert('Could not resolve a disk path for this image. Try re-adding the file.');
        return;
      }

      setIsCropping(false);
      setShowSaveCropOptions(false);

      const targetId = focusedVideo.id;
      const focusedVideoCopy = { ...focusedVideo };

      (async () => {
        try {
          if (useAi) {
            setEnhancingVideoId(targetId);
            setAiServerOffline(false);
            setUpscaleStatus('enhancing');
            setLastEnhancedTitle('Image Crop');
          }

          const savedPath = await invoke<string>('crop_image_on_disk', {
            path: originalPath,
            cropX: cropBox.x,
            cropY: cropBox.y,
            cropW: cropBox.w,
            cropH: cropBox.h,
            overwrite,
          });

          if (useAi) {
            try {
              const response = await fetch(toCosmoUrl(savedPath));
              const blob = await response.blob();
              const rawBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const result = (reader.result as string).split(',')[1];
                  resolve(result);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });

              const enhancedBase64 = await invoke<string>('enhance_image_crop', { base64Data: rawBase64 });
              if (!enhancementCancelled.current) {
                const sep = savedPath.includes('\\') ? '\\' : '/';
                const parts = savedPath.split(sep);
                const fileName = parts.pop()!;
                const parentDir = parts.join(sep);
                await invoke<string>('save_snapshot', {
                  base64Data: `data:image/png;base64,${enhancedBase64}`,
                  fileName,
                  customDir: parentDir
                });
                addLog('AI Enhancement successful (4x Resolution)!');
                setUpscaleStatus('success');
              }
            } catch (err) {
              if (!enhancementCancelled.current) {
                console.error('AI Server error:', err);
                setAiServerOffline(true);
                setUpscaleStatus('failed');
              }
            }
            setEnhancingVideoId(null);
            setTimeout(() => { setUpscaleStatus(current => current === 'enhancing' ? 'enhancing' : 'idle'); }, 5000);
          }

          if (overwrite) {
            setVideos(prev => prev.map(v =>
              v.id === targetId
                ? { ...v, realPath: savedPath, url: `${toCosmoUrl(savedPath)}?t=${Date.now()}` }
                : v
            ));
            addLog(`Original overwritten with crop: ${savedPath}`);
            setToast('Original media overwritten with crop!');
            setToastPath(savedPath);
          } else {
            const sep = savedPath.includes('\\') ? '\\' : '/';
            const fileNameWithExt = savedPath.substring(savedPath.lastIndexOf(sep) + 1);
            const extIdx = fileNameWithExt.lastIndexOf('.');
            const cleanTitle = extIdx !== -1 ? fileNameWithExt.substring(0, extIdx) : fileNameWithExt;

            const newUnit: VideoItem = {
              id: `crop-${Date.now()}`,
              title: cleanTitle,
              url: toCosmoUrl(savedPath),
              realPath: savedPath,
              currentTime: 0,
              repeatMode: 'none',
              repeatCount: 0,
              cols: 1,
              playing: false,
              muted: false
            };

            setVideos(prev => {
              const currentIdx = prev.findIndex(item => item.id === targetId);
              const updated = [...prev];
              if (currentIdx !== -1) {
                updated.splice(currentIdx + 1, 0, newUnit);
              } else {
                updated.push(newUnit);
              }
              return updated;
            });
            setFocusedId(newUnit.id);

            if (mediaMode !== 'picture') {
              setMediaMode('picture');
            }

            addLog(`Crop saved as: ${fileNameWithExt}`);
            setToast(`Crop saved as copy: ${fileNameWithExt}`);
            setToastPath(savedPath);
          }

          setTimeout(() => { setToast(null); setToastPath(null); }, 4000);
        } catch (err) {
          console.error('Crop save failed:', err);
          addLog(`Crop failed: ${err}`);
          setToast(`Crop failed: ${err}`);
          setTimeout(() => { setToast(null); setToastPath(null); }, 5000);
        } finally {
          setEnhancingVideoId(null);
        }
      })();

    } catch (err) {
      console.error('Crop save failed:', err);
      addLog(`Crop failed: ${err}`);
      alert(`Crop failed: ${err}`);
    }
  };

  const handleUpscale = useCallback((v: any) => {
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

  const handleResize = useCallback((v: any) => {
    const effectiveRealPath = (v.folderFiles && v.currentIdx !== undefined)
      ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
      : v.realPath;
    const effectiveTitle = (v.folderFiles && v.currentIdx !== undefined)
      ? (v.folderFiles[v.currentIdx]?.name || v.title)
      : v.title;

    if (!effectiveRealPath) {
      addLog("Resize Error: Native path missing.");
      return;
    }
    setResizeTarget({
      ...v,
      parentUnitId: v.id,
      realPath: effectiveRealPath,
      title: effectiveTitle,
      folderIdx: (v.folderFiles && v.currentIdx !== undefined) ? v.currentIdx : undefined
    });
    setShowResizeModal(true);
  }, [addLog]);

  const handleResizeSuccess = useCallback((newPath: string, overwrite: boolean) => {
    if (!resizeTarget) return;
    const target = resizeTarget;

    setVideos((prev) => {
      let current = [...prev];
      const separator = newPath.includes('\\') ? '\\' : '/';
      const fileName = newPath.substring(newPath.lastIndexOf(separator) + 1);
      const cleanTitle = fileName.replace(/\.[^/.]+$/, "");

      if (overwrite) {
        if (target.folderIdx !== undefined && target.folderFiles) {
          current = current.map((v) => {
            if (v.id === target.parentUnitId && v.folderFiles) {
              const updatedFiles = [...v.folderFiles];
              updatedFiles[target.folderIdx] = {
                ...updatedFiles[target.folderIdx],
                url: toCosmoUrl(newPath) + `?t=${Date.now()}`,
                path: newPath
              };
              return {
                ...v,
                folderFiles: updatedFiles,
                url: v.currentIdx === target.folderIdx ? (toCosmoUrl(newPath) + `?t=${Date.now()}`) : v.url
              };
            }
            return v;
          });
        } else {
          current = current.map((v) => {
            if (v.id === target.parentUnitId) {
              return {
                ...v,
                url: toCosmoUrl(newPath) + `?t=${Date.now()}`,
                realPath: newPath
              };
            }
            return v;
          });
        }
        setToast(`Original media resized successfully!`);
      } else {
        const newUnit = {
          id: `resize-${Date.now()}`,
          title: cleanTitle,
          url: toCosmoUrl(newPath),
          realPath: newPath,
          currentTime: 0,
          repeatMode: 'none' as any,
          playing: false,
          muted: false
        };
        current.push(newUnit);
        setToast(`Resized copy saved: ${cleanTitle}`);
      }
      return current;
    });

    setTimeout(() => setToast(null), 3000);
    setResizeTarget(null);
  }, [resizeTarget, setVideos, setToast]);

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
          if (stage === 'upscaling') {
            if (frame === 0 && !(window as any).__cosmo_vram_loaded) {
              setUpscaleStage('loading_vram');
            } else {
              (window as any).__cosmo_vram_loaded = true;
              setUpscaleStage('upscaling');
            }
            if (total > 0) {
              setUpscaleProgressPercent(Math.round((frame / total) * 100));
            }
          } else {
            setUpscaleStage(stage);
            if (stage === 'extracting') {
              setUpscaleProgressPercent(10);
            } else if (stage === 'assembling') {
              setUpscaleProgressPercent(95);
            }
          }
        });
      } else {
        if (!(window as any).__cosmo_vram_loaded) {
          setUpscaleStage('loading_vram');
          setTimeout(() => {
            if (!(window as any).__cosmo_vram_loaded) {
              setUpscaleStage('upscaling');
            }
          }, 4500);
        } else {
          setUpscaleStage('upscaling');
        }
      }

      const result = await invoke<string>(isVideo ? 'upscale_video' : 'upscale_image', { path: v.realPath, overwrite });
      (window as any).__cosmo_vram_loaded = true;
      if (unlistenProgress) unlistenProgress();
      if (enhancementCancelled.current) return;
      
      const isFallback = result.startsWith('[FALLBACK]');
      const cleanResult = isFallback ? result.substring('[FALLBACK]'.length) : result;
      
      if (isFallback) {
        addLog(`⚠️ Upscale completed with BASIC RESIZE (AI models not found). For true AI super-resolution, place RealESRGAN_x4plus.pth and GFPGANv1.4.pth in .cosmo_models folder.`);
      } else {
        addLog(`Upscale success (AI enhanced): ${cleanResult}`);
      }
      setUpscaleStatus(isFallback ? 'fallback' : 'success');
      
      if (overwrite) {
        const cacheBustUrl = `local://${v.realPath}?t=${Date.now()}`;
        const originalId = focusedId;
        setFocusedId(null);
        await new Promise(resolve => setTimeout(resolve, 120));
        
        setVideos(prev => prev.map(vid => {
          if (vid.id === v.parentUnitId) {
            let updatedFiles = vid.folderFiles;
            if (updatedFiles && v.folderIdx !== undefined) {
              updatedFiles = vid.folderFiles.map((f, idx) => 
                idx === v.folderIdx 
                  ? { ...f, url: cacheBustUrl } 
                  : f
              );
            }
            return {
              ...vid,
              url: cacheBustUrl,
              folderFiles: updatedFiles
            };
          }
          return vid;
        }));
        setFocusedId(originalId);

        setToast(`Original media overwritten with upscaled version!`);
        setToastPath(v.realPath);
        setTimeout(() => {
          setToast(null);
          setToastPath(null);
        }, 4000);
      } else {
        const extIdx = cleanResult.lastIndexOf('.');
        const fileNameWithExt = cleanResult.substring(cleanResult.lastIndexOf(cleanResult.includes('\\') ? '\\' : '/') + 1);
        const cleanTitle = extIdx !== -1 ? fileNameWithExt.substring(0, fileNameWithExt.lastIndexOf('.')) : fileNameWithExt;

        const newUnit: VideoItem = {
          id: `upscale-${Date.now()}`,
          title: cleanTitle,
          url: `local://${cleanResult}`,
          realPath: cleanResult,
          currentTime: v.currentTime || 0,
          repeatMode: v.repeatMode || 'none',
          repeatCount: v.repeatCount || 0,
          cols: v.cols || 1,
          playing: false,
          muted: v.muted || false
        };
        setVideos(prev => {
          const targetId = v.parentUnitId || v.id;
          const currentIdx = prev.findIndex(item => item.id === targetId);
          let updated;
          if (currentIdx !== -1) {
            updated = [...prev];
            updated.splice(currentIdx + 1, 0, newUnit);
          } else {
            updated = [...prev, newUnit];
          }
          return updated;
        });
        setFocusedId(newUnit.id);

        const targetTab = isVideo ? 'video' : 'picture';
        if (mediaMode !== targetTab) {
          setMediaMode(targetTab);
        }

        setToast(`Upscaled copy saved: ${cleanTitle}`);
        setToastPath(cleanResult);
        setTimeout(() => {
          setToast(null);
          setToastPath(null);
        }, 4000);
      }
    } catch (err) {
      if (unlistenProgress) unlistenProgress();
      if (enhancementCancelled.current) return;
      console.error("Upscale failed:", err);
      addLog(`Upscale failed: ${err}`);
      setUpscaleStatus('failed');
    } finally {
      if (!enhancementCancelled.current) {
        setEnhancingVideoId(null);
        setUpscaleTarget(null);
        setUpscaleProgressPercent(null);
        setUpscaleStage(null);
        setTimeout(() => {
          setUpscaleStatus(current => current === 'enhancing' ? 'enhancing' : 'idle');
        }, 5000);
      }
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
    isCropping,
    setIsCropping,
    cropBox,
    setCropBox,
    aspectRatio,
    setAspectRatio,
    showSaveCropOptions,
    setShowSaveCropOptions,
    showSaveUpscaleOptions,
    setShowSaveUpscaleOptions,
    upscaleTarget,
    setUpscaleTarget,
    enhancingVideoId,
    setEnhancingVideoId,
    aiServerOffline,
    setAiServerOffline,
    upscaleStatus,
    setUpscaleStatus,
    upscaleProgressPercent,
    upscaleStage,
    lastEnhancedTitle,
    showResizeModal,
    setShowResizeModal,
    resizeTarget,
    setResizeTarget,
    handleSaveCrop,
    handleUpscale,
    handleResize,
    handleResizeSuccess,
    executeUpscale,
    cancelEnhancement
  };
}
