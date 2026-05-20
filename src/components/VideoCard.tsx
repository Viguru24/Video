import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { startDrag } from '@crabnebula/tauri-plugin-drag';
import { SWIPE_THRESHOLD, SNAPSHOT_TOAST_DURATION, FPS, STEP_INTERVAL, STEP_DELAY } from '../constants';
import { convertToVideoUrl, isValidPictureExtension, isTauri } from '../utils/videoUtils';
import { useStore } from '../store/useStore';
import {
  Play, Pause, Square, RefreshCw, Camera, Repeat, Repeat1,
  Volume2, VolumeX, GripVertical, Maximize2, Minimize2, FolderOpen, X, AlertCircle, ChevronLeft, ChevronRight, Maximize, CheckCircle2, Trash2,
  MoreHorizontal, Eraser
} from 'lucide-react';
import type { VideoItem, RepeatMode } from '../types';


interface VideoCardProps {
  video: VideoItem;
  globalRepeat?: RepeatMode;
  globalSpeed: number;
  fitMode?: 'cover' | 'contain';
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  onRemove: (id: string) => void;
  onAnnihilate: (id: string) => void;
  onLog: (msg: string) => void;
  onFocus: () => void;
  isFocused: boolean;
  onCloseFocus: () => void;
  snapshotDir?: string;
  globalControl: string | null;
  dragListeners?: Record<string, any>;
  dragAttributes?: Record<string, any>;
  masterPlaying: boolean;
  masterMuted: boolean;
  globalVolume: number;
  masterShowUI: boolean;
  toggleMasterMute: (soloId?: string) => void;
  toggleMasterPlay: () => void;
  onEnded: () => void;
  onContextMenu: (x: number, y: number) => void;
  onDeepFocus: (time?: number) => void;
  onUpscale?: (video: VideoItem) => void;
  isVisible: boolean;
  setSnapshotDir?: (dir: string) => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  selectionMode?: boolean;
  focusedId?: string | null;
  inSoloMode?: boolean;
  onNavigateSibling?: (direction: 1 | -1) => void;
  onSelectAll?: () => void;
  isAiEnhancing?: boolean;
}

function VideoCardInternal({
  video, globalRepeat = 'folder', globalSpeed, fitMode = 'contain',
  onUpdateVideo, onRemove, onAnnihilate, onLog, onFocus, isFocused, onCloseFocus,
  snapshotDir, setSnapshotDir, globalControl, dragListeners, dragAttributes,
  masterPlaying, masterMuted, globalVolume, masterShowUI, toggleMasterMute, toggleMasterPlay, onEnded, onContextMenu, onDeepFocus, onUpscale,
  quality = 'high', isVisible, isSelected, onToggleSelect, selectionMode,
  focusedId = null, inSoloMode = false, onNavigateSibling, onSelectAll,
  isAiEnhancing = false
}: VideoCardProps & { quality?: 'low' | 'high' }) {
  const unitRepeatMode = video.repeatMode || 'none';
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastTime = useRef<number>(video.currentTime || 0);
  const lastWheelNav = useRef<number>(0);

  // Preserve time during hibernation
  useEffect(() => {
    if (!isVisible && videoRef.current) {
      lastTime.current = videoRef.current.currentTime;
    }
  }, [isVisible]);

  // Local reload key — incremented after rotation is saved to disk to force image refresh
  const [reloadKey, setReloadKey] = useState(0);

  const setGlobalVolume = useStore((state) => state.setGlobalVolume);
  const setSpeed = useStore((state) => state.setSpeed);

  const [hudData, setHudData] = useState<{ title: string; value: string } | null>(null);
  const hudTimerRef = useRef<number | null>(null);

  const showHudNotification = (title: string, value: string) => {
    setHudData({ title, value });
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = window.setTimeout(() => {
      setHudData(null);
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, []);

  // High-Fidelity Zoom & Pan Engine (Lightroom Protocol)
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPan = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Watermark Auto-Eraser State
  const [isEditingWatermark, setIsEditingWatermark] = useState(false);
  const [boxStart, setBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [boxEnd, setBoxEnd] = useState<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [inpaintedPreview, setInpaintedPreview] = useState<string | null>(null);
  const [isErasingLoading, setIsErasingLoading] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleImageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditingWatermark || inpaintedPreview || isErasingLoading || !imageRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    
    const imgRect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - imgRect.left;
    const y = e.clientY - imgRect.top;
    
    // Clamp to image bounds
    const clampedX = Math.max(0, Math.min(imgRect.width, x));
    const clampedY = Math.max(0, Math.min(imgRect.height, y));
    
    setBoxStart({ x: clampedX, y: clampedY });
    setBoxEnd({ x: clampedX, y: clampedY });
    setIsDrawing(true);
  };

  const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditingWatermark || !isDrawing || !boxStart || inpaintedPreview || isErasingLoading || !imageRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    
    const imgRect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - imgRect.left;
    const y = e.clientY - imgRect.top;
    
    // Clamp to image bounds
    const clampedX = Math.max(0, Math.min(imgRect.width, x));
    const clampedY = Math.max(0, Math.min(imgRect.height, y));
    
    setBoxEnd({ x: clampedX, y: clampedY });
  };

  const handleImageMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditingWatermark || !isDrawing || inpaintedPreview || isErasingLoading) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDrawing(false);
  };

  const handleAutoErase = async () => {
    if (!boxStart || !boxEnd || !imageRef.current) return;
    
    const rectX = Math.min(boxStart.x, boxEnd.x);
    const rectY = Math.min(boxStart.y, boxEnd.y);
    const rectW = Math.abs(boxStart.x - boxEnd.x);
    const rectH = Math.abs(boxStart.y - boxEnd.y);
    
    if (rectW < 5 || rectH < 5) {
      onLog("Please draw a larger selection box");
      return;
    }
    
    const rect = imageRef.current.getBoundingClientRect();
    
    setIsErasingLoading(true);
    try {
      onLog("Auto-detecting watermark contours & inpainting on local RTX GPU...");
      const result = await invoke<string>('auto_erase_watermark', {
        path: video.realPath,
        rectX,
        rectY,
        rectW,
        rectH,
        widthDisp: rect.width,
        heightDisp: rect.height
      });
      setInpaintedPreview(result);
      onLog("Watermark successfully removed! Review preview, then click Save & Apply.");
    } catch (e) {
      console.error(e);
      onLog(`Error removing watermark: ${e}`);
    } finally {
      setIsErasingLoading(false);
    }
  };

  const handleSaveInpainted = async () => {
    if (!inpaintedPreview) return;
    
    try {
      onLog("Saving clean image on disk...");
      await invoke('save_inpainted_image', {
        path: video.realPath,
        base64Data: inpaintedPreview
      });
      
      const newKey = Date.now();
      setReloadKey(newKey);
      onLog("Watermark removed and original file overwritten successfully!");
      
      // Clear state and exit editing mode
      setInpaintedPreview(null);
      setBoxStart(null);
      setBoxEnd(null);
      setIsEditingWatermark(false);
    } catch (e) {
      console.error(e);
      onLog(`Failed to save: ${e}`);
    }
  };

  const handleResetEraser = () => {
    setInpaintedPreview(null);
    setBoxStart(null);
    setBoxEnd(null);
    setIsDrawing(false);
    onLog("Watermark eraser selection reset.");
  };

  const handleCancelEraser = () => {
    setInpaintedPreview(null);
    setBoxStart(null);
    setBoxEnd(null);
    setIsDrawing(false);
    setIsEditingWatermark(false);
    onLog("Watermark editing cancelled.");
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditingWatermark) return;
    if (isFocused) {
      if (e.altKey && e.button === 0 && zoomScale === 1) {
        e.preventDefault();
        e.stopPropagation();

        const rect = cardRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = e.clientX - (rect.left + rect.width / 2);
        const mouseY = e.clientY - (rect.top + rect.height / 2);

        const nextScale = 3.0;
        const ratio = nextScale / 1;
        const newPanX = mouseX - (mouseX - panOffset.x) * ratio;
        const newPanY = mouseY - (mouseY - panOffset.y) * ratio;
        setPanOffset({ x: newPanX, y: newPanY });
        setZoomScale(nextScale);
        return;
      }

      if (zoomScale > 1 && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        setIsPanning(true);
        startPan.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
        return;
      }
    }

    if (e.button === 0 && video.realPath) {
      const target = e.target as HTMLElement;
      if (
        !target.closest('button') &&
        !target.closest('input') &&
        !target.closest('.drag-handle-mini') &&
        !target.closest('.tel-item') &&
        !target.closest('.card-controls')
      ) {
        // Require Shift key for OS drag-out to prevent conflict with DND-Kit internal reordering
        if (e.shiftKey) {
          dragStartPos.current = { x: e.clientX, y: e.clientY };
          onLog("Hold Shift + Drag to export file to desktop/folders");
        }
      }
    }
  };

  // Reset zoom on focus/solo exit
  useEffect(() => {
    if (!isFocused) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      setIsPanning(false);
    }
  }, [isFocused]);

  // Reset zoom on source/url changes (navigation)
  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, [video.url]);

  // Reset zoom/pan when entering watermark editing mode
  useEffect(() => {
    if (isEditingWatermark) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      setIsPanning(false);
    }
  }, [isEditingWatermark]);

  // Global Mouse Panning Engine — Unbounded and immune to screen edges/stuck conditions
  useEffect(() => {
    if (!isPanning) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (zoomScale > 1) {
        const newX = e.clientX - startPan.current.x;
        const newY = e.clientY - startPan.current.y;
        setPanOffset({ x: newX, y: newY });
      }
    };

    const handleGlobalMouseUp = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    window.addEventListener('mouseup', handleGlobalMouseUp, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isPanning, zoomScale]);

  // DYNAMIC QUALITY ENGINE (v4) — Native Asset Protocol
  const displayUrl = React.useMemo(() => {
    const url = convertToVideoUrl(video);
    let busted = url;
    if (video.url && video.url.includes('?t=')) {
      const tParam = video.url.split('?t=')[1];
      busted = `${url}${url.includes('?') ? '&' : '?'}t=${tParam}`;
    } else if (reloadKey > 0) {
      busted = `${url}${url.includes('?') ? '&' : '?'}t=${reloadKey}`;
    }
    return busted;
  }, [video.realPath, video.url, reloadKey]);

  // Reset playback position when source changes (folder cycling)
  useEffect(() => {
    lastTime.current = 0;
  }, [displayUrl]);


  const isImage = React.useMemo(() => {
    return isValidPictureExtension(video.realPath || video.url);
  }, [video.realPath, video.url]);

  useEffect(() => {
    if (!isImage && videoRef.current) {
      const vol = Number.isFinite(globalVolume) ? Math.max(0, Math.min(1, globalVolume)) : 0;
      videoRef.current.volume = vol;
    }
  }, [globalVolume, isImage]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(masterPlaying);
  const [recovering, setRecovering] = useState(false);

  const [snapshotToast, setSnapshotToast] = useState<number | null>(null);
  const [isLocalFS, setIsLocalFS] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [showCardMenu, setShowCardMenu] = useState(false);

  useEffect(() => {
    if (isHovered || isInteracting || isFocused || showCardMenu) {
      setShowControls(true);
    } else {
      setShowControls(false);
    }
  }, [isHovered, isInteracting, isFocused, showCardMenu]);

  // Click outside handler to dismiss the card action menu
  useEffect(() => {
    if (!showCardMenu) return;
    const handleDocumentClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowCardMenu(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', handleDocumentClick);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [showCardMenu]);

  const [duration, setDuration] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);


  const handleTimeUpdate = () => {
    if (videoRef.current) {
      // Direct DOM manipulation to bypass React render cycle for 60FPS smoothness
      const duration = videoRef.current.duration;
      const currentTime = videoRef.current.currentTime;
      if (duration > 0) {
        const p = (currentTime / duration) * 100;
        const val = isNaN(p) ? 0 : p;
        if (progressRef.current) progressRef.current.style.width = `${val}%`;
        if (handleRef.current) handleRef.current.style.left = `${val}%`;
        if (textRef.current) textRef.current.textContent = `${Math.round(val)}%`;
      }
    }
  };


  const isScrubbing = useRef(false);
  const stepInterval = useRef<NodeJS.Timeout | null>(null);

  const handleScrub = useCallback((e: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent) => {
    if (!videoRef.current) return;
    const scrubEl = document.querySelector(`[data-id="${video.id}"] .scrub-container`);
    if (!scrubEl) return;
    const rect = scrubEl.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const x = clientX - rect.left;
    const p = Math.max(0, Math.min(1, x / rect.width));
    videoRef.current.currentTime = p * videoRef.current.duration;
    if (progressRef.current) progressRef.current.style.width = `${p * 100}%`;
    if (handleRef.current) handleRef.current.style.left = `${p * 100}%`;
    if (textRef.current) textRef.current.textContent = `${Math.round(p * 100)}%`;
  }, [video.id]);


  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (isScrubbing.current) {
        setIsInteracting(true);
        handleScrub(e);
      }
    };
    const onUp = () => {
      setIsInteracting(false);
      stopStep();
      isScrubbing.current = false;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [handleScrub]);


  const stepFrame = (dir: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += dir * (1 / FPS);
      onUpdateVideo(video.id, { playing: false });
    }
  };

  const startStep = (dir: number) => {
    setIsInteracting(true);
    stepFrame(dir);

    if (stepInterval.current) clearInterval(stepInterval.current);
    stepInterval.current = setTimeout(() => {
      stepInterval.current = setInterval(() => {
        stepFrame(dir);
      }, STEP_INTERVAL);

    }, STEP_DELAY);
  };

  const stopStep = () => {
    setIsInteracting(false);

    if (stepInterval.current) {
      clearTimeout(stepInterval.current);
      clearInterval(stepInterval.current);
      stepInterval.current = null;
    }
  };

  useEffect(() => {
    const handleFS = () => setIsLocalFS(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFS);
    return () => document.removeEventListener('fullscreenchange', handleFS);
  }, []);

  const handleMuteToggle = () => {
    // If master is overriding, turn it off first but solo this video
    if (masterMuted) {
      toggleMasterMute(video.id);
    } else {
      // Then toggle individual video
      onUpdateVideo(video.id, { muted: !video.muted });
    }
  };
  
  // Determine effective mute state: master override takes precedence
  // Also, if another video (or this video) is maximized in solo mode,
  // mute this grid instance to avoid double audio.
  const effectiveMuted = masterMuted || video.muted || (!!focusedId && !inSoloMode);
  
  useEffect(() => {
    if (isImage || !videoRef.current) return;
    videoRef.current.muted = effectiveMuted;
  }, [effectiveMuted, isImage]);

   useEffect(() => {
     if (isImage || !videoRef.current) return;
     // If a video is focused/maximized and this is a background grid instance, pause it to save CPU and avoid double audio
     if (focusedId && !inSoloMode) {
       videoRef.current.pause();
     } else {
       if (video.playing) videoRef.current.play().catch(() => {});
       else videoRef.current.pause();
     }
   }, [video.playing, isImage, focusedId, inSoloMode]);

  useEffect(() => {
    if (isImage || !videoRef.current) return;
    if (video.currentTime !== undefined) {
      if (Math.abs(videoRef.current.currentTime - video.currentTime) > 0.5) {
        videoRef.current.currentTime = video.currentTime;
      }
      lastTime.current = video.currentTime;
    }
  }, [video.currentTime, isImage]);

  useEffect(() => {
    if (isImage) return;
    const v = videoRef.current;
    if (v) v.playbackRate = globalSpeed;
  }, [globalSpeed, isImage]);

  // RECOVERY MONITOR: Only for video elements
  useEffect(() => {
    if (isImage) return;
    const v = videoRef.current;
    if (!v) return;
    const monitor = setInterval(() => {
      if (video.playing && v.paused && !v.ended && v.readyState < 2 && !recovering) {
        setRecovering(true);
        setError("RECOVERING...");
        setTimeout(() => {
          v.load();
          setError(null);
          setRecovering(false);
        }, 3000);
      }
    }, 5000);
    return () => clearInterval(monitor);
  }, [video.playing, video.url, recovering, isImage]);

  // IMAGE FOLDER NAVIGATION: Cycle through folder files for image units
  const navigateImageFolder = useCallback((dir: number) => {
    if (!video.folderFiles || video.folderFiles.length <= 1) return;
    const currentIdx = video.currentIdx || 0;
    const nextIdx = (currentIdx + dir + video.folderFiles.length) % video.folderFiles.length;
    const nextFile = video.folderFiles[nextIdx];
    if (nextFile) {
      onUpdateVideo(video.id, {
        currentIdx: nextIdx,
        url: nextFile.url,
        realPath: (nextFile as any).path || nextFile.url,
        title: nextFile.name
      });
      onLog(`Image Navigate [${video.title}] → ${nextFile.name}`);
    }
  }, [video.id, video.folderFiles, video.currentIdx, video.title, onUpdateVideo, onLog]);

  const takeSnapshot = useCallback(async () => {
    try {
      // For images, snapshot = copy the source file
      if (isImage) {
        let dirToUse = snapshotDir;
        if (isTauri() && (!dirToUse || dirToUse.trim() === "")) {
          onLog("SYSTEM: No snapshot directory set. Please select a destination.");
          const newDir = await invoke<string | null>('select_folder_cmd');
          if (newDir) {
            dirToUse = newDir;
            if (setSnapshotDir) setSnapshotDir(newDir);
            await invoke('save_persistence', { key: 'cosmo-snap-dir', data: newDir });
            onLog(`SNAPSHOT DESTINATION SET: ${newDir}`);
          } else {
            onLog("ERROR: Snapshot aborted (No directory selected)");
            return;
          }
        }
        // Use the image element to capture
        const imgEl = document.querySelector(`[data-id="${video.id}"] img`) as HTMLImageElement;
        if (imgEl) {
          const rotation = video.rotation || 0;
          const normalizedRotation = ((rotation % 360) + 360) % 360;
          const isLandscape = normalizedRotation === 90 || normalizedRotation === 270;

          const c = document.createElement('canvas');
          c.width = isLandscape ? imgEl.naturalHeight : imgEl.naturalWidth;
          c.height = isLandscape ? imgEl.naturalWidth : imgEl.naturalHeight;
          
          const ctx = c.getContext('2d');
          if (!ctx) return;
          
          ctx.translate(c.width / 2, c.height / 2);
          ctx.rotate((normalizedRotation * Math.PI) / 180);
          ctx.drawImage(imgEl, -imgEl.naturalWidth / 2, -imgEl.naturalHeight / 2, imgEl.naturalWidth, imgEl.naturalHeight);
          
          const base64 = c.toDataURL('image/png');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const fileName = `Cosmo_${video.title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;

          if (isTauri()) {
            const path = await invoke<string>('save_snapshot', { base64Data: base64, fileName, customDir: dirToUse });
            onLog(`SUCCESS: Snapshot saved to ${path.split(/[\\/]/).pop()}`);
          } else {
            const link = document.createElement('a');
            link.download = fileName;
            link.href = base64;
            link.click();
            onLog(`SUCCESS: Snapshot downloaded as ${fileName}`);
          }
          const toastId = Date.now();
          setSnapshotToast(toastId);
          setTimeout(() => setSnapshotToast(current => current === toastId ? null : current), SNAPSHOT_TOAST_DURATION);
        }
        return;
      }

      const v = videoRef.current;
      if (!v || v.videoWidth === 0) return;

      let dirToUse = snapshotDir;
      // ENFORCEMENT: Force directory selection if not already set (only if in Tauri)
      if (isTauri() && (!dirToUse || dirToUse.trim() === "")) {
         onLog("SYSTEM: No snapshot directory set. Please select a destination.");
         const newDir = await invoke<string | null>('select_folder_cmd');
         if (newDir) {
            dirToUse = newDir;
            if (setSnapshotDir) setSnapshotDir(newDir);
            // Save immediately for persistence robustness
            await invoke('save_persistence', { key: 'cosmo-snap-dir', data: newDir });
            onLog(`SNAPSHOT DESTINATION SET: ${newDir}`);
         } else {
            onLog("ERROR: Snapshot aborted (No directory selected)");
            return;
         }
      }

      const c = document.createElement('canvas');
      const rotation = video.rotation || 0;
      const normalizedRotation = ((((rotation % 360) + 360) % 360));
      const isLandscape = normalizedRotation === 90 || normalizedRotation === 270;

      c.width = isLandscape ? v.videoHeight : v.videoWidth;
      c.height = isLandscape ? v.videoWidth : v.videoHeight;
      
      const ctx = c.getContext('2d');
      if (!ctx) return;
      
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((normalizedRotation * Math.PI) / 180);
      ctx.drawImage(v, -v.videoWidth / 2, -v.videoHeight / 2, v.videoWidth, v.videoHeight);
      
      const base64 = c.toDataURL('image/png');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Cosmo_${video.title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;

      if (isTauri()) {
        const path = await invoke<string>('save_snapshot', {
          base64Data: base64,
          fileName: fileName,
          customDir: dirToUse
        });

        onLog(`SUCCESS: Snapshot saved to ${path.split(/[\\/]/).pop()}`);
      } else {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = base64;
        link.click();
        onLog(`SUCCESS: Snapshot downloaded as ${fileName}`);
      }
      
      // TRIGGER NOTIFICATION
      const toastId = Date.now();
      setSnapshotToast(toastId);
      setTimeout(() => {
        setSnapshotToast(current => current === toastId ? null : current);
      }, SNAPSHOT_TOAST_DURATION);

    } catch (err) { 
      onLog(`CRITICAL ERROR: Snapshot failed - ${err}`); 
    }
  }, [video.title, video.id, video.realPath, video.rotation, snapshotDir, setSnapshotDir, onLog, isImage]);

  useEffect(() => {
    if (!globalControl) return;
    const firstDash = globalControl.indexOf('-');
    if (firstDash === -1) return;
    const type = globalControl.slice(0, firstDash);
    const id = globalControl.slice(firstDash + 1, globalControl.lastIndexOf('-')); // extract ID assuming ID contains dashes but date is appended after last dash
    
    // Safer check: if it doesn't include the video ID at all, ignore
    if (!globalControl.includes(video.id)) return;

    if (type === 'snapshot') takeSnapshot();
    if (type === 'stop') {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [globalControl, video.id, takeSnapshot]);

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTap = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Double tap detected!
      e.preventDefault();
      if (isFocused) {
        // Toggle play/pause
        onUpdateVideo(video.id, { playing: !video.playing });
      } else {
        // Enlarge
        onDeepFocus(videoRef.current ? videoRef.current.currentTime : undefined);
      }
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;

    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: now,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const touchEnd = e.changedTouches[0];
    const deltaX = touchStart.current.x - touchEnd.clientX;
    const deltaY = touchStart.current.y - touchEnd.clientY;
    const duration = Date.now() - touchStart.current.time;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (duration < 500 && (absX > SWIPE_THRESHOLD || absY > SWIPE_THRESHOLD)) {
      if (isFocused) {
        if (absX > absY) {
          // Horizontal Swipe -> navigate
          if (deltaX > SWIPE_THRESHOLD) {
            // Swipe Left -> Go to Next video
            if (onNavigateSibling) onNavigateSibling(1);
          } else if (deltaX < -SWIPE_THRESHOLD) {
            // Swipe Right -> Go to Previous video
            if (onNavigateSibling) onNavigateSibling(-1);
          }
        } else {
          // Vertical Swipe -> volume or speed
          const startX = touchStart.current.x;
          const isRightSide = startX > window.innerWidth / 2;

          if (isRightSide) {
            if (deltaY > SWIPE_THRESHOLD) {
              setGlobalVolume((prev) => {
                const next = Math.min(1, prev + 0.1);
                showHudNotification('VOLUME', `${Math.round(next * 100)}%`);
                return next;
              });
            } else if (deltaY < -SWIPE_THRESHOLD) {
              setGlobalVolume((prev) => {
                const next = Math.max(0, prev - 0.1);
                showHudNotification('VOLUME', `${Math.round(next * 100)}%`);
                return next;
              });
            }
          } else {
            if (deltaY > SWIPE_THRESHOLD) {
              setSpeed((prev) => {
                const next = Math.min(4, prev + 0.25);
                showHudNotification('SPEED', `${next.toFixed(2)}x`);
                return next;
              });
            } else if (deltaY < -SWIPE_THRESHOLD) {
              setSpeed((prev) => {
                const next = Math.max(0.25, prev - 0.25);
                showHudNotification('SPEED', `${next.toFixed(2)}x`);
                return next;
              });
            }
          }
        }
      } else {
        // Not focused -> swipe Up/Down expands/collapses focus
        if (absY > absX && absY > SWIPE_THRESHOLD) {
          if (deltaY > 0) {
            // Swipe Up -> Expand
            onDeepFocus();
          } else {
            // Swipe Down -> Collapse
            onCloseFocus();
          }
        }
      }
    }
    touchStart.current = null;
  };

  useEffect(() => {
    if (!isHovered || isFocused) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          onUpdateVideo(video.id, { rotation: (video.rotation || 0) + 90 });
          onLog(`Rotated Right: ${video.title}`);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onUpdateVideo(video.id, { rotation: (video.rotation || 0) - 90 });
          onLog(`Rotated Left: ${video.title}`);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHovered, isFocused, video.id, video.rotation, video.title, onUpdateVideo, onLog]);

  // AUTO-SAVE ROTATION TO DISK (debounced 1.5s after last rotation change)
  useEffect(() => {
    const rotation = video.rotation || 0;
    const normalized = ((rotation % 360) + 360) % 360;
    if (normalized === 0 || !video.realPath) return;

    const timer = setTimeout(() => {
      onLog(`Auto-saving rotation (${normalized}°) to disk: ${video.title}...`);
      invoke<string>('rotate_media_on_disk', {
        path: video.realPath,
        rotation: rotation,
        isImage: isImage
      })
        .then(() => {
          // Reset CSS rotation to 0 (pixels are now baked) and bump reloadKey to force image refresh
          onUpdateVideo(video.id, { rotation: 0 });
          setReloadKey(k => k + Date.now());
          onLog(`Rotation saved to disk: ${video.title}`);
        })
        .catch((err) => {
          console.error('Auto-save rotation failed:', err);
          onLog(`Rotation save failed: ${err}`);
        });
    }, 1500);

    return () => clearTimeout(timer);
  }, [video.rotation, video.realPath, video.id, video.title, video.url, isImage, onUpdateVideo, onLog]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartPos.current && video.realPath) {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 8) {
        const path = video.realPath;
        dragStartPos.current = null;

        const isImg = isValidPictureExtension(path);
        const iconPath = isImg 
          ? path 
          : "C:\\Users\\louis\\OneDrive\\Documents\\GitHub\\Video\\src-tauri\\icons\\icon.png";

        startDrag({
          item: [path],
          icon: iconPath,
        }).catch(err => {
          console.error("Native drag failed:", err);
        });

        onLog(`Started native drag-out of: ${video.title}`);
      }
    }
  };

  const handleMouseUp = () => {
    dragStartPos.current = null;
  };

  // Enable horizontal drag on grid cards for mobile swiping gestures.
  // IMPORTANT: dragConstraints MUST be a stable memoized object — passing a new
  // inline object literal on every render causes Framer Motion to update its
  // internal state every frame, triggering an infinite re-render loop.
  const dragProps = useMemo(() => {
    const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isTouchDevice || isFocused || selectionMode) return {};
    return {
      drag: "x" as const,
      dragConstraints: { left: 0, right: 0 },
      dragElastic: 0.6,
      onDragEnd: (_event: any, info: any) => {
        if (info.offset.x > 120) {
          // Swipe Right -> Rotate +90
          onUpdateVideo(video.id, { rotation: (video.rotation || 0) + 90 });
          onLog(`Rotated Right via Swipe: ${video.title}`);
        } else if (info.offset.x < -120) {
          // Swipe Left -> Decommission
          onRemove(video.id);
          onLog(`Decommissioned via Swipe: ${video.title}`);
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, selectionMode, video.id, video.rotation, video.title]);

  return (
    <motion.div
      ref={cardRef}
      className={`video-card ${recovering ? 'recovering' : ''} ${isFocused ? 'focused' : ''} ${showControls ? 'ui-visible' : 'ui-hidden'}`}
      {...dragProps}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); dragStartPos.current = null; }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={() => onDeepFocus(videoRef.current ? videoRef.current.currentTime : undefined)}
      onWheel={(e) => {
        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          const direction = e.deltaY > 0 ? 90 : -90;
          onUpdateVideo(video.id, { rotation: (video.rotation || 0) + direction });
          onLog(`Rotated ${direction > 0 ? 'Right' : 'Left'}: ${video.title}`);
        } else if (e.altKey && isFocused) {
          e.preventDefault();
          e.stopPropagation();
          
          const rect = cardRef.current?.getBoundingClientRect();
          if (!rect) return;

          const mouseX = e.clientX - (rect.left + rect.width / 2);
          const mouseY = e.clientY - (rect.top + rect.height / 2);

          setZoomScale(prev => {
            const factor = e.deltaY < 0 ? 1.25 : 0.8;
            const next = Math.max(1, Math.min(8, prev * factor));
            if (next <= 1.05) {
              setPanOffset({ x: 0, y: 0 });
              return 1;
            }
            const ratio = next / prev;
            const newPanX = mouseX - (mouseX - panOffset.x) * ratio;
            const newPanY = mouseY - (mouseY - panOffset.y) * ratio;
            setPanOffset({ x: newPanX, y: newPanY });
            return next;
          });
        } else if (isFocused && isImage) {
          e.preventDefault();
          e.stopPropagation();
          const now = Date.now();
          // 400ms throttle cooldown to prevent rapid scrolling skipping pictures
          if (now - lastWheelNav.current > 400) {
            lastWheelNav.current = now;
            const direction = e.deltaY > 0 ? 1 : -1;
            if (video.folderFiles && video.folderFiles.length > 1) {
              navigateImageFolder(direction);
            } else if (onNavigateSibling) {
              onNavigateSibling(direction);
            }
          }
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
      data-id={video.id}
      style={{
        border: (selectionMode && isSelected) ? '2px solid var(--accent)' : undefined,
        boxShadow: (selectionMode && isSelected) ? '0 0 20px rgba(0,255,136,0.3)' : undefined,
        cursor: isFocused && zoomScale > 1 ? (isPanning ? 'grabbing' : 'grab') : undefined
      }}
    >
      {isVisible && !isAiEnhancing ? (
        isImage ? (
          isEditingWatermark ? (
            <div
              className="watermark-edit-container"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                cursor: 'crosshair',
                userSelect: 'none',
                overflow: 'hidden',
                backgroundColor: '#000'
              }}
              onMouseDown={handleImageMouseDown}
              onMouseMove={handleImageMouseMove}
              onMouseUp={handleImageMouseUp}
            >
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  pointerEvents: 'none'
                }}
              >
                <img
                  ref={imageRef}
                  key={inpaintedPreview ? `preview-${reloadKey}` : `orig-${displayUrl}`}
                  src={inpaintedPreview ? `data:image/png;base64,${inpaintedPreview}` : displayUrl}
                  alt={video.title}
                  crossOrigin="anonymous"
                  draggable="false"
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '100%', 
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    imageOrientation: 'none',
                    display: 'block'
                  }}
                />
                {boxStart && boxEnd && (
                  <div
                    className="watermark-selection-box"
                    style={{
                      position: 'absolute',
                      border: '2px dashed var(--accent, #00ff88)',
                      background: 'rgba(0, 255, 136, 0.15)',
                      boxShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
                      left: Math.min(boxStart.x, boxEnd.x),
                      top: Math.min(boxStart.y, boxEnd.y),
                      width: Math.abs(boxStart.x - boxEnd.x),
                      height: Math.abs(boxStart.y - boxEnd.y),
                      pointerEvents: 'none',
                      zIndex: 10
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <img
              key={displayUrl}
              src={displayUrl}
              alt={video.title}
              crossOrigin="anonymous"
              draggable="false"
              data-zoom={zoomScale}
              data-pan-x={panOffset.x}
              data-pan-y={panOffset.y}
              data-rotation={video.rotation || 0}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: fitMode,
                imageOrientation: 'none', 
                backgroundColor: '#000',
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale}) rotate(${video.rotation || 0}deg)`,
                transition: isPanning ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />
          )
        ) : (
          <video
            key={displayUrl}
            ref={videoRef}
            src={displayUrl}
            draggable="false"
            crossOrigin="anonymous"
            playsInline
            loop={true}
            muted={effectiveMuted}
            onEnded={onEnded}
            onTimeUpdate={handleTimeUpdate}
            data-zoom={zoomScale}
            data-pan-x={panOffset.x}
            data-pan-y={panOffset.y}
            data-rotation={video.rotation || 0}
            onLoadedMetadata={() => {
              setDuration(videoRef.current?.duration || 0);
              if (lastTime.current > 0 && videoRef.current) {
                videoRef.current.currentTime = lastTime.current;
              }
              setError(null);
              
              if (video.playing && videoRef.current) {
                videoRef.current.play().catch(e => console.warn("Autoplay failed:", e));
              }
            }}
            onError={(e) => {
              const friendlyError = "LOAD ERROR";
              setError(friendlyError);
              onLog(`Unit [${video.title}] Error: ${friendlyError}`);
            }}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: fitMode, 
              backgroundColor: '#000',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale}) rotate(${video.rotation || 0}deg)`,
              transition: isPanning ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          />
        )
      ) : (
        isAiEnhancing ? (
          <div className="video-hibernate" style={{ background: '#000' }}>
            <div className="hibernate-label" style={{ color: 'var(--accent)', animation: 'pulse 1s infinite alternate' }}>
              ENHANCING PROTOCOL ACTIVE...
            </div>
          </div>
        ) : (
          <div className="video-hibernate">
            <div className="hibernate-shimmer" />
            <div className="hibernate-label">HIBERNATING...</div>
          </div>
        )
      )}

      {error && (
        <div className="unit-error-overlay">
          <AlertCircle size={20} color="var(--danger)" />
          <p>{error}</p>
          <button className="retry-btn" onClick={() => { videoRef.current?.load(); setError("RETRYING..."); }}>
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      {snapshotToast && (
        <div key={snapshotToast} className="snapshot-toast">SNAPSHOT SAVED</div>
      )}

      {!isEditingWatermark && (
        <div className={`video-overlay ${(selectionMode || (showControls || isFocused)) && masterShowUI ? 'visible' : 'hidden'}`}>
        {selectionMode && (
          <div 
            className={`selection-indicator ${isSelected ? 'selected' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
            onContextMenu={(e) => {
              if (onSelectAll) {
                e.preventDefault();
                e.stopPropagation();
                onSelectAll();
              }
            }}
            data-tooltip="Select (Right click: Select All)"
          >
            {isSelected ? <CheckCircle2 size={18} fill="var(--accent)" color="black" /> : <div className="indicator-empty" />}
          </div>
        )}
        {isFocused && (
          <div className="focused-exit-overlay" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {isImage && onUpscale && (
              <button
                className="exit-focus-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpscale(video);
                }}
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))',
                  border: '1px solid rgba(0, 255, 136, 0.35)',
                  boxShadow: '0 0 15px rgba(0, 255, 136, 0.15)',
                  color: 'var(--accent)',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '12px',
                  padding: '8px 16px',
                  height: '36px',
                  cursor: 'pointer',
                  width: 'auto',
                  pointerEvents: 'auto'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.7)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
                }}
                data-tooltip="Upscale using RTX GPU"
              >
                <span>✨ AI UPSCALE</span>
              </button>
            )}
            <button 
              className="exit-focus-btn" 
              onClick={() => onDeepFocus(videoRef.current ? videoRef.current.currentTime : undefined)} 
              data-tooltip="Exit Enlarge Mode"
              style={{ height: '36px', width: '36px', pointerEvents: 'auto' }}
            >
              <Minimize2 size={18} />
            </button>
          </div>
        )}

        {!isFocused && (
          <div className="overlay-header" style={{ background: 'transparent', backdropFilter: 'none', borderBottom: 'none', padding: '8px' }}>
            <div className="drag-handle-mini" {...dragListeners} {...dragAttributes} style={{ pointerEvents: 'auto' }}>
              <GripVertical size={16} />
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); onRemove(video.id); }} 
              className="premium-close-btn"
              data-tooltip="DECOMMISSION UNIT"
              style={{ 
                background: 'rgba(0,0,0,0.5)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '50%', 
                width: '24px', 
                height: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#aaa',
                pointerEvents: 'auto',
                marginLeft: 'auto'
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Centre: click to toggle play or select */}
        <div className="overlay-center" onClick={() => {
          if (selectionMode && onToggleSelect) {
            onToggleSelect();
          } else if (!isImage) {
            onUpdateVideo(video.id, { playing: !video.playing });
          }
        }}>
          
          <motion.div 
            initial={false}
            animate={{ opacity: showControls ? 1 : 0, scale: showControls ? 1 : 0.8 }}
            className="play-indicator-subtle"
          >
             {!selectionMode && !isImage && (video.playing ? <Pause size={24} fill="rgba(255,255,255,0.4)" color="transparent" /> : <Play size={24} fill="rgba(255,255,255,0.4)" color="transparent" />)}
          </motion.div>
        </div>

        {!isFocused && (
          <div className="overlay-footer" style={{ background: 'transparent', backdropFilter: 'none', borderTop: 'none', padding: '8px' }}>
            {/* SCRUB BAR: Video only */}
            {!isImage && (
              <div 
                className="scrub-container" 
                onMouseDown={(e) => { isScrubbing.current = true; handleScrub(e); }}
              >
                <div className="scrub-bar-bg">
                  <div ref={progressRef} className="scrub-progress" style={{ width: '0%' }} />
                </div>
                <div ref={handleRef} className="scrub-handle" style={{ left: '0%' }} />
                <div ref={textRef} className="progress-text">0%</div>
              </div>
            )}

            {/* IMAGE FOLDER COUNTER */}
            {isImage && video.folderFiles && video.folderFiles.length > 1 && (
              <div className="image-counter" style={{ fontSize: '10px', opacity: 0.6, textAlign: 'center', padding: '2px 0', letterSpacing: '1px' }}>
                {(video.currentIdx || 0) + 1} / {video.folderFiles.length}
              </div>
            )}

            <div className="mini-controls" onDoubleClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
              {isImage ? (
                /* IMAGE CONTROLS */
                <>
                  <button 
                    className="mini-btn" 
                    onClick={() => onDeepFocus()} 
                    data-tooltip="Enlarge" 
                    style={{ background: 'transparent', width: '22px', height: '22px' }}
                  >
                    <Maximize2 size={12} />
                  </button>
                  
                  {onToggleSelect && !selectionMode && (
                    <button 
                      className={`mini-btn ${isSelected ? 'active-accent' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
                      onContextMenu={(e) => {
                        if (onSelectAll) {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectAll();
                        }
                      }}
                      data-tooltip="Select"
                      style={{ background: 'transparent', width: '22px', height: '22px' }}
                    >
                      <CheckCircle2 size={12} />
                    </button>
                  )}

                  <button 
                    className={`mini-btn ${showCardMenu ? 'active-accent' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setShowCardMenu(!showCardMenu); }}
                    data-tooltip="Actions"
                    style={{ background: 'transparent', width: '22px', height: '22px' }}
                  >
                    <MoreHorizontal size={12} />
                  </button>
                </>
              ) : (
                /* VIDEO CONTROLS */
                <>
                  <button 
                    className="mini-btn highlight" 
                    onClick={() => onUpdateVideo(video.id, { playing: !video.playing })}
                    data-tooltip={video.playing ? "Pause" : "Play"}
                    style={{ background: 'transparent', width: '22px', height: '22px' }}
                  >
                    {video.playing ? <Pause size={12} fill="white" /> : <Play size={12} fill="white" />}
                  </button>

                  <button 
                    className="mini-btn" 
                    onClick={handleMuteToggle} 
                    data-tooltip={effectiveMuted ? "Unmute" : "Mute"}
                    style={{ background: 'transparent', width: '22px', height: '22px' }}
                  >
                    {effectiveMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  </button>
                  
                  <button 
                    className="mini-btn" 
                    onClick={() => onDeepFocus(videoRef.current ? videoRef.current.currentTime : undefined)} 
                    data-tooltip="Enlarge"
                    style={{ background: 'transparent', width: '22px', height: '22px' }}
                  >
                    <Maximize2 size={12} />
                  </button>
                  
                  {onToggleSelect && !selectionMode && (
                    <button 
                      className={`mini-btn ${isSelected ? 'active-accent' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
                      onContextMenu={(e) => {
                        if (onSelectAll) {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectAll();
                        }
                      }}
                      data-tooltip="Select"
                      style={{ background: 'transparent', width: '22px', height: '22px' }}
                    >
                      <CheckCircle2 size={12} />
                    </button>
                  )}
                  
                  <button 
                    className={`mini-btn ${showCardMenu ? 'active-accent' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setShowCardMenu(!showCardMenu); }}
                    data-tooltip="Actions"
                    style={{ background: 'transparent', width: '22px', height: '22px' }}
                  >
                    <MoreHorizontal size={12} />
                  </button>
                </>
              )}
            </div>
            
            {/* CARD ACTION MENU */}
            {showCardMenu && (
              <div 
                className="card-action-menu"
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <div className="card-menu-header">
                  <span>ACTIONS</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowCardMenu(false); }} 
                    className="card-menu-close"
                  >
                    <X size={10} />
                  </button>
                </div>
                <div className="card-menu-items">
                  {isImage ? (
                    <>
                      <button 
                        className="card-menu-item" 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setIsEditingWatermark(true); 
                          setShowCardMenu(false); 
                        }}
                      >
                        <Eraser size={12} />
                        <span>Erase Watermark</span>
                      </button>
                      <button className="card-menu-item" onClick={(e) => { e.stopPropagation(); takeSnapshot(); setShowCardMenu(false); }}>
                        <Camera size={12} />
                        <span>Save Snapshot</span>
                      </button>
                      {onSelectAll && (
                        <button 
                          className="card-menu-item" 
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAll();
                            setShowCardMenu(false);
                          }}
                        >
                          <CheckCircle2 size={12} />
                          <span>Select All</span>
                        </button>
                      )}
                      <button 
                        className="card-menu-item danger" 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          onAnnihilate(video.id); 
                          setShowCardMenu(false); 
                        }}
                      >
                        <Trash2 size={12} />
                        <span>Recycle Bin</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="card-menu-row">
                        <button 
                          className="card-menu-item-half" 
                          onMouseDown={(e) => { e.stopPropagation(); startStep(-1); }} 
                          onMouseUp={(e) => { e.stopPropagation(); stopStep(); }} 
                          onMouseLeave={(e) => { e.stopPropagation(); stopStep(); }}
                        >
                          <ChevronLeft size={12} />
                          <span>Step Back</span>
                        </button>
                        <button 
                          className="card-menu-item-half" 
                          onMouseDown={(e) => { e.stopPropagation(); startStep(1); }} 
                          onMouseUp={(e) => { e.stopPropagation(); stopStep(); }} 
                          onMouseLeave={(e) => { e.stopPropagation(); stopStep(); }}
                        >
                          <ChevronRight size={12} />
                          <span>Step Fwd</span>
                        </button>
                      </div>
                      <button className="card-menu-item" onClick={(e) => { e.stopPropagation(); takeSnapshot(); setShowCardMenu(false); }}>
                        <Camera size={12} />
                        <span>Save Snapshot</span>
                      </button>
                      <button 
                        className="card-menu-item" 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          onUpdateVideo(video.id, { repeatMode: unitRepeatMode === 'always' ? 'none' : 'always' }); 
                        }}
                      >
                        <Repeat1 size={12} />
                        <span>Loop: {unitRepeatMode === 'always' ? 'ON' : 'OFF'}</span>
                      </button>
                      {onSelectAll && (
                        <button 
                          className="card-menu-item" 
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAll();
                            setShowCardMenu(false);
                          }}
                        >
                          <CheckCircle2 size={12} />
                          <span>Select All</span>
                        </button>
                      )}
                      <button 
                        className="card-menu-item danger" 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          onAnnihilate(video.id); 
                          setShowCardMenu(false); 
                        }}
                      >
                        <Trash2 size={12} />
                        <span>Recycle Bin</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {isEditingWatermark && (
        <div className="watermark-editor-toolbar premium-glass" onMouseDown={(e) => e.stopPropagation()}>
          <div className="toolbar-header">
            <span className="toolbar-title">✨ WATERMARK AUTO-ERASER</span>
            {isErasingLoading && <span className="toolbar-status pulse">PROCESSING...</span>}
          </div>
          <div className="toolbar-actions">
            {!inpaintedPreview ? (
              <button 
                className="toolbar-btn primary"
                onClick={(e) => { e.stopPropagation(); handleAutoErase(); }}
                disabled={isErasingLoading || !boxStart || !boxEnd}
              >
                {isErasingLoading ? (
                  <RefreshCw size={12} className="spin" />
                ) : (
                  <CheckCircle2 size={12} />
                )}
                <span>Auto Erase</span>
              </button>
            ) : (
              <button 
                className="toolbar-btn success"
                onClick={(e) => { e.stopPropagation(); handleSaveInpainted(); }}
                disabled={isErasingLoading}
              >
                <CheckCircle2 size={12} />
                <span>Save & Apply</span>
              </button>
            )}
            
            <button 
              className="toolbar-btn secondary"
              onClick={(e) => { e.stopPropagation(); handleResetEraser(); }}
              disabled={isErasingLoading || (!boxStart && !inpaintedPreview)}
            >
              <RefreshCw size={12} />
              <span>Reset</span>
            </button>
            
            <button 
              className="toolbar-btn danger"
              onClick={(e) => { e.stopPropagation(); handleCancelEraser(); }}
              disabled={isErasingLoading}
            >
              <X size={12} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}
      {hudData && (
        <div className="hud-overlay">
          <div className="hud-badge">
            <span className="hud-title">{hudData.title}</span>
            <span className="hud-value">{hudData.value}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
class UnitErrorBoundary extends React.Component<{ children: React.ReactNode, id: string }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode, id: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="video-card ui-visible" style={{ border: '2px solid var(--danger)', padding: 10, background: '#000000' }}>
          <div className="unit-error-overlay" style={{ position: 'relative', height: '100%' }}>
            <AlertCircle size={24} color="var(--danger)" />
            <p style={{ margin: '10px 0', fontSize: 12, wordBreak: 'break-all' }}>UNIT CRASH: {this.state.error?.message}</p>
            <button className="retry-btn" onClick={() => this.setState({ hasError: false, error: null })}>
              <RefreshCw size={14} /> RECOVER
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const VideoCard = React.memo((props: any) => (
  <UnitErrorBoundary id={props.video.id}>
    <VideoCardInternal {...props} />
  </UnitErrorBoundary>
));
