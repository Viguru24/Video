import React, { useState, useRef, useEffect } from 'react';
import { startDrag } from '@crabnebula/tauri-plugin-drag';
import type { VideoItem } from '../../types';

export interface UseVideoCardZoomPanProps {
  video: VideoItem;
  isFocused: boolean;
  isCropping: boolean;
  isImage: boolean;
  isAiEnhancing: boolean;
  isStickerLoading: boolean;
  selectedIds: Set<string>;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onUpdateVideo: (id: any, updates: any) => void;
  onLog: (msg: string) => void;
  onCreateSticker?: (video: VideoItem) => void;
  onNavigateSibling?: (direction: 1 | -1) => void;
  navigateImageFolder: (dir: number) => void;
  setSpeed: (fn: (prev: number) => number) => void;
  showHudNotification: (title: string, value: string) => void;
  resetControlsTimer: () => void;
}

export function useVideoCardZoomPan({
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
}: UseVideoCardZoomPanProps) {
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPan = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  const [isHoldingToCutout, setIsHoldingToCutout] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWheelNav = useRef<number>(0);

  // Cleanup hold timer on unmount or video change
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      setIsHoldingToCutout(false);
    };
  }, [video.id, video.url]);

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
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
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

  useEffect(() => {
    if (!isFocused) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      setIsPanning(false);
    }
  }, [isFocused]);

  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, [video.url]);

  useEffect(() => {
    if (isCropping) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      setIsPanning(false);
    }
  }, [isCropping]);

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

  const resetZoom = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
    showHudNotification('ZOOM', '100%');
  };

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey && isFocused && !isImage) {
        e.preventDefault();
        e.stopPropagation();
        const change = e.deltaY < 0 ? 0.05 : -0.05;
        setSpeed((prev) => {
          const next = Math.max(0.05, Math.min(16.0, parseFloat((prev + change).toFixed(2))));
          showHudNotification('SPEED', `${next.toFixed(2)}x`);
          return next;
        });
      } else if (e.shiftKey) {
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
          if (zoomScale > 1) {
            setZoomScale(1);
            setPanOffset({ x: 0, y: 0 });
          }
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
    zoomScale,
    onUpdateVideo,
    onLog,
    onNavigateSibling,
    navigateImageFolder,
    selectedIds,
    setSpeed,
    showHudNotification,
    cardRef
  ]);

  return {
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
  };
}
