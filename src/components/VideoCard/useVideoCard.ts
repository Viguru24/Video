import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { startDrag } from '@crabnebula/tauri-plugin-drag';
import { SWIPE_THRESHOLD, SNAPSHOT_TOAST_DURATION, FPS, STEP_INTERVAL, STEP_DELAY } from '../../constants';
import { convertToVideoUrl, isValidPictureExtension, isTauri, toCosmoUrl, showConfirm, toRealPath } from '../../utils/videoUtils';
import { useStore } from '../../store/useStore';
import type { VideoItem, RepeatMode } from '../../types';
import { DEFAULT_COLOR_FILTERS } from '../../types';
import { useCardScrubbing } from './useCardScrubbing';
import { useCardPanZoom } from './useCardPanZoom';
import { useCardSnapshot } from './useCardSnapshot';
import { useCardTouchGestures } from './useCardTouchGestures';

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
  onCancelSticker?: () => void;
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
  const retryAttempted = useRef<boolean>(false);

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
  const trimCropModalTarget = useStore((state) => state.trimCropModalTarget);

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
  const panZoom = useCardPanZoom({
    cardRef,
    video,
    isFocused,
    isCropping,
    isImage,
    selectedIds,
    onUpdateVideo,
    onLog,
    onNavigateSibling,
    navigateImageFolder: (dir) => navigateImageFolder(dir),
    setSpeed,
    showHudNotification,
  });
  const { zoomScale, setZoomScale, panOffset, setPanOffset, isPanning, setIsPanning, resetZoom } = panZoom;
  const startPan = panZoom.startPan;
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);



  const handleMouseDown = (e: React.MouseEvent) => {

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
      const target = e.target as HTMLElement;
      const isControl = Boolean(
        target.closest('button') ||
        target.closest('input') ||
        target.closest('.solo-control-bar') ||
        target.closest('.card-controls') ||
        target.closest('.zoom-hud-badge') ||
        target.closest('.drag-handle-mini') ||
        target.closest('.tel-item') ||
        target.closest('.scrub-container') ||
        target.closest('.focused-scrub-container')
      );

      if (e.altKey && e.button === 0 && zoomScale === 1 && !isControl) {
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

      if (zoomScale > 1 && e.button === 0 && !isControl) {
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
          }, 3000);
        }
      }
    }
  };

  // Pan/zoom effects handled by useCardPanZoom

  const [imageFallbackSrc, setImageFallbackSrc] = useState<string | null>(null);
  const [imgRetryCount, setImgRetryCount] = useState(0);
  const [isSyncingOrRecovering, setIsSyncingOrRecovering] = useState<boolean>(false);
  const mediaRetryCountRef = useRef<number>(0);
  const mediaRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customProtocolOverride, setCustomProtocolOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset retry state and fallbacks when media source changes
  useEffect(() => {
    mediaRetryCountRef.current = 0;
    if (mediaRetryTimerRef.current) {
      clearTimeout(mediaRetryTimerRef.current);
      mediaRetryTimerRef.current = null;
    }
    setIsSyncingOrRecovering(false);
    setCustomProtocolOverride(null);
    setImageFallbackSrc(null);
    setImgRetryCount(0);
    setError(null);
  }, [video.id, video.realPath, video.url]);

  // DYNAMIC QUALITY ENGINE (v4) — Native Asset Protocol + Resilient Fallbacks
  const displayUrl = React.useMemo(() => {
    if (customProtocolOverride) {
      return customProtocolOverride;
    }
    const url = convertToVideoUrl(video);
    let busted = url;
    if (video.url && video.url.includes('?t=')) {
      const tParam = video.url.split('?t=')[1];
      busted = `${url}${url.includes('?') ? '&' : '?'}t=${tParam}`;
    } else if (reloadKey > 0) {
      busted = `${url}${url.includes('?') ? '&' : '?'}t=${reloadKey}`;
    }
    return busted;
  }, [video.realPath, video.url, reloadKey, customProtocolOverride]);

  const effectiveImgSrc = imageFallbackSrc || displayUrl;

  const handleMediaSuccess = useCallback(() => {
    if (mediaRetryTimerRef.current) {
      clearTimeout(mediaRetryTimerRef.current);
      mediaRetryTimerRef.current = null;
    }
    mediaRetryCountRef.current = 0;
    setIsSyncingOrRecovering(false);
    setError(null);
  }, []);

  const handleMediaError = useCallback((type: 'video' | 'audio' | 'image' = 'video') => {
    const rawPath = toRealPath(video.realPath) || toRealPath(video.url);
    const attempt = mediaRetryCountRef.current + 1;
    mediaRetryCountRef.current = attempt;

    // Retry up to 12 times spanning ~35 seconds (guaranteeing in-flight syncs/writes finish)
    if (attempt <= 12) {
      setIsSyncingOrRecovering(true);
      setError(null); // Keep error null so the red X and error banner are suppressed during recovery

      const delays = [400, 800, 1200, 1600, 2200, 3000, 3500, 4000, 5000, 5000, 5000, 5000];
      const delay = delays[Math.min(attempt - 1, delays.length - 1)];

      if (mediaRetryTimerRef.current) {
        clearTimeout(mediaRetryTimerRef.current);
      }

      mediaRetryTimerRef.current = setTimeout(() => {
        const now = Date.now();
        setReloadKey(now);

        if (rawPath && isTauri()) {
          // Alternate between Tauri's convertFileSrc (asset.localhost) and custom cosmo.localhost
          if (attempt % 2 === 1) {
            const cosmoUrl = `http://cosmo.localhost/${encodeURIComponent(rawPath)}?t=${now}`;
            if (type === 'image') {
              setImageFallbackSrc(cosmoUrl);
            } else {
              setCustomProtocolOverride(cosmoUrl);
            }
          } else {
            const assetUrl = `${convertFileSrc(rawPath)}?t=${now}`;
            if (type === 'image') {
              setImageFallbackSrc(assetUrl);
            } else {
              setCustomProtocolOverride(assetUrl);
            }
          }
        }

        if (type !== 'image' && videoRef.current) {
          try {
            videoRef.current.load();
          } catch {}
        }
      }, delay);
      return;
    }

    // Retries exhausted
    setIsSyncingOrRecovering(false);
    setError("LOAD ERROR");
    onLog?.(`Unit [${video.title}] Error: LOAD ERROR after ${attempt} recovery attempts`);
  }, [video.realPath, video.url, video.title, onLog]);

  const handleManualRetry = useCallback(() => {
    mediaRetryCountRef.current = 0;
    setError(null);
    setIsSyncingOrRecovering(true);
    setCustomProtocolOverride(null);
    setImageFallbackSrc(null);
    const now = Date.now();
    setReloadKey(now);
    setTimeout(() => {
      if (videoRef.current) {
        try {
          videoRef.current.load();
        } catch {}
      }
    }, 100);
  }, []);

  const handleImageError = useCallback(() => {
    handleMediaError('image');
  }, [handleMediaError]);

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

  const [playing, setPlaying] = useState(masterPlaying);
  const [recovering, setRecovering] = useState(false);

  const [snapshotToast, setSnapshotToast] = useState<number | null>(null);
  const [isLocalFS, setIsLocalFS] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [showCardMenu, setShowCardMenu] = useState(false);
  const controlsIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActivelyPlaying = (video.playing || (masterPlaying && !video.pausedExplicitly)) && !isImage;

  const resetControlsTimer = useCallback(() => {
    if (controlsIdleTimerRef.current) {
      clearTimeout(controlsIdleTimerRef.current);
      controlsIdleTimerRef.current = null;
    }
    setShowControls(true);

    // If actively playing in tile mode (and not interacting/focused/menu-open), auto-hide after 2.2 seconds
    if (isActivelyPlaying && !isInteracting && !showCardMenu && !isFocused) {
      controlsIdleTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2200);
    }
  }, [isActivelyPlaying, isInteracting, showCardMenu, isFocused]);

  useEffect(() => {
    if (isHovered || isInteracting || showCardMenu) {
      resetControlsTimer();
    } else {
      if (controlsIdleTimerRef.current) {
        clearTimeout(controlsIdleTimerRef.current);
        controlsIdleTimerRef.current = null;
      }
      setShowControls(false);
    }
  }, [isHovered, isInteracting, showCardMenu, isActivelyPlaying, resetControlsTimer]);

  useEffect(() => {
    return () => {
      if (controlsIdleTimerRef.current) {
        clearTimeout(controlsIdleTimerRef.current);
      }
    };
  }, []);

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
  const {
    progressRef,
    handleRef,
    textRef,
    focusedProgressRef,
    focusedHandleRef,
    focusedTimeTextRef,
    focusedScrubContainerRef,
    focusedTrackRef,
    isScrubbing,
    handleFocusedScrub,
    handleTimeUpdate,
    handleScrub,
    startStep,
    stopStep,
  } = useCardScrubbing({
    videoRef,
    videoId: video.id,
    isFocused,
    onUpdateVideo,
    setIsInteracting,
  });

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
    if (trimCropModalTarget || isCropping) {
      videoRef.current.pause();
      return;
    }
    if (focusedId && focusedId !== video.id && !inSoloMode) {
      videoRef.current.pause();
    } else {
      if (video.playing) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [video.playing, isImage, focusedId, inSoloMode, video.url, trimCropModalTarget, isCropping]);

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
    if (v && typeof globalSpeed === 'number' && Number.isFinite(globalSpeed) && globalSpeed > 0) v.playbackRate = globalSpeed;
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

  const { takeSnapshot } = useCardSnapshot({
    video,
    snapshotDir,
    setSnapshotDir,
    onLog,
    onAddVideo,
    videoRef,
    isImage,
    setSnapshotToast,
  });

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
  }, [globalControl, video.id, takeSnapshot, onUpdateVideo, focusedId, inSoloMode]);

  const {
    handleTouchStart,
    handleTouchEnd,
    handleMouseMove,
    handleMouseUp,
    dragProps,
  } = useCardTouchGestures({
    video,
    videoRef,
    isFocused,
    isHovered,
    isImage,
    selectionMode,
    isAiEnhancing,
    isStickerLoading,
    onUpdateVideo,
    onRemove,
    onLog,
    onDeepFocus,
    onCloseFocus,
    onNavigateSibling,
    onCreateSticker,
    setGlobalVolume,
    setSpeed,
    showHudNotification,
    setReloadKey,
    resetControlsTimer,
    isHoldingToCutout,
    setIsHoldingToCutout,
    holdTimerRef,
    dragStartPos,
  });

  // Wheel listener handled by useCardPanZoom

  return {
    // refs
    videoRef,
    cardRef,
    progressRef,
    handleRef,
    textRef,
    focusedProgressRef,
    focusedHandleRef,
    focusedTimeTextRef,
    focusedScrubContainerRef,
    focusedTrackRef,
    lastTime,
    isScrubbing,
    // states
    isHoldingToCutout,
    reloadKey,
    hudData,
    zoomScale,
    panOffset,
    isPanning,

    error,
    recovering,
    isSyncingOrRecovering,
    retryAttempted,
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
    effectiveImgSrc,
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
    setZoomScale,
    setPanOffset,
    resetZoom,
    // actions/handlers
    handleImageError,
    handleMediaError,
    handleMediaSuccess,
    handleManualRetry,
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
    takeSnapshot,
    resetControlsTimer
  };
}
