import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { VideoItem } from '../../types';

interface UseCardPanZoomProps {
  cardRef: React.RefObject<HTMLDivElement | null>;
  video: VideoItem;
  isFocused: boolean;
  isCropping: boolean;
  isImage: boolean;
  selectedIds: Set<string>;
  onUpdateVideo: (id: any, updates: any) => void;
  onLog: (msg: string) => void;
  onNavigateSibling?: (direction: 1 | -1) => void;
  navigateImageFolder: (direction: 1 | -1) => void;
  setSpeed: React.Dispatch<React.SetStateAction<number>>;
  showHudNotification: (label: string, value: string) => void;
}

export function useCardPanZoom({
  cardRef,
  video,
  isFocused,
  isCropping,
  isImage,
  selectedIds,
  onUpdateVideo,
  onLog,
  onNavigateSibling,
  navigateImageFolder,
  setSpeed,
  showHudNotification,
}: UseCardPanZoomProps) {
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPan = useRef({ x: 0, y: 0 });
  const lastWheelNav = useRef<number>(0);

  const resetZoom = useCallback(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
    showHudNotification('ZOOM', '100%');
  }, [showHudNotification]);

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

  // Wheel interactions for zoom, scrub, speed, and rotation
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
    setIsPanning,
    startPan,
    resetZoom,
  };
}
