import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SWIPE_THRESHOLD, SNAPSHOT_TOAST_DURATION, FPS } from '../../constants';
import { isValidPictureExtension, isTauri, toCosmoUrl, showConfirm, toRealPath } from '../../utils/videoUtils';
import { useStore } from '../../store/useStore';
import type { VideoItem, RepeatMode } from '../../types';
import { DEFAULT_COLOR_FILTERS } from '../../types';
import { useVideoCardMediaSource } from './useVideoCardMediaSource';
import { useVideoCardZoomPan } from './useVideoCardZoomPan';
import { useVideoCardScrubber } from './useVideoCardScrubber';
import { useVideoCardSnapshot } from './useVideoCardSnapshot';

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

// Global module-level registry to deduplicate rapid globalControl actions
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
  const retryAttempted = useRef<boolean>(false);

  const isImage = useMemo(() => {
    return isValidPictureExtension(video.realPath || video.url);
  }, [video.realPath, video.url]);

  const isAudio = useMemo(() => {
    const url = video.realPath || video.url || '';
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    return ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'wma', 'aac', 'alac', 'mp3a'].includes(ext);
  }, [video.realPath, video.url]);

  const songInfo = useMemo(() => {
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
  const selectedIds = useStore((state) => state.selectedIds);
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

  const [playing, setPlaying] = useState(masterPlaying);
  const [recovering, setRecovering] = useState(false);
  const { snapshotToast, takeSnapshot } = useVideoCardSnapshot({
    video,
    isImage,
    videoRef,
    snapshotDir,
    setSnapshotDir,
    onLog,
    onAddVideo
  });
  const [isLocalFS, setIsLocalFS] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [showCardMenu, setShowCardMenu] = useState(false);
  const [duration, setDuration] = useState(0);
  const controlsIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActivelyPlaying = (video.playing || (masterPlaying && !video.pausedExplicitly)) && !isImage;

  const resetControlsTimer = useCallback(() => {
    if (controlsIdleTimerRef.current) {
      clearTimeout(controlsIdleTimerRef.current);
      controlsIdleTimerRef.current = null;
    }
    setShowControls(true);

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

  // Hover-to-Play
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

  // Click outside to dismiss menu
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

  // Image Folder Navigation
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

  // Sub-hooks
  const {
    reloadKey,
    setReloadKey,
    error,
    setError,
    isSyncingOrRecovering,
    displayUrl,
    effectiveImgSrc,
    handleMediaSuccess,
    handleMediaError,
    handleManualRetry,
    handleImageError
  } = useVideoCardMediaSource({
    video,
    onLog,
    videoRef
  });

  const {
    zoomScale,
    setZoomScale,
    panOffset,
    setPanOffset,
    isPanning,
    isHoldingToCutout,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetZoom
  } = useVideoCardZoomPan({
    video,
    isFocused,
    isCropping,
    isImage,
    isAiEnhancing,
    isStickerLoading,
    selectedIds,
    cardRef,
    onUpdateVideo,
    onLog,
    onCreateSticker,
    onNavigateSibling,
    navigateImageFolder,
    setSpeed,
    showHudNotification,
    resetControlsTimer
  });

  const {
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
    handleFocusedScrub,
    handleTimeUpdate,
    handleScrub,
    startStep,
    stopStep
  } = useVideoCardScrubber({
    video,
    videoRef,
    isFocused,
    onUpdateVideo,
    setIsInteracting
  });

  // Preserve time during hibernation
  useEffect(() => {
    if (!isVisible && videoRef.current) {
      lastTime.current = videoRef.current.currentTime;
    }
  }, [isVisible, lastTime]);

  useEffect(() => {
    lastTime.current = 0;
  }, [displayUrl, lastTime]);

  useEffect(() => {
    if (!isImage && videoRef.current) {
      const vol = Number.isFinite(globalVolume) ? Math.max(0, Math.min(1, globalVolume)) : 0;
      videoRef.current.volume = vol;
    }
  }, [globalVolume, isImage]);

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
  }, [video.currentTime, isImage, lastTime]);

  useEffect(() => {
    if (isImage) return;
    const v = videoRef.current;
    if (v) v.playbackRate = globalSpeed;
  }, [globalSpeed, isImage]);

  // Recovery monitor
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
  }, [video.playing, video.url, recovering, isImage, setError]);

  // Global control listener
  useEffect(() => {
    if (!globalControl) return;

    const firstDash = globalControl.indexOf('-');
    if (firstDash === -1) return;
    const type = globalControl.slice(0, firstDash);

    const lastDash = globalControl.lastIndexOf('-');
    if (lastDash === -1) return;
    const baseAction = globalControl.slice(0, lastDash);
    const timestamp = parseInt(globalControl.slice(lastDash + 1), 10);

    if (type === 'snapshot' && !isNaN(timestamp)) {
      const lastTimeVal = lastProcessedActions.get(baseAction) || 0;
      if (Math.abs(timestamp - lastTimeVal) < 1000) {
        return;
      }
    }

    if (focusedId && focusedId === video.id && !inSoloMode) {
      return;
    }
    
    if (!globalControl.includes(video.id)) {
      return;
    }

    if (type === 'snapshot' && !isNaN(timestamp)) {
      lastProcessedActions.set(baseAction, timestamp);
    }

    if (type === 'snapshot') {
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
      if (onCreateSticker) {
        // Cutout hold
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const touchEnd = e.changedTouches[0];
    const deltaX = touchStart.current.x - touchEnd.clientX;
    const deltaY = touchStart.current.y - touchEnd.clientY;
    const durationTime = Date.now() - touchStart.current.time;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (durationTime < 500 && (absX > SWIPE_THRESHOLD || absY > SWIPE_THRESHOLD)) {
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
  }, [video.rotation, video.realPath, video.id, video.title, video.url, isImage, onUpdateVideo, onLog, setReloadKey]);

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
