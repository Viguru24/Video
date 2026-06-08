import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { startDrag } from '@crabnebula/tauri-plugin-drag';
import { isValidPictureExtension } from '../utils/videoUtils';
import type { VideoItem } from '../types';

interface UseZoomPanProps {
  video: VideoItem;
  isFocused: boolean;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onLog: (msg: string) => void;
  isImage: boolean;
}

export function useZoomPan({ video, isFocused, cardRef, onLog, isImage }: UseZoomPanProps) {
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  
  const startPan = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  
  const [dragPreviewPath, setDragPreviewPath] = useState<string | null>(null);
  const [isGeneratingDragPreview, setIsGeneratingDragPreview] = useState(false);

  const ensureDragPreview = useCallback(() => {
    if (isImage && video.realPath && !dragPreviewPath && !isGeneratingDragPreview) {
      setIsGeneratingDragPreview(true);
      invoke<string>('prepare_drag_thumbnail', { path: video.realPath })
        .then((previewPath) => {
          setDragPreviewPath(previewPath);
        })
        .catch((err) => {
          console.error("Failed to prepare drag thumbnail:", err);
        })
        .finally(() => {
          setIsGeneratingDragPreview(false);
        });
    }
  }, [isImage, video.realPath, dragPreviewPath, isGeneratingDragPreview]);

  // Reset drag preview when file path changes (e.g. image cycling)
  useEffect(() => {
    setDragPreviewPath(null);
  }, [video.realPath]);

  // Staggered background preview generation to avoid CPU spikes
  useEffect(() => {
    if (isImage && video.realPath) {
      const delay = 500 + Math.random() * 4500;
      const timer = setTimeout(() => {
        ensureDragPreview();
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [video.realPath, isImage, ensureDragPreview]);

  const handleMouseDown = (e: React.MouseEvent) => {
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
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        ensureDragPreview();
        onLog("Drag card body to export file to desktop/folders");
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

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isPanning, zoomScale]);

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
          ? (dragPreviewPath || "C:\\Users\\louis\\OneDrive\\Documents\\GitHub\\Video\\src-tauri\\icons\\128x128.png") 
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

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (e.altKey && isFocused) {
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
    }
  };

  return {
    zoomScale,
    panOffset,
    isPanning,
    dragPreviewPath,
    ensureDragPreview,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheelZoom,
    setZoomScale,
    setPanOffset,
    setIsPanning
  };
}
