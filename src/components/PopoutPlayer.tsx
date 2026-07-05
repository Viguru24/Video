import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Sliders, Crop, Sparkles, Pause, Play, RefreshCw } from 'lucide-react';
import type { VideoItem } from '../types';
import { DEFAULT_COLOR_FILTERS } from '../types';
import { 
  toCosmoUrl, 
  isValidPictureExtension, 
  getFileNameFromPath, 
  convertToVideoUrl,
  pathsEqual,
  extractBasePrefix
} from '../utils/videoUtils';
import { ColorFilterDefs } from './ColorFilterDefs';
import { CropOverlay } from './CropOverlay';
import { ColorAdjustmentPanel } from './ColorAdjustmentPanel';

interface PopoutPlayerProps {
  url: string;
}

const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds === Infinity) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
  return `${mins}:${pad(secs)}`;
};

export function PopoutPlayer({ url }: PopoutPlayerProps) {
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Custom video states
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const isScrubbing = useRef(false);

  // Slideshow state
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);

  // Panel / modal states
  const [colorAdjustId, setColorAdjustId] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 15, y: 15, w: 70, h: 70 });
  const [aspectRatio, setAspectRatio] = useState<'free' | '1:1' | '16:9' | '4:3'>('free');
  const [showSaveCropOptions, setShowSaveCropOptions] = useState(false);

  // Upscale states
  const [upscaleTarget, setUpscaleTarget] = useState<VideoItem | null>(null);
  const [showSaveUpscaleOptions, setShowSaveUpscaleOptions] = useState(false);
  const [upscaleStatus, setUpscaleStatus] = useState<'idle' | 'enhancing' | 'success' | 'failed'>('idle');
  const [upscaleProgressPercent, setUpscaleProgressPercent] = useState<number | null>(null);
  const [upscaleStage, setUpscaleStage] = useState<string | null>(null);
  const [enhancingVideoId, setEnhancingVideoId] = useState<string | null>(null);
  const [lastEnhancedTitle, setLastEnhancedTitle] = useState('');
  const [aiServerOffline, setAiServerOffline] = useState(false);
  const enhancementCancelled = useRef(false);

  // UI elements auto-hide states
  const [showUI, setShowUI] = useState(true);
  const uiTimeoutRef = useRef<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Loader for playlist
  useEffect(() => {
    let initialized = false;
    const raw = localStorage.getItem('cosmo-v2');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPlaylist(parsed);
          const cleanInitialUrl = toCosmoUrl(url);
          const found = parsed.find(v => 
            pathsEqual(v.url, url) || 
            pathsEqual(v.realPath, url) ||
            pathsEqual(v.url, cleanInitialUrl) || 
            pathsEqual(v.realPath, cleanInitialUrl)
          );
          if (found) {
            setActiveVideo(found);
            initialized = true;
          }
        }
      } catch (e) {
        console.error("Failed to parse playlist in popout load:", e);
      }
    }

    if (!initialized) {
      const cleanInitialUrl = toCosmoUrl(url);
      const tempVid: VideoItem = {
        id: 'temp-popout',
        title: localStorage.getItem('cosmo-popout-active-title') || getFileNameFromPath(url) || 'Popped Out Media',
        url: cleanInitialUrl,
        realPath: url,
        currentTime: 0,
        playing: true,
        muted: false,
        repeatMode: 'none',
        repeatCount: 0,
        cols: 1
      };
      setActiveVideo(tempVid);
    }
  }, [url]);

  // Listen to external workspace changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cosmo-v2' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setPlaylist(parsed);
            if (activeVideo) {
              const currentId = activeVideo.id;
              const fresh = parsed.find(x => x.id === currentId);
              if (fresh) {
                setActiveVideo(fresh);
              }
            }
          }
        } catch (err) {
          console.error(err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [activeVideo]);

  // Video Item Updates
  const onUpdateVideo = useCallback((id: string, updates: Partial<VideoItem>) => {
    setPlaylist(prev => {
      const updated = prev.map(v => v.id === id ? { ...v, ...updates } : v);
      localStorage.setItem('cosmo-v2', JSON.stringify(updated));
      return updated;
    });
    setActiveVideo(current => {
      if (current && current.id === id) {
        return { ...current, ...updates };
      }
      return current;
    });
  }, []);

  const mockSetVideos = useCallback((setter: any) => {
    setPlaylist(prev => {
      const next = typeof setter === 'function' ? setter(prev) : setter;
      localStorage.setItem('cosmo-v2', JSON.stringify(next));
      return next;
    });
  }, []);

  // Notifications logger
  const addLog = useCallback((m: string) => {
    console.log("[Popout Logger]:", m);
    if (m.toLowerCase().includes("success") || m.toLowerCase().includes("failed") || m.toLowerCase().includes("saved") || m.toLowerCase().includes("enhanced")) {
      setToast(m);
      setTimeout(() => setToast(null), 3500);
    }
  }, []);



  // Sync video playing status
  useEffect(() => {
    const activeClean = toCosmoUrl(activeVideo?.url || '');
    const activeIsImage = isValidPictureExtension((activeClean || '').split('?')[0]);
    if (activeVideo && !activeIsImage && videoRef.current) {
      if (videoPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [videoPlaying, activeVideo]);

  // Navigation Logic
  const navigate = useCallback((direction: 1 | -1) => {
    if (playlist.length <= 1 || !activeVideo) return;
    
    const activeClean = toCosmoUrl(activeVideo.url || '');
    const activeIsImage = isValidPictureExtension((activeClean || '').split('?')[0]);

    // Filter playlist to keep items of the same type
    const sameTypeItems = playlist.filter(v => {
      const vClean = toCosmoUrl(v.url || '');
      const vIsImage = isValidPictureExtension((vClean || '').split('?')[0]);
      return vIsImage === activeIsImage;
    });

    if (sameTypeItems.length <= 1) return;

    const currentIdx = sameTypeItems.findIndex(v => v.id === activeVideo.id);
    if (currentIdx === -1) return;
    
    let nextIdx = currentIdx + direction;
    if (nextIdx < 0) nextIdx = sameTypeItems.length - 1;
    if (nextIdx >= sameTypeItems.length) nextIdx = 0;
    
    const nextVideo = sameTypeItems[nextIdx];
    setActiveVideo(nextVideo);
    
    // Auto-play videos, stop slideshows
    if (isValidPictureExtension((nextVideo.url || '').split('?')[0])) {
      setVideoPlaying(false);
    } else {
      setVideoPlaying(true);
      setIsSlideshowActive(false);
    }
    
    // Close panels during navigation
    setIsCropping(false);
    setColorAdjustId(null);
  }, [playlist, activeVideo]);

  // Slideshow Logic
  useEffect(() => {
    if (!isSlideshowActive || playlist.length <= 1) return;
    const intervalSec = parseInt(localStorage.getItem('cosmo-rot-int') || '10');
    const timer = setInterval(() => {
      navigate(1);
    }, intervalSec * 1000);
    return () => clearInterval(timer);
  }, [isSlideshowActive, playlist, navigate]);

  // UI Visibility Auto-Hide
  const triggerUIVisibility = useCallback(() => {
    setShowUI(true);
    if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    uiTimeoutRef.current = window.setTimeout(() => {
      if (!isCropping && !colorAdjustId && !showSaveCropOptions && !showSaveUpscaleOptions) {
        setShowUI(false);
      }
    }, 3000);
  }, [isCropping, colorAdjustId, showSaveCropOptions, showSaveUpscaleOptions]);

  useEffect(() => {
    window.addEventListener('mousemove', triggerUIVisibility);
    triggerUIVisibility();
    return () => {
      window.removeEventListener('mousemove', triggerUIVisibility);
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    };
  }, [triggerUIVisibility]);

  // Scroll wheel navigation
  const lastScrollTime = useRef(0);
  const handleWheel = (e: React.WheelEvent) => {
    if (isCropping || colorAdjustId || showSaveCropOptions || showSaveUpscaleOptions) return;
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastScrollTime.current > 600) {
      if (e.deltaY > 0) {
        navigate(1);
        lastScrollTime.current = now;
      } else if (e.deltaY < 0) {
        navigate(-1);
        lastScrollTime.current = now;
      }
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      
      if (key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const activeClean = toCosmoUrl(activeVideo?.url || '');
        const activeIsImage = isValidPictureExtension((activeClean || '').split('?')[0]);
        if (!activeIsImage) {
          setVideoPlaying(p => !p);
        } else {
          setIsSlideshowActive(p => !p);
        }
      } else if (key === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isCropping) {
          setIsCropping(false);
        } else if (colorAdjustId) {
          setColorAdjustId(null);
        } else {
          try {
            const win = getCurrentWindow();
            const isFS = await win.isFullscreen();
            const isMax = await win.isMaximized();
            if (isFS) {
              await win.setFullscreen(false);
            } else if (isMax) {
              await win.unmaximize();
            } else {
              await win.close();
            }
          } catch (err) {
            console.error(err);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [activeVideo, isCropping, colorAdjustId]);

  const toggleMaximize = async () => {
    try {
      const win = getCurrentWindow();
      const isMax = await win.isMaximized();
      if (isMax) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    } catch (err) {
      console.error("Failed to toggle maximize:", err);
    }
  };

  const handleTitlebarMouseDown = async (e: React.MouseEvent) => {
    if (e.button === 0) {
      try {
        const win = getCurrentWindow();
        await win.startDragging();
      } catch (err) {
        console.error("Failed to start dragging:", err);
      }
    }
  };

  // Custom Video Scrubber
  const scrubTrackRef = useRef<HTMLDivElement>(null);
  
  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !scrubTrackRef.current) return;
    const rect = scrubTrackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * videoRef.current.duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleScrubMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isScrubbing.current = true;
    handleScrub(e);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isScrubbing.current || !videoRef.current || !scrubTrackRef.current) return;
      const rect = scrubTrackRef.current.getBoundingClientRect();
      const clickX = moveEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      const newTime = percentage * videoRef.current.duration;
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    };

    const handleMouseUp = () => {
      isScrubbing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !isScrubbing.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setDuration(e.currentTarget.duration);
  };

  // Image Cropping & Upscale Actions
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

            // Double check against playlist memory too to avoid collisions
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
              localStorage.setItem('cosmo-v2', JSON.stringify(updated));
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
          localStorage.setItem('cosmo-v2', JSON.stringify(updated));
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

  // Safe checks
  const displayUrl = activeVideo ? toCosmoUrl(activeVideo.url) : toCosmoUrl(url);
  const cleanActiveUrl = (activeVideo?.url || url).split('?')[0];
  const isImage = isValidPictureExtension(cleanActiveUrl);

  const filters = (activeVideo && activeVideo.colorFilters) || DEFAULT_COLOR_FILTERS;
  const rTemp = filters.temp > 0 ? 1.0 + (filters.temp / 100) * 0.3 : 1.0 + (filters.temp / 100) * 0.15;
  const bTemp = filters.temp < 0 ? 1.0 - (filters.temp / 100) * 0.3 : 1.0 - (filters.temp / 100) * 0.15;
  const gTint = 1.0 + (filters.tint / 250);
  const rTint = 1.0 - (filters.tint / 500);
  const bTint = 1.0 - (filters.tint / 500);

  const finalR = (filters.red * rTemp * rTint).toFixed(4);
  const finalG = (filters.green * gTint).toFixed(4);
  const finalB = (filters.blue * bTemp * bTint).toFixed(4);

  const filterId = activeVideo ? `${activeVideo.id}-popout` : 'none';

  return (
    <div 
      className="popout-root" 
      onWheel={handleWheel}
      onDoubleClick={toggleMaximize}
      style={{ 
        background: '#000', 
        width: '100vw', 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        position: 'relative',
        overflow: 'hidden',
        cursor: showUI ? 'default' : 'none'
      }}
    >
      {/* Subtle title bar region for dragging and maximizing */}
      <div 
        className="popout-titlebar"
        data-tauri-drag-region
        onMouseDown={handleTitlebarMouseDown}
        onDoubleClick={toggleMaximize}
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '40px', 
          zIndex: 99999, 
          background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
          cursor: showUI ? 'default' : 'none',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          color: 'rgba(255, 255, 255, 0.4)',
          fontSize: '11px',
          fontWeight: 'bold',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          pointerEvents: showUI ? 'auto' : 'none',
          userSelect: 'none',
          opacity: showUI ? 1 : 0,
          transition: 'opacity 0.3s ease'
        }}
      >
        <span style={{ pointerEvents: 'none' }}>
          {activeVideo ? activeVideo.title : 'Cosmo Stream'}
        </span>

        {/* Custom Window Controls */}
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', pointerEvents: 'auto' }}>
          <button 
            onClick={() => getCurrentWindow().minimize()}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'rgba(255, 255, 255, 0.45)', 
              cursor: 'pointer',
              fontSize: '12px',
              width: '28px',
              height: '28px',
              borderRadius: '4px',
              transition: 'background-color 0.2s, color 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Minimize"
            onMouseEnter={e => {
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ─
          </button>
          <button 
            onClick={toggleMaximize}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'rgba(255, 255, 255, 0.45)', 
              cursor: 'pointer',
              fontSize: '11px',
              width: '28px',
              height: '28px',
              borderRadius: '4px',
              transition: 'background-color 0.2s, color 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Maximize / Restore"
            onMouseEnter={e => {
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ❑
          </button>
          <button 
            onClick={() => invoke('close_popout').catch(() => getCurrentWindow().close())}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'rgba(255, 255, 255, 0.45)', 
              cursor: 'pointer',
              fontSize: '13px',
              width: '28px',
              height: '28px',
              borderRadius: '4px',
              transition: 'background-color 0.2s, color 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Close"
            onMouseEnter={e => {
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.backgroundColor = '#e81123';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {activeVideo && activeVideo.colorFilters && (
        <ColorFilterDefs
          videoId={filterId}
          finalR={finalR}
          finalG={finalG}
          finalB={finalB}
          alpha={filters.alpha.toString()}
          gamma={filters.gamma}
          negative={filters.negative}
        />
      )}

      {/* Main viewport */}
      <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isImage ? (
          <img 
            className="popout-image"
            src={displayUrl} 
            crossOrigin="anonymous"
            draggable="false"
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain', 
              outline: 'none',
              filter: activeVideo && activeVideo.colorFilters 
                ? `url(#filter-${filterId}) brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) hue-rotate(${filters.hue}deg)` 
                : undefined
            }} 
            alt="Popped Out Still"
          />
        ) : (
          <video 
            ref={videoRef}
            className="popout-video"
            src={displayUrl} 
            autoPlay 
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => navigate(1)}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain', 
              outline: 'none',
              filter: activeVideo && activeVideo.colorFilters 
                ? `url(#filter-${filterId}) brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) hue-rotate(${filters.hue}deg)` 
                : undefined
            }} 
          />
        )}

        {/* Cropping overlay */}
        {isCropping && activeVideo && (
          <CropOverlay 
            video={activeVideo}
            cropBox={cropBox}
            setCropBox={setCropBox}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            onSave={() => setShowSaveCropOptions(true)}
            onCancel={() => setIsCropping(false)}
          />
        )}
      </div>

      {/* Custom float scrub bar (for video only) */}
      {!isImage && activeVideo && (
        <div 
          style={{
            position: 'absolute',
            bottom: '96px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '90%',
            maxWidth: '1200px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: 100000,
            cursor: 'pointer',
            opacity: showUI ? 1 : 0,
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            padding: '0 10px',
            userSelect: 'none',
            pointerEvents: showUI ? 'auto' : 'none'
          }}
        >
          <div 
            ref={scrubTrackRef}
            onMouseDown={handleScrubMouseDown}
            style={{
              position: 'relative',
              flex: 1,
              height: '6px',
              background: 'rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px'
            }}
          >
            <div 
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                background: 'linear-gradient(90deg, var(--accent, #00ff88), #0096ff)',
                borderRadius: '4px',
                boxShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
                width: `${duration ? (currentTime / duration) * 100 : 0}%`
              }}
            />
            <div 
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: '#fff',
                border: '2px solid var(--accent, #00ff88)',
                boxShadow: '0 0 8px rgba(0, 255, 136, 0.8), 0 2px 4px rgba(0,0,0,0.5)',
                left: `${duration ? (currentTime / duration) * 100 : 0}%`,
                transition: 'transform 0.1s ease',
                pointerEvents: 'none'
              }}
            />
          </div>
          <div 
            style={{
              color: '#fff',
              fontSize: '12px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              letterSpacing: '0.5px',
              background: 'rgba(10, 10, 12, 0.75)',
              backdropFilter: 'blur(12px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '4px 10px',
              borderRadius: '12px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
              minWidth: '95px',
              textAlign: 'center'
            }}
          >
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
      )}

      {/* Floating Glassmorphic Solo Control Bar */}
      {activeVideo && !isCropping && (
        <div 
          className="solo-control-bar" 
          style={{
            position: 'absolute',
            bottom: '40px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100000,
            background: 'rgba(10, 10, 12, 0.75)',
            backdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '30px',
            padding: '6px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            opacity: showUI ? 1 : 0,
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            userSelect: 'none',
            pointerEvents: showUI ? 'auto' : 'none'
          }}
        >
          <button 
            onClick={() => {
              if (isImage) {
                setIsSlideshowActive(!isSlideshowActive);
              } else {
                setVideoPlaying(!videoPlaying);
              }
            }}
            style={{
              background: '#00d2ff',
              border: 'none',
              color: '#000',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              cursor: 'pointer',
              boxShadow: '0 0 12px rgba(0, 210, 255, 0.4)'
            }}
            onMouseOver={e => {
              e.currentTarget.style.transform = 'scale(1.08)';
              e.currentTarget.style.boxShadow = '0 0 18px rgba(0, 210, 255, 0.6)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 0 12px rgba(0, 210, 255, 0.4)';
            }}
            title={isImage ? (isSlideshowActive ? "Pause Slideshow" : "Play Slideshow") : (videoPlaying ? "Pause Video" : "Play Video")}
          >
            {isImage ? (
              isSlideshowActive ? <Pause size={16} fill="black" stroke="black" /> : <Play size={16} fill="black" stroke="black" />
            ) : (
              videoPlaying ? <Pause size={16} fill="black" stroke="black" /> : <Play size={16} fill="black" stroke="black" />
            )}
          </button>

          <button 
            onClick={() => setColorAdjustId(activeVideo.id)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '50%',
              transition: 'background 0.2s, transform 0.1s'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Color adjustment"
          >
            <Sliders size={18} />
          </button>

          {isImage && (
            <button 
              onClick={() => {
                setIsCropping(true);
                setCropBox({ x: 15, y: 15, w: 70, h: 70 });
                setAspectRatio('free');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '50%',
                transition: 'background 0.2s, transform 0.1s'
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Crop Image"
            >
              <Crop size={18} />
            </button>
          )}

          {isImage && (
            <button 
              onClick={() => handleUpscale(activeVideo)}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '50%',
                transition: 'background 0.2s, transform 0.1s'
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="✨ AI Upscaling"
            >
              <Sparkles size={18} />
            </button>
          )}

          <button 
            onClick={() => getCurrentWindow().close()}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 'bold',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              borderRadius: '20px',
              padding: '6px 14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginLeft: '4px'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            {isImage ? 'Close' : 'Stop'}
          </button>
        </div>
      )}

      {/* Floating Notifications Toast */}
      {toast && (
        <div 
          style={{
            position: 'absolute',
            top: '60px',
            background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 255, 136, 0.4)',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '11px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            padding: '10px 20px',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 15px rgba(0, 255, 136, 0.2)',
            zIndex: 500000,
            pointerEvents: 'none',
            textAlign: 'center',
            maxWidth: '80%'
          }}
        >
          {toast}
        </div>
      )}

      {/* Popups and Panels */}
      {colorAdjustId && activeVideo && (
        <ColorAdjustmentPanel
          video={activeVideo}
          onUpdateVideo={onUpdateVideo}
          onClose={() => setColorAdjustId(null)}
          setVideos={mockSetVideos}
          addLog={addLog}
        />
      )}

      {showSaveCropOptions && (
        <div
          className="save-crop-options-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(5, 5, 8, 0.85)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300000,
            userSelect: 'none'
          }}
        >
          <div
            style={{
              background: 'rgba(18, 18, 24, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>SAVE CROPPED SELECTION</h2>
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#888' }}>Select how you want to save your cropped asset.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => handleSaveCrop(false, false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                Save as Copy
              </button>
              <button
                onClick={() => handleSaveCrop(true, false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                Overwrite Original
              </button>
              <button
                onClick={() => handleSaveCrop(false, true)}
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))',
                  border: '1px solid rgba(0, 255, 136, 0.35)',
                  color: 'var(--accent, #00ff88)',
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.7)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
                }}
              >
                ✨ Save as Copy & AI Upscale
              </button>
              <button
                onClick={() => handleSaveCrop(true, true)}
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))',
                  border: '1px solid rgba(0, 255, 136, 0.35)',
                  color: 'var(--accent, #00ff88)',
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.7)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
                }}
              >
                ✨ Overwrite & AI Upscale
              </button>
              <button
                onClick={() => setShowSaveCropOptions(false)}
                style={{
                  background: 'rgba(255, 77, 77, 0.1)',
                  border: '1px solid rgba(255, 77, 77, 0.2)',
                  color: '#ff4d4d',
                  borderRadius: '12px',
                  padding: '10px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  transition: 'all 0.2s',
                  marginTop: '10px'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.2)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.1)'}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveUpscaleOptions && (
        <div
          className="save-upscale-options-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(5, 5, 8, 0.85)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300000,
            userSelect: 'none'
          }}
        >
          <div
            style={{
              background: 'rgba(18, 18, 24, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>✨ AI SUPER-RESOLUTION</h2>
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#888' }}>Enhance image resolution 4x using local GPU</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => executeUpscale(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
              >
                Save as Enhanced Copy
              </button>
              <button
                onClick={() => executeUpscale(true)}
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))',
                  border: '1px solid rgba(0, 255, 136, 0.35)',
                  color: 'var(--accent, #00ff88)',
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.7)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
                }}
              >
                Overwrite with Enhanced Version
              </button>

              {/* Hardware Recommendation Note */}
              <div style={{
                background: 'rgba(0, 255, 136, 0.04)',
                border: '1px solid rgba(0, 255, 136, 0.12)',
                borderRadius: '12px',
                padding: '12px',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.7)',
                lineHeight: '1.4',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                marginTop: '10px'
              }}>
                <Sparkles size={14} color="var(--accent, #00ff88)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span>
                  <strong>Hardware Recommendation:</strong> AI super-resolution utilizes hardware acceleration on <strong>NVIDIA graphics cards</strong> (via CUDA) or <strong>AMD graphics cards</strong> (via DirectML) for maximum performance. A high-fidelity bilateral CPU filter fallback is used automatically if compatible graphics hardware is not detected.
                </span>
              </div>

              <button
                onClick={() => setShowSaveUpscaleOptions(false)}
                style={{
                  background: 'rgba(255, 77, 77, 0.1)',
                  border: '1px solid rgba(255, 77, 77, 0.2)',
                  color: '#ff4d4d',
                  borderRadius: '12px',
                  padding: '10px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  transition: 'all 0.2s',
                  marginTop: '10px'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.2)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.1)'}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {upscaleStatus === 'enhancing' && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(5, 5, 8, 0.93)',
            backdropFilter: 'blur(25px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 400000,
            gap: '20px',
            userSelect: 'none',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          <RefreshCw size={48} className="spin" style={{ color: 'var(--accent, #00ff88)' }} />
          <h3 style={{ margin: 0, color: '#fff', fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            ✨ AI Super-Resolution Active
          </h3>
          <p style={{ margin: 0, color: '#ccc', fontSize: '13px' }}>
            {lastEnhancedTitle 
              ? `Processing "${lastEnhancedTitle}"${upscaleProgressPercent !== null ? ` (${upscaleStage}: ${upscaleProgressPercent}%)` : '...'}` 
              : 'Enhancing target, please wait...'}
          </p>
          
          <div style={{ width: '280px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
            <div 
              style={{ 
                height: '100%', 
                background: 'linear-gradient(90deg, var(--accent, #00ff88), #00d2ff)', 
                width: upscaleProgressPercent !== null ? `${upscaleProgressPercent}%` : '5%',
                borderRadius: '3px',
                transition: upscaleProgressPercent !== null ? 'width 0.2s ease-out' : 'none',
                animation: upscaleProgressPercent === null ? 'shimmerBar 40s linear forwards' : 'none'
              }} 
            />
          </div>

          <button
            onClick={cancelEnhancement}
            style={{
              background: 'rgba(255, 77, 77, 0.1)',
              border: '1px solid rgba(255, 77, 77, 0.25)',
              color: '#ff4d4d',
              borderRadius: '12px',
              padding: '10px 24px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              transition: 'all 0.2s',
              marginTop: '15px'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.1)'}
          >
            CANCEL UPSCALE
          </button>
        </div>
      )}
    </div>
  );
}
