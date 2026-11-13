import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../../../types';
import { toCosmoUrl, toRealPath, isTauri } from '../../../utils/videoUtils';
import { type AspectRatio, ASPECT_RATIOS } from './trimCropUtils';
import type { CropBox } from './CropOverlayBox';

interface UseTrimCropStudioParams {
  target: VideoItem;
  onClose: () => void;
  onSuccess: (newPath: string, isOverwrite: boolean, targetId?: string) => void;
  addLog: (msg: string) => void;
}

/**
 * Encapsulates timeline trimming, spatial crop manipulation, viewport zoom/pan,
 * keyboard shortcuts, and FFmpeg export logic for the Trim, Crop & Pan Studio.
 */
export function useTrimCropStudio({
  target,
  onClose,
  onSuccess,
  addLog,
}: UseTrimCropStudioParams) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(target.duration || 10);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  // Video Native Dimensions
  const [nativeDim, setNativeDim] = useState<{ width: number; height: number }>({
    width: 1920,
    height: 1080,
  });

  // Trim state (in seconds)
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(target.duration || 10);
  const [loopSelection, setLoopSelection] = useState(true);

  // Viewport Zoom & Pan state
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanningViewport, setIsPanningViewport] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; initialPan: { x: number; y: number } }>({
    x: 0,
    y: 0,
    initialPan: { x: 0, y: 0 },
  });

  // Crop & Aspect Ratio state
  const [enableCrop, setEnableCrop] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('free');
  const [cropBox, setCropBox] = useState<CropBox>({ x: 10, y: 10, width: 80, height: 80 });

  // Dragging state
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number; crop: CropBox }>({ x: 0, y: 0, crop: cropBox });

  // Timeline dragging
  const [isDraggingTimeline, setIsDraggingTimeline] = useState<
    'playhead' | 'start' | 'end' | 'range' | null
  >(null);
  const timelineDragRef = useRef<{ startX: number; startIn: number; startOut: number; dur: number }>({
    startX: 0,
    startIn: 0,
    startOut: 0,
    dur: 10,
  });

  // Timeline Hover
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number | null>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaSrc =
    target.url.startsWith('http') || target.url.startsWith('cosmo:') || target.url.startsWith('asset:')
      ? target.url
      : toCosmoUrl(target.realPath || target.url);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration || 10;
    setDuration(dur);
    setStartTime(0);
    setEndTime(dur);
    if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
      setNativeDim({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);

    if (loopSelection && isPlaying) {
      if (t >= endTime - 0.04 || t < startTime - 0.1) {
        videoRef.current.currentTime = startTime;
      }
    }
  };

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (currentTime < startTime - 0.05 || currentTime >= endTime - 0.05) {
        videoRef.current.currentTime = startTime;
      }
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, currentTime, startTime, endTime, playbackRate]);

  const seekTo = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(duration, time));
      if (videoRef.current) {
        videoRef.current.currentTime = clamped;
      }
      setCurrentTime(clamped);
    },
    [duration]
  );

  const stepFrame = useCallback(
    (frames: number) => {
      const fps = 30;
      const delta = frames / fps;
      seekTo(currentTime + delta);
    },
    [currentTime, seekTo]
  );

  const setInPoint = useCallback(() => {
    const newStart = Math.min(currentTime, endTime - 0.1);
    setStartTime(Math.max(0, newStart));
  }, [currentTime, endTime]);

  const setOutPoint = useCallback(() => {
    const newEnd = Math.max(currentTime, startTime + 0.1);
    setEndTime(Math.min(duration, newEnd));
  }, [currentTime, startTime, duration]);

  const jumpToIn = useCallback(() => {
    seekTo(startTime);
  }, [seekTo, startTime]);

  const jumpToOut = useCallback(() => {
    seekTo(endTime);
  }, [seekTo, endTime]);

  const resetTrim = () => {
    setStartTime(0);
    setEndTime(duration);
    seekTo(0);
  };

  const resetCrop = () => {
    setCropBox({ x: 0, y: 0, width: 100, height: 100 });
    setAspectRatio('free');
  };

  const centerCropBox = () => {
    setCropBox((prev) => {
      const newX = Math.max(0, (100 - prev.width) / 2);
      const newY = Math.max(0, (100 - prev.height) / 2);
      return { ...prev, x: newX, y: newY };
    });
  };

  const applyAspectRatio = (ratioId: AspectRatio) => {
    setAspectRatio(ratioId);
    if (ratioId === 'free') return;

    const item = ASPECT_RATIOS.find((r) => r.id === ratioId);
    if (!item || !item.ratio || !nativeDim.width || !nativeDim.height) return;

    const targetRatio = item.ratio;
    const videoAspect = nativeDim.width / nativeDim.height;
    let newW: number;
    let newH: number;

    if (targetRatio > videoAspect) {
      newW = 100;
      newH = (videoAspect / targetRatio) * 100;
    } else {
      newH = 100;
      newW = (targetRatio / videoAspect) * 100;
    }

    const newX = (100 - newW) / 2;
    const newY = (100 - newH) / 2;

    setCropBox({
      x: Math.max(0, newX),
      y: Math.max(0, newY),
      width: Math.min(100, newW),
      height: Math.min(100, newH),
    });
  };

  const cyclePlaybackRate = () => {
    const rates = [0.25, 0.5, 1, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoomScale((prev) => {
      const next = Math.max(1, Math.min(4, prev + delta));
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleViewportMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    if (e.button === 1 || e.altKey || (e.button === 0 && !enableCrop)) {
      e.preventDefault();
      setIsPanningViewport(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        initialPan: { ...panOffset },
      };
    }
  };

  useEffect(() => {
    if (!isPanningViewport) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanOffset({
        x: panStartRef.current.initialPan.x + dx,
        y: panStartRef.current.initialPan.y + dy,
      });
    };

    const handleMouseUp = () => {
      setIsPanningViewport(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanningViewport]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setInPoint();
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setOutPoint();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setLoopSelection((prev) => !prev);
      } else if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setEnableCrop((prev) => !prev);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFrame(e.shiftKey ? -5 : -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFrame(e.shiftKey ? 5 : 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        jumpToIn();
      } else if (e.key === 'End') {
        e.preventDefault();
        jumpToOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, togglePlay, setInPoint, setOutPoint, stepFrame, jumpToIn, jumpToOut]);

  const handleTimelineMouseDown = (
    e: React.MouseEvent,
    type: 'playhead' | 'start' | 'end' | 'range'
  ) => {
    e.stopPropagation();
    setIsDraggingTimeline(type);
    timelineDragRef.current = {
      startX: e.clientX,
      startIn: startTime,
      startOut: endTime,
      dur: duration,
    };
  };

  useEffect(() => {
    if (!isDraggingTimeline) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetSec = ratio * duration;

      if (isDraggingTimeline === 'playhead') {
        seekTo(targetSec);
      } else if (isDraggingTimeline === 'start') {
        const clampedStart = Math.min(targetSec, endTime - 0.1);
        setStartTime(Math.max(0, clampedStart));
        seekTo(clampedStart);
      } else if (isDraggingTimeline === 'end') {
        const clampedEnd = Math.max(targetSec, startTime + 0.1);
        setEndTime(Math.min(duration, clampedEnd));
        seekTo(clampedEnd);
      } else if (isDraggingTimeline === 'range') {
        const deltaX = e.clientX - timelineDragRef.current.startX;
        const deltaSec = (deltaX / rect.width) * duration;
        const span = timelineDragRef.current.startOut - timelineDragRef.current.startIn;
        let newIn = timelineDragRef.current.startIn + deltaSec;
        let newOut = timelineDragRef.current.startOut + deltaSec;

        if (newIn < 0) {
          newIn = 0;
          newOut = span;
        } else if (newOut > duration) {
          newOut = duration;
          newIn = duration - span;
        }
        setStartTime(newIn);
        setEndTime(newOut);
        seekTo(newIn);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingTimeline(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTimeline, duration, startTime, endTime, seekTo]);

  const handleCropMouseDown = (e: React.MouseEvent, handle: string | null) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingCrop(true);
    setDragHandle(handle);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      crop: { ...cropBox },
    };
  };

  useEffect(() => {
    if (!isDraggingCrop || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = containerRef.current!.getBoundingClientRect();
      const dxPercent = ((e.clientX - dragStartPos.current.x) / containerRect.width) * 100;
      const dyPercent = ((e.clientY - dragStartPos.current.y) / containerRect.height) * 100;
      const initial = dragStartPos.current.crop;

      if (!dragHandle) {
        const newX = Math.max(0, Math.min(100 - initial.width, initial.x + dxPercent));
        const newY = Math.max(0, Math.min(100 - initial.height, initial.y + dyPercent));
        setCropBox((prev) => ({ ...prev, x: newX, y: newY }));
      } else {
        let newX = initial.x;
        let newY = initial.y;
        let newW = initial.width;
        let newH = initial.height;

        if (dragHandle.includes('e'))
          newW = Math.max(8, Math.min(100 - initial.x, initial.width + dxPercent));
        if (dragHandle.includes('s'))
          newH = Math.max(8, Math.min(100 - initial.y, initial.height + dyPercent));
        if (dragHandle.includes('w')) {
          const clampedDx = Math.min(initial.width - 8, Math.max(-initial.x, dxPercent));
          newX = initial.x + clampedDx;
          newW = initial.width - clampedDx;
        }
        if (dragHandle.includes('n')) {
          const clampedDy = Math.min(initial.height - 8, Math.max(-initial.y, dyPercent));
          newY = initial.y + clampedDy;
          newH = initial.height - clampedDy;
        }

        setCropBox({
          x: Math.max(0, Math.min(100, newX)),
          y: Math.max(0, Math.min(100, newY)),
          width: Math.max(8, Math.min(100 - newX, newW)),
          height: Math.max(8, Math.min(100 - newY, newH)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDraggingCrop(false);
      setDragHandle(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingCrop, dragHandle]);

  const handleExport = async (overwrite: boolean) => {
    const effectivePath = target.realPath || toRealPath(target.url);
    if (!effectivePath) {
      setErrorMessage('Cannot export: Target media does not have a valid local filesystem path.');
      return;
    }

    setIsProcessing(true);
    setProcessingMsg(
      overwrite ? 'Trimming & replacing video in-place...' : 'Rendering new trimmed clip...'
    );
    setErrorMessage(null);

    const pixelX = enableCrop ? Math.round((cropBox.x / 100) * nativeDim.width) : undefined;
    const pixelY = enableCrop ? Math.round((cropBox.y / 100) * nativeDim.height) : undefined;
    const pixelW = enableCrop ? Math.round((cropBox.width / 100) * nativeDim.width) : undefined;
    const pixelH = enableCrop ? Math.round((cropBox.height / 100) * nativeDim.height) : undefined;

    if (videoRef.current) {
      videoRef.current.pause();
      try {
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch {
        // ignore
      }
    }

    try {
      if (isTauri()) {
        const resultPath = await invoke<string>('trim_crop_video', {
          path: effectivePath,
          startSec: startTime > 0.01 ? startTime : null,
          endSec: endTime < duration - 0.01 ? endTime : null,
          cropX: pixelX,
          cropY: pixelY,
          cropW: pixelW,
          cropH: pixelH,
          overwrite,
          lossless: false,
        });

        addLog(`⚡ Trim & Crop Complete: Exported to "${resultPath}"`);
        onSuccess(resultPath, overwrite, target.id);
        onClose();
      } else {
        throw new Error('Tauri runtime not available');
      }
    } catch (err: unknown) {
      console.error('Trim/Crop export failed:', err);
      const errMsg =
        typeof err === 'string'
          ? err
          : err instanceof Error
            ? err.message
            : JSON.stringify(err);
      setErrorMessage(errMsg);
      if (videoRef.current && mediaSrc) {
        videoRef.current.src = mediaSrc;
        videoRef.current.load();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const trimDuration = Math.max(0, endTime - startTime);
  const croppedPixelW = enableCrop
    ? Math.round((cropBox.width / 100) * nativeDim.width)
    : nativeDim.width;
  const croppedPixelH = enableCrop
    ? Math.round((cropBox.height / 100) * nativeDim.height)
    : nativeDim.height;
  const isLossless =
    !enableCrop ||
    (cropBox.x <= 1 && cropBox.y <= 1 && cropBox.width >= 98 && cropBox.height >= 98);

  return {
    videoRef,
    containerRef,
    viewportRef,
    timelineRef,
    mediaSrc,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    setIsMuted,
    playbackRate,
    nativeDim,
    startTime,
    endTime,
    loopSelection,
    setLoopSelection,
    zoomScale,
    setZoomScale,
    panOffset,
    setPanOffset,
    isPanningViewport,
    enableCrop,
    setEnableCrop,
    aspectRatio,
    cropBox,
    isDraggingTimeline,
    hoverTime,
    setHoverTime,
    hoverPos,
    setHoverPos,
    isProcessing,
    processingMsg,
    errorMessage,
    trimDuration,
    croppedPixelW,
    croppedPixelH,
    isLossless,
    handleLoadedMetadata,
    handleTimeUpdate,
    togglePlay,
    seekTo,
    stepFrame,
    setInPoint,
    setOutPoint,
    jumpToIn,
    jumpToOut,
    resetTrim,
    resetCrop,
    centerCropBox,
    applyAspectRatio,
    cyclePlaybackRate,
    handleWheelZoom,
    handleViewportMouseDown,
    handleTimelineMouseDown,
    handleCropMouseDown,
    handleExport,
  };
}
