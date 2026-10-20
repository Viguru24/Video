import React, { useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { startDrag } from '@crabnebula/tauri-plugin-drag';
import { SWIPE_THRESHOLD } from '../../constants';
import type { VideoItem } from '../../types';

interface UseCardTouchGesturesProps {
  video: VideoItem;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isFocused: boolean;
  isHovered: boolean;
  isImage: boolean;
  selectionMode?: boolean;
  isAiEnhancing?: boolean;
  isStickerLoading?: boolean;
  onUpdateVideo: (id: any, updates: any) => void;
  onRemove: (id: string) => void;
  onLog: (msg: string) => void;
  onDeepFocus: (time?: number) => void;
  onCloseFocus: () => void;
  onNavigateSibling?: (direction: 1 | -1) => void;
  onCreateSticker?: (video: VideoItem) => void;
  setGlobalVolume: (updater: (prev: number) => number) => void;
  setSpeed: (updater: (prev: number) => number) => void;
  showHudNotification: (label: string, value: string) => void;
  setReloadKey: React.Dispatch<React.SetStateAction<number>>;
  resetControlsTimer: () => void;
  isHoldingToCutout: boolean;
  setIsHoldingToCutout: React.Dispatch<React.SetStateAction<boolean>>;
  holdTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  dragStartPos: React.MutableRefObject<{ x: number; y: number } | null>;
}

export function useCardTouchGestures({
  video,
  videoRef,
  isFocused,
  isHovered,
  isImage,
  selectionMode,
  isAiEnhancing = false,
  isStickerLoading = false,
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
}: UseCardTouchGesturesProps) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTap = useRef<number>(0);

  // Cleanup hold timer on unmount or video change
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      setIsHoldingToCutout(false);
    };
  }, [video.id, video.url, holdTimerRef, setIsHoldingToCutout]);

  // Global window mouseup/touchend to guarantee timer cancellation
  useEffect(() => {
    const handleGlobalCancelHold = () => {
      setIsHoldingToCutout(false);
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };

    window.addEventListener('mouseup', handleGlobalCancelHold, { passive: true });
    window.addEventListener('touchend', handleGlobalCancelHold, { passive: true });
    window.addEventListener('blur', handleGlobalCancelHold);
    return () => {
      window.removeEventListener('mouseup', handleGlobalCancelHold);
      window.removeEventListener('touchend', handleGlobalCancelHold);
      window.removeEventListener('blur', handleGlobalCancelHold);
    };
  }, [holdTimerRef, setIsHoldingToCutout]);

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
      }, 3000);
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
  }, [video.rotation, video.realPath, video.id, video.title, video.url, isImage, onUpdateVideo, onLog, setReloadKey]);

  const handleMouseMove = (e: React.MouseEvent) => {
    resetControlsTimer();
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

  return {
    handleTouchStart,
    handleTouchEnd,
    handleMouseMove,
    handleMouseUp,
    dragProps,
  };
}
