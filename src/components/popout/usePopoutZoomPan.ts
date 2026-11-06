import React, { useState, useEffect, useRef, useCallback } from 'react';

interface UsePopoutZoomPanParams {
  activeVideoId: string | undefined;
  url: string;
  isCropping: boolean;
  colorAdjustId: string | null;
  showSaveCropOptions: boolean;
  showSaveUpscaleOptions: boolean;
  isImage: boolean;
  navigate: (direction: 1 | -1) => void;
  setSpeed: React.Dispatch<React.SetStateAction<number>>;
  showHudNotification: (title: string, value: string) => void;
}

export function usePopoutZoomPan({
  activeVideoId,
  url,
  isCropping,
  colorAdjustId,
  showSaveCropOptions,
  showSaveUpscaleOptions,
  isImage,
  navigate,
  setSpeed,
  showHudNotification,
}: UsePopoutZoomPanParams) {
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPanRef = useRef({ x: 0, y: 0 });
  const zoomScaleRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const currentMediaIdRef = useRef<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef(0);

  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  // Reset Zoom strictly on navigating to a DIFFERENT item
  useEffect(() => {
    const id = activeVideoId || url;
    if (currentMediaIdRef.current && currentMediaIdRef.current !== id) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      zoomScaleRef.current = 1;
      panOffsetRef.current = { x: 0, y: 0 };
      setIsPanning(false);
    }
    currentMediaIdRef.current = id;
  }, [activeVideoId, url]);

  // Unified High-Fidelity Wheel Zoom Engine for Popout Viewport
  const performZoom = useCallback((deltaY: number, clientX?: number, clientY?: number) => {
    const el = viewportRef.current;
    let mouseX = 0;
    let mouseY = 0;
    if (el && typeof clientX === 'number' && typeof clientY === 'number') {
      const rect = el.getBoundingClientRect();
      mouseX = clientX - (rect.left + rect.width / 2);
      mouseY = clientY - (rect.top + rect.height / 2);
    }

    const currentZoom = zoomScaleRef.current;
    const currentPan = panOffsetRef.current;

    const factor = deltaY < 0 ? 1.25 : 0.8;
    const nextZoom = Math.max(1, Math.min(10, currentZoom * factor));

    if (nextZoom <= 1.02) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      zoomScaleRef.current = 1;
      panOffsetRef.current = { x: 0, y: 0 };
      showHudNotification('ZOOM', '100%');
      return;
    }

    const ratio = nextZoom / currentZoom;
    const newPanX = mouseX - (mouseX - currentPan.x) * ratio;
    const newPanY = mouseY - (mouseY - currentPan.y) * ratio;

    const nextPan = { x: newPanX, y: newPanY };
    setZoomScale(nextZoom);
    setPanOffset(nextPan);
    zoomScaleRef.current = nextZoom;
    panOffsetRef.current = nextPan;
    showHudNotification('ZOOM', `${Math.round(nextZoom * 100)}%`);
  }, [showHudNotification]);

  // Global mouse panning tracker
  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (zoomScaleRef.current > 1) {
        const nextPan = {
          x: e.clientX - startPanRef.current.x,
          y: e.clientY - startPanRef.current.y
        };
        setPanOffset(nextPan);
        panOffsetRef.current = nextPan;
      }
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning]);

  const handleViewportMouseDown = (e: React.MouseEvent) => {
    if (isCropping) return;

    // Alt + Click to toggle 2.5x Zoom
    if (e.altKey && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - (rect.left + rect.width / 2);
      const mouseY = e.clientY - (rect.top + rect.height / 2);
      if (zoomScaleRef.current > 1) {
        setZoomScale(1);
        setPanOffset({ x: 0, y: 0 });
        zoomScaleRef.current = 1;
        panOffsetRef.current = { x: 0, y: 0 };
        showHudNotification('ZOOM', '100%');
      } else {
        const nextScale = 2.5;
        const ratio = nextScale / 1;
        const nextPan = { x: mouseX - mouseX * ratio, y: mouseY - mouseY * ratio };
        setPanOffset(nextPan);
        setZoomScale(nextScale);
        zoomScaleRef.current = nextScale;
        panOffsetRef.current = nextPan;
        showHudNotification('ZOOM', '250%');
      }
      return;
    }

    // Drag to pan when zoomed
    if (zoomScaleRef.current > 1 && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      startPanRef.current = { x: e.clientX - panOffsetRef.current.x, y: e.clientY - panOffsetRef.current.y };
    }
  };

  const handleDoubleClickViewport = (e: React.MouseEvent) => {
    if (isCropping) return;
    e.preventDefault();
    e.stopPropagation();
    if (zoomScaleRef.current > 1) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      zoomScaleRef.current = 1;
      panOffsetRef.current = { x: 0, y: 0 };
      showHudNotification('ZOOM', '100%');
    } else {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - (rect.left + rect.width / 2);
      const mouseY = e.clientY - (rect.top + rect.height / 2);
      const nextScale = 2.5;
      const ratio = nextScale / 1;
      const nextPan = { x: mouseX - mouseX * ratio, y: mouseY - mouseY * ratio };
      setPanOffset(nextPan);
      setZoomScale(nextScale);
      zoomScaleRef.current = nextScale;
      panOffsetRef.current = nextPan;
      showHudNotification('ZOOM', '250%');
    }
  };

  // Main scroll wheel handler: Zoom by default, Shift+Wheel navigates, Ctrl+Wheel on video changes speed
  const handleWheel = (e: React.WheelEvent) => {
    if (isCropping || colorAdjustId || showSaveCropOptions || showSaveUpscaleOptions) return;

    // Shift + Wheel = Navigate files
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastScrollTime.current > 400) {
        navigate(e.deltaY > 0 ? 1 : -1);
        lastScrollTime.current = now;
      }
      return;
    }

    // Ctrl + Wheel on video = adjust speed
    if (e.ctrlKey && !isImage) {
      e.preventDefault();
      e.stopPropagation();
      const change = e.deltaY < 0 ? 0.05 : -0.05;
      setSpeed(prev => {
        const next = Math.max(0.05, Math.min(16.0, parseFloat((prev + change).toFixed(2))));
        showHudNotification('SPEED', `${next.toFixed(2)}x`);
        return next;
      });
      return;
    }

    // Default: Smooth Zoom on Images and Videos!
    e.preventDefault();
    e.stopPropagation();
    performZoom(e.deltaY, e.clientX, e.clientY);
  };

  return {
    zoomScale,
    panOffset,
    isPanning,
    viewportRef,
    setZoomScale,
    setPanOffset,
    setIsPanning,
    performZoom,
    handleViewportMouseDown,
    handleDoubleClickViewport,
    handleWheel,
  };
}
