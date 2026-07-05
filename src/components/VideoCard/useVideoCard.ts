import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { startDrag } from '@crabnebula/tauri-plugin-drag';
import { SWIPE_THRESHOLD, SNAPSHOT_TOAST_DURATION, FPS, STEP_INTERVAL, STEP_DELAY } from '../../constants';
import { convertToVideoUrl, isValidPictureExtension, isTauri, toCosmoUrl, showConfirm } from '../../utils/videoUtils';
import { useStore } from '../../store/useStore';
import type { VideoItem, RepeatMode } from '../../types';
import { DEFAULT_COLOR_FILTERS } from '../../types';

export interface UseVideoCardProps {
  video: VideoItem;
  globalRepeat?: RepeatMode;
  globalSpeed: number;
  onUpdateVideo: (id: any, updates: any) => void;
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
  onToggleSelect?: (shiftKey?: boolean, ctrlKey?: boolean) => void;
  selectionMode?: boolean;
  focusedId?: string | null;
  inSoloMode?: boolean;
  onNavigateSibling?: (direction: 1 | -1) => void;
  onSelectAll?: () => void;
  isAiEnhancing?: boolean;
  isSlideshowActive?: boolean;
  setIsSlideshowActive?: (active: boolean) => void;
  onColorAdjust?: (id: string) => void;
  onStartCrop?: (id: string) => void;
  isCropping?: boolean;
  onAddVideo?: (newVideo: VideoItem) => void;
  isStickerLoading?: boolean;
  onCreateSticker?: (video: VideoItem) => void;
  quality?: 'low' | 'high';
}

// Global module-level registry to deduplicate rapid globalControl actions (e.g. double click/double firing)
const lastProcessedActions = new Map<string, number>();

export function useVideoCard({
  video, globalRepeat = 'folder', globalSpeed,
  onUpdateVideo, onRemove, onAnnihilate, onLog, onFocus, isFocused, onCloseFocus,
  snapshotDir, setSnapshotDir, globalControl, dragListeners, dragAttributes,
  masterPlaying, masterMuted, globalVolume, masterShowUI, toggleMasterMute, toggleMasterPlay, onEnded, onContextMenu, onDeepFocus, onUpscale,
  quality = 'high', isVisible, isSelected, onToggleSelect, selectionMode,
  focusedId = null, inSoloMode = false, onNavigateSibling, onSelectAll,
  isAiEnhancing = false,
  isSlideshowActive = false, setIsSlideshowActive, onColorAdjust, onStartCrop,
  isCropping = false,
  onAddVideo,
  isStickerLoading = false,
  onCreateSticker
}: UseVideoCardProps) {
  const filterSuffix = inSoloMode ? 'solo' : 'grid';
  const filterId = `${video.id}-${filterSuffix}`;
  const unitRepeatMode = video.repeatMode || 'none';
  const filters = video.colorFilters || DEFAULT_COLOR_FILTERS;
  const rTemp = filters.temp > 0 ? 1.0 + (filters.temp / 100) * 0.3 : 1.0 + (filters.temp / 100) * 0.15;
  const bTemp = filters.temp < 0 ? 1.0 - (filters.temp / 100) * 0.3 : 1.0 - (filters.temp / 100) * 0.15;
  const gTint = 1.0 + (filters.tint / 250);
  const rTint = 1.0 - (filters.tint / 500);
  const bTint = 1.0 - (filters.tint / 500);

  const finalR = (filters.red * rTemp * rTint).toFixed(4);
  const finalG = (filters.green * gTint).toFixed(4);
  const finalB = (filters.blue * bTemp * bTint).toFixed(4);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHoldingToCutout, setIsHoldingToCutout] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTime = useRef<number>(video.currentTime || 0);
  const lastWheelNav = useRef<number>(0);
  const lastProcessedControlRef = useRef<string | null>(null);

  // Preserve time during hibernation
  useEffect(() => {
    if (!isVisible && videoRef.current) {
      lastTime.current = videoRef.current.currentTime;
    }
  }, [isVisible]);

  // Local reload key — incremented after rotation is saved to disk to force image refresh
  const [reloadKey, setReloadKey] = useState(0);

  const isImage = React.useMemo(() => {
    return isValidPictureExtension(video.realPath || video.url);
  }, [video.realPath, video.url]);

  const isAudio = React.useMemo(() => {
    const url = video.realPath || video.url || '';
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    return ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'wma', 'aac', 'alac', 'mp3a'].includes(ext);
  }, [video.realPath, video.url]);

  const songInfo = React.useMemo(() => {
    if (!isAudio) return null;
    if (video.realPath) {
      const parts = video.realPath.split(/[\\/]/);
      if (parts.length >= 3) {
        const title = parts[parts.length - 1].replace(/\.[^/.]+$/, "");
        const album = parts[parts.length - 2];
        const band = parts[parts.length - 3];
        const genericFolders = ['music', 'download', 'downloads', 'documents', 'desktop', 'github', 'video', 'audios', 'assets', 'vocal', 'instrumental'];
        if (!genericFolders.includes(band.toLowerCase())) {
          return { band, album, title };
        }
      }
    }
    const titleParts = video.title.split(' - ');
    if (titleParts.length >= 3) {
      return {
        band: titleParts[0].trim(),
        album: titleParts[1].trim(),
        title: titleParts.slice(2).join(' - ').replace(/\.[^/.]+$/, "").trim()
      };
    } else if (titleParts.length === 2) {
      return {
        band: titleParts[0].trim(),
        album: "Single",
        title: titleParts[1].replace(/\.[^/.]+$/, "").trim()
      };
    }
    return {
      band: "Unknown Artist",
      album: "Unknown Album",
      title: video.title.replace(/\.[^/.]+$/, "")
    };
  }, [isAudio, video.title, video.realPath]);

  const setGlobalVolume = useStore((state) => state.setGlobalVolume);
  const setSpeed = useStore((state) => state.setSpeed);
  const immersive = useStore((state) => state.immersive);
  const selectedIds = useStore((state) => state.selectedIds);
  const enableSlideshowPanZoom = useStore((state) => state.enableSlideshowPanZoom);

  const animationIndex = useMemo(() => {
    let hash = 0;
    const str = video.id || '';
    for (let i = 0; i < str.length; i++) {
      hash += str.charCodeAt(i);
    }
    return hash % 4;
  }, [video.id]);

  const animationClass = useMemo(() => {
    switch (animationIndex) {
      case 0: return 'kb-zoom-top-center';
      case 1: return 'kb-zoom-top-left';
      case 2: return 'kb-zoom-bottom-right';
      case 3: default: return 'kb-zoom-out-pan';
    }
  }, [animationIndex]);

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

    // Handle middle click (roller button click) to rotate
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      const direction = e.shiftKey ? -90 : 90;
      const isBatch = selectedIds.size > 0 && selectedIds.has(video.id);
      if (isBatch) {
        onUpdateVideo(Array.from(selectedIds), (prev: any) => ({
          rotation: (prev.rotation || 0) + direction
        }));
        onLog(`Batch Rotated ${direction > 0 ? 'Right' : 'Left'} via Middle Click: ${selectedIds.size} assets`);
      } else {
        onUpdateVideo(video.id, { rotation: (video.rotation || 0) + direction });
        onLog(`Rotated ${direction > 0 ? 'Right' : 'Left'} via Middle Click: ${video.title}`);
      }
      return;
    }

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
        !target.closest('.card-controls') &&
        !target.closest('.scrub-container') &&
        !target.closest('.focused-scrub-container')
      ) {
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        
        if (isImage && !isAiEnhancing && !isStickerLoading) {
          setIsHoldingToCutout(true);
          if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
          holdTimerRef.current = setTimeout(() => {
            setIsHoldingToCutout(false);
            if (onCreateSticker) {
              onCreateSticker(video);
            }
          }, 1200);
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

  // Reset zoom/pan when entering cropping mode
  useEffect(() => {
    if (isCropping) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      setIsPanning(false);
    }
  }, [isCropping]);

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

  // Hover-to-Play: play video on hover in grid mode, pause on mouse-out
  const hoverPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingBeforeHover = useRef<boolean>(false);
  const hasHovered = useRef<boolean>(false);

  useEffect(() => {
    if (isImage || isFocused || inSoloMode) return;

    if (isHovered) {
      hasHovered.current = true;
      hoverPlayTimerRef.current = setTimeout(() => {
        const vid = videoRef.current;
        if (!vid) return;
        wasPlayingBeforeHover.current = !vid.paused;
        vid.play().catch(() => {});
      }, 150);
    } else {
      if (hoverPlayTimerRef.current) {
        clearTimeout(hoverPlayTimerRef.current);
        hoverPlayTimerRef.current = null;
      }
      
      if (hasHovered.current) {
        const vid = videoRef.current;
        if (vid) {
          if (!wasPlayingBeforeHover.current) {
            vid.pause();
          }
        }
        hasHovered.current = false;
      }
    }

    return () => {
      if (hoverPlayTimerRef.current) {
        clearTimeout(hoverPlayTimerRef.current);
        hoverPlayTimerRef.current = null;
      }
    };
  }, [isHovered, isImage, isFocused, inSoloMode]);

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

  // Focused Scrubber Refs
  const focusedProgressRef = useRef<HTMLDivElement>(null);
  const focusedHandleRef = useRef<HTMLDivElement>(null);
  const focusedTimeTextRef = useRef<HTMLDivElement>(null);
  const focusedScrubContainerRef = useRef<HTMLDivElement>(null);
  const focusedTrackRef = useRef<HTMLDivElement>(null);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds === Infinity) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleFocusedScrub = useCallback((e: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent) => {
    if (!videoRef.current) return;
    const trackEl = focusedTrackRef.current;
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const x = clientX - rect.left;
    const p = Math.max(0, Math.min(1, x / rect.width));
    const duration = videoRef.current.duration || 0;
    const currentTime = p * duration;
    videoRef.current.currentTime = currentTime;
    
    if (focusedProgressRef.current) focusedProgressRef.current.style.width = `${p * 100}%`;
    if (focusedHandleRef.current) focusedHandleRef.current.style.left = `${p * 100}%`;
    if (focusedTimeTextRef.current) {
      focusedTimeTextRef.current.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    }
  }, []);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      const currentTime = videoRef.current.currentTime;
      if (duration > 0) {
        const p = (currentTime / duration) * 100;
        const val = isNaN(p) ? 0 : p;
        if (progressRef.current) progressRef.current.style.width = `${val}%`;
        if (handleRef.current) handleRef.current.style.left = `${val}%`;
        if (textRef.current) textRef.current.textContent = `${Math.round(val)}%`;

        if (focusedProgressRef.current) focusedProgressRef.current.style.width = `${val}%`;
        if (focusedHandleRef.current) focusedHandleRef.current.style.left = `${val}%`;
        if (focusedTimeTextRef.current) {
          focusedTimeTextRef.current.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
        }
      }
    }
  };

  const isScrubbing = useRef(false);
  const stepInterval = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (isFocused) {
          handleFocusedScrub(e);
        } else {
          handleScrub(e);
        }
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
  }, [handleScrub, handleFocusedScrub, isFocused]);

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

  function stopStep() {
    setIsInteracting(false);
    if (stepInterval.current) {
      clearTimeout(stepInterval.current);
      clearInterval(stepInterval.current);
      stepInterval.current = null;
    }
  }

  useEffect(() => {
    const handleFS = () => setIsLocalFS(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFS);
    return () => document.removeEventListener('fullscreenchange', handleFS);
  }, []);

  const handleMuteToggle = () => {
    if (inSoloMode) {
      toggleMasterMute(video.id);
    } else {
      if (masterMuted) {
        toggleMasterMute(video.id);
        onUpdateVideo(video.id, { muted: false });
      } else {
        onUpdateVideo(video.id, { muted: !video.muted });
      }
    }
  };
  
  const effectiveMuted = inSoloMode ? masterMuted : (masterMuted || video.muted || (!!focusedId && !inSoloMode));
  
  useEffect(() => {
    if (isImage || !videoRef.current) return;
    videoRef.current.muted = effectiveMuted;
  }, [effectiveMuted, isImage]);

  useEffect(() => {
    if (isImage || !videoRef.current) return;
    if (focusedId && focusedId !== video.id && !inSoloMode) {
      videoRef.current.pause();
    } else {
      if (video.playing) videoRef.current.play().catch(() => {});
      else videoRef.current.pause();
    }
  }, [video.playing, isImage, focusedId, inSoloMode, video.url]);

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

  // RECOVERY MONITOR
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



  // IMAGE FOLDER NAVIGATION
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
            onLog(`SUCCESS: Snapshot saved to: ${path}`);
            
            if (onAddVideo) {
              onAddVideo({
                id: `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                title: fileName.replace('.png', ''),
                url: toCosmoUrl(path),
                realPath: path,
                currentTime: 0,
                repeatMode: 'none',
                playing: false,
                muted: true
              });
            }
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
      const currentTimeSecs = v ? v.currentTime : (video.currentTime || 0);
      const realFilePath = video.realPath || '';

      if (!realFilePath) {
        onLog('ERROR: Snapshot failed - no real file path available for this video');
        return;
      }

      let dirToUse = snapshotDir;
      if (isTauri() && (!dirToUse || dirToUse.trim() === '')) {
        onLog('SYSTEM: No snapshot directory set. Please select a destination.');
        const newDir = await invoke<string | null>('select_folder_cmd');
        if (newDir) {
          dirToUse = newDir;
          if (setSnapshotDir) setSnapshotDir(newDir);
          await invoke('save_persistence', { key: 'cosmo-snap-dir', data: newDir });
          onLog(`SNAPSHOT DESTINATION SET: ${newDir}`);
        } else {
          onLog('ERROR: Snapshot aborted (No directory selected)');
          return;
        }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Cosmo_${video.title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;

      if (isTauri()) {
        const path = await invoke<string>('snapshot_video_frame', {
          realPath: realFilePath,
          timestampSecs: currentTimeSecs,
          fileName,
          customDir: dirToUse || null,
        });

        onLog(`SUCCESS: Snapshot saved to: ${path}`);

        if (onAddVideo) {
          onAddVideo({
            id: `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: fileName.replace('.png', ''),
            url: toCosmoUrl(path),
            realPath: path,
            currentTime: 0,
            repeatMode: 'none',
            playing: false,
            muted: true
          });
        }
      } else {
        if (v && v.videoWidth > 0) {
          const c = document.createElement('canvas');
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.drawImage(v, 0, 0);
            const link = document.createElement('a');
            link.download = fileName;
            link.href = c.toDataURL('image/png');
            link.click();
            onLog(`SUCCESS: Snapshot downloaded as ${fileName}`);
          }
        } else {
          onLog('ERROR: Video not ready for snapshot');
          return;
        }
      }

      const toastId = Date.now();
      setSnapshotToast(toastId);
      setTimeout(() => {
        setSnapshotToast(current => current === toastId ? null : current);
      }, SNAPSHOT_TOAST_DURATION);

    } catch (err) {
      const errMsg = String(err);
      const isDirError = errMsg.toLowerCase().includes('could not') ||
                         errMsg.toLowerCase().includes('directory') ||
                         errMsg.toLowerCase().includes('i/o') ||
                         errMsg.toLowerCase().includes('create snapshot');

      if (isDirError && isTauri()) {
        const badDir = snapshotDir || 'the snapshot folder';
        const pick = await showConfirm(
          `The snapshot folder is not accessible:\n\n"${badDir}"\n\nWould you like to choose a new location?`,
          { title: 'Snapshot Folder Not Found', kind: 'warning' }
        );

        if (pick) {
          const newDir = await invoke<string | null>('select_folder_cmd');
          if (newDir) {
            if (setSnapshotDir) setSnapshotDir(newDir);
            await invoke('save_persistence', { key: 'cosmo-snap-dir', data: newDir });
            onLog(`SNAPSHOT DESTINATION SET: ${newDir}`);
            try {
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const retryFileName = `Cosmo_${video.title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;
              const v2 = videoRef.current;
              const retryTimeSecs = v2 ? v2.currentTime : (video.currentTime || 0);
              const path = await invoke<string>('snapshot_video_frame', {
                realPath: video.realPath || '',
                timestampSecs: retryTimeSecs,
                fileName: retryFileName,
                customDir: newDir,
              });
              onLog(`SUCCESS: Snapshot saved to: ${path}`);
              const toastId = Date.now();
              setSnapshotToast(toastId);
              setTimeout(() => setSnapshotToast(c => c === toastId ? null : c), SNAPSHOT_TOAST_DURATION);
            } catch (retryErr) {
              onLog(`ERROR: Snapshot retry failed - ${retryErr}`);
            }
          } else {
            if (setSnapshotDir) setSnapshotDir('');
            await invoke('save_persistence', { key: 'cosmo-snap-dir', data: '' });
            onLog('SYSTEM: Snapshot cancelled — no folder selected.');
          }
        } else {
          if (setSnapshotDir) setSnapshotDir('');
          await invoke('save_persistence', { key: 'cosmo-snap-dir', data: '' });
          onLog('SYSTEM: Snapshot folder cleared — you will be prompted to choose one next time.');
        }
      } else {
        onLog(`CRITICAL ERROR: Snapshot failed - ${errMsg}`);
      }
    }
  }, [video.title, video.id, video.realPath, video.rotation, video.currentTime, snapshotDir, setSnapshotDir, onLog, isImage, onAddVideo]);

  useEffect(() => {
    if (!globalControl) return;
    console.log("[useVideoCard] EFFECT TRIGGERED", {
      id: video.id,
      title: video.title,
      inSoloMode,
      focusedId,
      globalControl
    });

    const firstDash = globalControl.indexOf('-');
    if (firstDash === -1) return;
    const type = globalControl.slice(0, firstDash);

    const lastDash = globalControl.lastIndexOf('-');
    if (lastDash === -1) return;
    const baseAction = globalControl.slice(0, lastDash);
    const timestamp = parseInt(globalControl.slice(lastDash + 1), 10);

    if (type === 'snapshot' && !isNaN(timestamp)) {
      const lastTime = lastProcessedActions.get(baseAction) || 0;
      if (Math.abs(timestamp - lastTime) < 1000) {
        console.log("[useVideoCard] returning early: snapshot action was already processed within 1000ms", { baseAction, timestamp, lastTime });
        return;
      }
    }

    if (focusedId && focusedId === video.id && !inSoloMode) {
      console.log("[useVideoCard] returning early: focusedId matches video.id but not inSoloMode", { id: video.id });
      return;
    }
    
    if (!globalControl.includes(video.id)) {
      console.log("[useVideoCard] returning early: globalControl does not include video.id", { id: video.id, globalControl });
      return;
    }

    // Mark action as processed globally immediately
    if (type === 'snapshot' && !isNaN(timestamp)) {
      lastProcessedActions.set(baseAction, timestamp);
    }
    console.log("[useVideoCard] SETTING lastProcessedActions for", baseAction, "to", timestamp);

    if (type === 'snapshot') {
      console.log("[useVideoCard] CALLING takeSnapshot() for video.id", video.id);
      takeSnapshot();
    }
    if (type === 'stop') {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
    if (type === 'stepback') {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - (1 / FPS));
        onUpdateVideo(video.id, { playing: false });
      }
    }
    if (type === 'stepforward') {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + (1 / FPS));
        onUpdateVideo(video.id, { playing: false });
      }
    }
    if (type === 'watermark') {
      setIsEditingWatermark(true);
    }
  }, [globalControl, video.id, takeSnapshot, onUpdateVideo, focusedId, inSoloMode]);

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTap = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      e.preventDefault();
      if (isFocused) {
        onUpdateVideo(video.id, { playing: !video.playing });
      } else {
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

    if (isImage && !isAiEnhancing && !isStickerLoading) {
      setIsHoldingToCutout(true);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      holdTimerRef.current = setTimeout(() => {
        setIsHoldingToCutout(false);
        if (onCreateSticker) {
          onCreateSticker(video);
        }
      }, 1200);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsHoldingToCutout(false);
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

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
          if (deltaX > SWIPE_THRESHOLD) {
            if (onNavigateSibling) onNavigateSibling(1);
          } else if (deltaX < -SWIPE_THRESHOLD) {
            if (onNavigateSibling) onNavigateSibling(-1);
          }
        } else {
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
        if (absY > absX && absY > SWIPE_THRESHOLD) {
          if (deltaY > 0) {
            onDeepFocus();
          } else {
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

  // AUTO-SAVE ROTATION TO DISK
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
          const cacheBuster = `t=${Date.now()}`;
          const cleanUrl = video.url.split('?')[0];
          const newUrl = `${cleanUrl}?${cacheBuster}`;

          onUpdateVideo(video.id, { 
            rotation: 0,
            url: newUrl
          });
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

      if (distance > 24) {
        setIsHoldingToCutout(false);
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }

        const path = video.realPath;
        dragStartPos.current = null;

        const defaultIcon = (window as any).__CRAB_DRAG_ICON__ || "";

        startDrag({
          item: [path],
          icon: defaultIcon,
        }).catch(err => {
          console.error("Native drag failed:", err);
        });

        onLog(`Started native drag-out of: ${video.title}`);
      }
    }
  };

  const handleMouseUp = () => {
    dragStartPos.current = null;
    setIsHoldingToCutout(false);
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const dragProps = useMemo(() => {
    const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isTouchDevice || isFocused || selectionMode) return {};
    return {
      drag: "x" as const,
      dragConstraints: { left: 0, right: 0 },
      dragElastic: 0.6,
      onDragEnd: (_event: any, info: any) => {
        if (info.offset.x > 120) {
          onUpdateVideo(video.id, { rotation: (video.rotation || 0) + 90 });
          onLog(`Rotated Right via Swipe: ${video.title}`);
        } else if (info.offset.x < -120) {
          onRemove(video.id);
          onLog(`Removed via Swipe: ${video.title}`);
        }
      }
    };
  }, [isFocused, selectionMode, video.id, video.rotation, video.title, onUpdateVideo, onRemove, onLog]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const direction = e.deltaY > 0 ? 90 : -90;
        
        const isBatch = selectedIds.size > 0 && selectedIds.has(video.id);
        if (isBatch) {
          onUpdateVideo(Array.from(selectedIds), (prev: any) => ({
            rotation: (prev.rotation || 0) + direction
          }));
          onLog(`Batch Rotated ${direction > 0 ? 'Right' : 'Left'}: ${selectedIds.size} assets`);
        } else {
          onUpdateVideo(video.id, { rotation: (video.rotation || 0) + direction });
          onLog(`Rotated ${direction > 0 ? 'Right' : 'Left'}: ${video.title}`);
        }
      } else if (e.altKey && isFocused) {
        e.preventDefault();
        e.stopPropagation();
        
        const rect = el.getBoundingClientRect();
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
        if (now - lastWheelNav.current > 180) {
          lastWheelNav.current = now;
          const direction = e.deltaY > 0 ? 1 : -1;
          if (video.folderFiles && video.folderFiles.length > 1) {
            navigateImageFolder(direction);
          } else if (onNavigateSibling) {
            onNavigateSibling(direction);
          }
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [
    video.id,
    video.rotation,
    video.title,
    video.folderFiles,
    isFocused,
    isImage,
    panOffset,
    onUpdateVideo,
    onLog,
    onNavigateSibling,
    navigateImageFolder,
    selectedIds
  ]);

  return {
    // refs
    videoRef,
    cardRef,
    imageRef,
    progressRef,
    handleRef,
    textRef,
    focusedProgressRef,
    focusedHandleRef,
    focusedTimeTextRef,
    focusedScrubContainerRef,
    focusedTrackRef,
    lastTime,
    // states
    isHoldingToCutout,
    reloadKey,
    hudData,
    zoomScale,
    panOffset,
    isPanning,
    isEditingWatermark,
    boxStart,
    boxEnd,
    inpaintedPreview,
    isErasingLoading,
    error,
    recovering,
    snapshotToast,
    isLocalFS,
    showControls,
    isHovered,
    showCardMenu,
    duration,
    // computed/derivations
    filterId,
    unitRepeatMode,
    filters,
    finalR,
    finalG,
    finalB,
    isImage,
    isAudio,
    songInfo,
    displayUrl,
    animationClass,
    dragProps,
    effectiveMuted,
    // setters
    setShowCardMenu,
    setIsHovered,
    setIsInteracting,
    setDuration,
    setError,
    setPlaying,
    setReloadKey,
    setIsEditingWatermark,
    setInpaintedPreview,
    setBoxStart,
    setBoxEnd,
    // actions/handlers
    handleImageMouseDown,
    handleImageMouseMove,
    handleImageMouseUp,
    handleAutoErase,
    handleSaveInpainted,
    handleResetEraser,
    handleCancelEraser,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchEnd,
    handleFocusedScrub,
    handleTimeUpdate,
    handleScrub,
    startStep,
    stopStep,
    handleMuteToggle,
    takeSnapshot
  };
}
