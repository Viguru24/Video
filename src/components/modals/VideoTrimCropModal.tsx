import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  X, Play, Pause, RotateCcw, Scissors, Crop, Check, 
  ChevronLeft, ChevronRight, Volume2, VolumeX,
  Maximize2, Eye, Sparkles, Move, Film, SlidersHorizontal,
  FastForward, Rewind, Layers, CheckCircle2, AlertTriangle,
  ZoomIn, ZoomOut, Compass, RefreshCw, MessageSquare, Share2
} from 'lucide-react';
import type { VideoItem } from '../../types';
import { toCosmoUrl, toRealPath, isTauri } from '../../utils/videoUtils';
import { useStore } from '../../store/useStore';

interface VideoTrimCropModalProps {
  target: VideoItem | null;
  onClose: () => void;
  onSuccess: (newPath: string, isOverwrite: boolean, targetId?: string) => void;
  addLog: (msg: string) => void;
}

type AspectRatio = 'free' | '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '21:9';

interface CropBox {
  x: number; // Percentage 0-100
  y: number;
  width: number;
  height: number;
}

const ASPECT_RATIOS: { id: AspectRatio; label: string; ratio: number | null; desc: string }[] = [
  { id: 'free', label: 'Free', ratio: null, desc: 'Custom unconstrained' },
  { id: '16:9', label: '16:9', ratio: 16 / 9, desc: 'YouTube / Widescreen' },
  { id: '9:16', label: '9:16', ratio: 9 / 16, desc: 'TikTok / Reels / Shorts' },
  { id: '1:1', label: '1:1', ratio: 1, desc: 'Square / Feed' },
  { id: '4:5', label: '4:5', ratio: 4 / 5, desc: 'Instagram Portrait' },
  { id: '4:3', label: '4:3', ratio: 4 / 3, desc: 'Standard Video' },
  { id: '21:9', label: '21:9', ratio: 21 / 9, desc: 'Cinematic Ultrawide' },
];

export function VideoTrimCropModal({
  target,
  onClose,
  onSuccess,
  addLog
}: VideoTrimCropModalProps) {
  if (!target) return null;

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
  const [nativeDim, setNativeDim] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });

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
    initialPan: { x: 0, y: 0 }
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
  const [isDraggingTimeline, setIsDraggingTimeline] = useState<'playhead' | 'start' | 'end' | 'range' | null>(null);
  const timelineDragRef = useRef<{ startX: number; startIn: number; startOut: number; dur: number }>({
    startX: 0,
    startIn: 0,
    startOut: 0,
    dur: 10
  });

  // Timeline Hover
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number | null>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaSrc = target.url.startsWith('http') || target.url.startsWith('cosmo:') || target.url.startsWith('asset:')
    ? target.url
    : toCosmoUrl(target.realPath || target.url);

  // Load video metadata
  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration || 10;
    setDuration(dur);
    setStartTime(0);
    setEndTime(dur);
    if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
      setNativeDim({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight
      });
    }
  };

  // Keep playback within [startTime, endTime] when loopSelection is active
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

  const togglePlay = () => {
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
  };

  const seekTo = (time: number) => {
    const clamped = Math.max(0, Math.min(duration, time));
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
  };

  const stepFrame = (frames: number) => {
    const fps = 30;
    const delta = frames / fps;
    seekTo(currentTime + delta);
  };

  const setInPoint = () => {
    const newStart = Math.min(currentTime, endTime - 0.1);
    setStartTime(Math.max(0, newStart));
  };

  const setOutPoint = () => {
    const newEnd = Math.max(currentTime, startTime + 0.1);
    setEndTime(Math.min(duration, newEnd));
  };

  const jumpToIn = () => {
    seekTo(startTime);
  };

  const jumpToOut = () => {
    seekTo(endTime);
  };

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
    setCropBox(prev => {
      const newX = Math.max(0, (100 - prev.width) / 2);
      const newY = Math.max(0, (100 - prev.height) / 2);
      return { ...prev, x: newX, y: newY };
    });
  };

  // Adjust crop box when aspect ratio changes
  const applyAspectRatio = (ratioId: AspectRatio) => {
    setAspectRatio(ratioId);
    if (ratioId === 'free') return;

    const item = ASPECT_RATIOS.find(r => r.id === ratioId);
    if (!item || !item.ratio || !nativeDim.width || !nativeDim.height) return;

    const targetRatio = item.ratio;
    const videoAspect = nativeDim.width / nativeDim.height;
    let newW = 100;
    let newH = 100;

    if (targetRatio > videoAspect) {
      // Wider than video aspect
      newW = 100;
      newH = (videoAspect / targetRatio) * 100;
    } else {
      // Taller than video aspect
      newH = 100;
      newW = (targetRatio / videoAspect) * 100;
    }

    const newX = (100 - newW) / 2;
    const newY = (100 - newH) / 2;

    setCropBox({
      x: Math.max(0, newX),
      y: Math.max(0, newY),
      width: Math.min(100, newW),
      height: Math.min(100, newH)
    });
  };

  // Change playback speed
  const cyclePlaybackRate = () => {
    const rates = [0.25, 0.5, 1, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  // Viewport Zoom via Wheel
  const handleWheelZoom = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoomScale(prev => {
      const next = Math.max(1, Math.min(4, prev + delta));
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  // Viewport Pan drag
  const handleViewportMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    if (e.button === 1 || e.altKey || (e.button === 0 && !enableCrop)) {
      e.preventDefault();
      setIsPanningViewport(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        initialPan: { ...panOffset }
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
        y: panStartRef.current.initialPan.y + dy
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

  // Keyboard navigation shortcuts
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
        setLoopSelection(prev => !prev);
      } else if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setEnableCrop(prev => !prev);
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
  }, [currentTime, startTime, endTime, duration, isPlaying, playbackRate, enableCrop]);

  // Timeline Dragging Handler
  const handleTimelineMouseDown = (e: React.MouseEvent, type: 'playhead' | 'start' | 'end' | 'range') => {
    e.stopPropagation();
    setIsDraggingTimeline(type);
    timelineDragRef.current = {
      startX: e.clientX,
      startIn: startTime,
      startOut: endTime,
      dur: duration
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
  }, [isDraggingTimeline, duration, startTime, endTime]);

  // Crop Box Dragging Handler
  const handleCropMouseDown = (e: React.MouseEvent, handle: string | null) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingCrop(true);
    setDragHandle(handle);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      crop: { ...cropBox }
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
        // Move entire crop box
        const newX = Math.max(0, Math.min(100 - initial.width, initial.x + dxPercent));
        const newY = Math.max(0, Math.min(100 - initial.height, initial.y + dyPercent));
        setCropBox(prev => ({ ...prev, x: newX, y: newY }));
      } else {
        // Resize handle
        let newX = initial.x;
        let newY = initial.y;
        let newW = initial.width;
        let newH = initial.height;

        if (dragHandle.includes('e')) newW = Math.max(8, Math.min(100 - initial.x, initial.width + dxPercent));
        if (dragHandle.includes('s')) newH = Math.max(8, Math.min(100 - initial.y, initial.height + dyPercent));
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
          height: Math.max(8, Math.min(100 - newY, newH))
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

  // Execute Export Action
  const handleExport = async (overwrite: boolean) => {
    const effectivePath = target.realPath || toRealPath(target.url);
    if (!effectivePath) {
      setErrorMessage("Cannot export: Target media does not have a valid local filesystem path.");
      return;
    }

    setIsProcessing(true);
    setProcessingMsg(overwrite ? 'Trimming & replacing video in-place...' : 'Rendering new trimmed clip...');
    setErrorMessage(null);

    const isFullCrop = !enableCrop || (cropBox.x <= 1 && cropBox.y <= 1 && cropBox.width >= 98 && cropBox.height >= 98);

    const pixelX = enableCrop ? Math.round((cropBox.x / 100) * nativeDim.width) : undefined;
    const pixelY = enableCrop ? Math.round((cropBox.y / 100) * nativeDim.height) : undefined;
    const pixelW = enableCrop ? Math.round((cropBox.width / 100) * nativeDim.width) : undefined;
    const pixelH = enableCrop ? Math.round((cropBox.height / 100) * nativeDim.height) : undefined;

    if (videoRef.current) {
      videoRef.current.pause();
      try {
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch (e) {
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
          lossless: false
        });

        addLog(`⚡ Trim & Crop Complete: Exported to "${resultPath}"`);
        onSuccess(resultPath, overwrite, target.id);
        onClose();
      } else {
        throw new Error("Tauri runtime not available");
      }
    } catch (err: any) {
      console.error("Trim/Crop export failed:", err);
      setErrorMessage(typeof err === 'string' ? err : err?.message || JSON.stringify(err));
      if (videoRef.current && mediaSrc) {
        videoRef.current.src = mediaSrc;
        videoRef.current.load();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const trimDuration = Math.max(0, endTime - startTime);
  const croppedPixelW = enableCrop ? Math.round((cropBox.width / 100) * nativeDim.width) : nativeDim.width;
  const croppedPixelH = enableCrop ? Math.round((cropBox.height / 100) * nativeDim.height) : nativeDim.height;
  const isLossless = !enableCrop || (cropBox.x <= 1 && cropBox.y <= 1 && cropBox.width >= 98 && cropBox.height >= 98);

  return (
    <div 
      className="modal-backdrop active" 
      style={{ 
        position: 'fixed', 
        inset: 0, 
        backgroundColor: 'rgba(5, 7, 12, 0.88)', 
        backdropFilter: 'blur(28px) saturate(180%)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) onClose(); }}
    >
      <div 
        className="trim-crop-studio-container"
        style={{
          background: 'linear-gradient(180deg, rgba(16, 20, 28, 0.95) 0%, rgba(10, 13, 20, 0.98) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '1180px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.85), 0 0 1px 1px rgba(255, 255, 255, 0.1), 0 0 45px rgba(0, 255, 136, 0.12)',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Ambient Top Glow Line */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '15%',
          right: '15%',
          height: '2px',
          background: 'linear-gradient(90deg, transparent 0%, var(--accent, #00ff88) 50%, transparent 100%)',
          opacity: 0.8,
          pointerEvents: 'none'
        }} />

        {/* Header Bar */}
        <div style={{
          padding: '14px 22px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.25) 0%, rgba(0, 229, 255, 0.15) 100%)',
              border: '1px solid rgba(0, 255, 136, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent, #00ff88)',
              boxShadow: '0 0 15px rgba(0, 255, 136, 0.2)'
            }}>
              <Scissors size={18} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                  Trim, Crop & Pan Studio
                </span>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '12px',
                  background: isLossless ? 'rgba(0, 255, 136, 0.15)' : 'rgba(0, 229, 255, 0.15)',
                  color: isLossless ? 'var(--accent, #00ff88)' : '#00e5ff',
                  border: `1px solid ${isLossless ? 'rgba(0, 255, 136, 0.3)' : 'rgba(0, 229, 255, 0.3)'}`
                }}>
                  {isLossless ? '⚡ Lossless Stream Cut' : '🎨 Re-encode Render'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#fff', fontWeight: 600, maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {target.title}
                </span>
                <span>•</span>
                <span>{nativeDim.width} × {nativeDim.height}</span>
                <span>•</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => useStore.getState().setWhatsAppShareTarget(target)}
              title="Share"
              style={{
                background: 'rgba(0, 255, 136, 0.12)',
                border: '1px solid rgba(0, 255, 136, 0.35)',
                color: 'var(--accent, #00ff88)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 255, 136, 0.22)';
                e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 255, 136, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
              }}
            >
              <Share2 size={14} />
              <span>Share</span>
            </button>

            <button
              onClick={onClose}
              disabled={isProcessing}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.7)',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onMouseEnter={(e) => { 
                e.currentTarget.style.color = '#fff'; 
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; 
                e.currentTarget.style.transform = 'scale(1.08) rotate(90deg)';
              }}
              onMouseLeave={(e) => { 
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'; 
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; 
                e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Viewport Stage */}
        <div 
          ref={viewportRef}
          onWheel={handleWheelZoom}
          onMouseDown={handleViewportMouseDown}
          style={{
            display: 'flex',
            flex: 1,
            minHeight: '380px',
            maxHeight: '52vh',
            background: 'radial-gradient(circle at 50% 50%, #131722 0%, #06080d 100%)',
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: zoomScale > 1 ? (isPanningViewport ? 'grabbing' : 'grab') : 'default',
            userSelect: 'none'
          }}
        >
          {/* Subtle Grid Background */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 0)',
            backgroundSize: '24px 24px',
            pointerEvents: 'none',
            opacity: 0.5
          }} />

          {/* Floating Zoom Indicator & Reset View Badge */}
          {zoomScale > 1 && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '16px',
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '20px',
              padding: '4px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              zIndex: 30,
              boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
            }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent, #00ff88)' }}>
                {Math.round(zoomScale * 100)}% Zoom
              </span>
              <button
                onClick={() => { setZoomScale(1); setPanOffset({ x: 0, y: 0 }); }}
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Reset Fit
              </button>
            </div>
          )}

          {/* Video Container */}
          <div 
            ref={containerRef}
            style={{
              position: 'relative',
              maxWidth: '100%',
              maxHeight: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
              transition: isPanningViewport ? 'none' : 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
              transformOrigin: 'center center'
            }}
          >
            <video
              ref={videoRef}
              src={mediaSrc}
              muted={isMuted}
              playsInline
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onClick={togglePlay}
              style={{
                maxWidth: '100%',
                maxHeight: '48vh',
                display: 'block',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)'
              }}
            />

            {/* Viewfinder Crop Overlay */}
            {enableCrop && (
              <div 
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 10
                }}
              >
                {/* Crop Box with Shaded Backdrop and Neon Border */}
                <div 
                  style={{
                    position: 'absolute',
                    left: `${cropBox.x}%`,
                    top: `${cropBox.y}%`,
                    width: `${cropBox.width}%`,
                    height: `${cropBox.height}%`,
                    border: '2px solid var(--accent, #00ff88)',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.68), 0 0 20px rgba(0, 255, 136, 0.45)',
                    cursor: 'move',
                    pointerEvents: 'auto',
                    borderRadius: '2px'
                  }}
                  onMouseDown={(e) => handleCropMouseDown(e, null)}
                  onDoubleClick={centerCropBox}
                >
                  {/* Grid Lines (Rule of Thirds) */}
                  <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: '1px', borderLeft: '1px dashed rgba(255, 255, 255, 0.35)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: '1px', borderLeft: '1px dashed rgba(255, 255, 255, 0.35)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255, 255, 255, 0.35)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255, 255, 255, 0.35)', pointerEvents: 'none' }} />

                  {/* Center Crosshair Target */}
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: '12px',
                    height: '12px',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none'
                  }}>
                    <div style={{ position: 'absolute', left: '5px', top: 0, bottom: 0, width: '2px', background: 'rgba(0, 255, 136, 0.7)' }} />
                    <div style={{ position: 'absolute', top: '5px', left: 0, right: 0, height: '2px', background: 'rgba(0, 255, 136, 0.7)' }} />
                  </div>

                  {/* Floating Dimension Badge */}
                  <div style={{
                    position: 'absolute',
                    top: '-28px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(10, 14, 22, 0.92)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(0, 255, 136, 0.4)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 800,
                    color: '#fff',
                    letterSpacing: '0.4px',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.6)'
                  }}>
                    <span style={{ color: 'var(--accent, #00ff88)' }}>{croppedPixelW} × {croppedPixelH} px</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 4px' }}>•</span>
                    <span style={{ color: '#00e5ff' }}>{aspectRatio.toUpperCase()}</span>
                  </div>

                  {/* Camera Viewfinder L-Brackets on Corners */}
                  {/* Top-Left */}
                  <div style={{ position: 'absolute', top: '-3px', left: '-3px', width: '12px', height: '12px', borderTop: '3px solid #fff', borderLeft: '3px solid #fff', pointerEvents: 'none' }} />
                  {/* Top-Right */}
                  <div style={{ position: 'absolute', top: '-3px', right: '-3px', width: '12px', height: '12px', borderTop: '3px solid #fff', borderRight: '3px solid #fff', pointerEvents: 'none' }} />
                  {/* Bottom-Left */}
                  <div style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '12px', height: '12px', borderBottom: '3px solid #fff', borderLeft: '3px solid #fff', pointerEvents: 'none' }} />
                  {/* Bottom-Right */}
                  <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '12px', height: '12px', borderBottom: '3px solid #fff', borderRight: '3px solid #fff', pointerEvents: 'none' }} />

                  {/* 8 Interactive Handles */}
                  {[
                    { id: 'nw', cursor: 'nwse-resize', top: '-6px', left: '-6px' },
                    { id: 'n', cursor: 'ns-resize', top: '-6px', left: 'calc(50% - 6px)' },
                    { id: 'ne', cursor: 'nesw-resize', top: '-6px', left: 'calc(100% - 6px)' },
                    { id: 'e', cursor: 'ew-resize', top: 'calc(50% - 6px)', left: 'calc(100% - 6px)' },
                    { id: 'se', cursor: 'nwse-resize', top: 'calc(100% - 6px)', left: 'calc(100% - 6px)' },
                    { id: 's', cursor: 'ns-resize', top: 'calc(100% - 6px)', left: 'calc(50% - 6px)' },
                    { id: 'sw', cursor: 'nesw-resize', top: 'calc(100% - 6px)', left: '-6px' },
                    { id: 'w', cursor: 'ew-resize', top: 'calc(50% - 6px)', left: '-6px' },
                  ].map(h => (
                    <div
                      key={h.id}
                      onMouseDown={(e) => handleCropMouseDown(e, h.id)}
                      style={{
                        position: 'absolute',
                        width: '12px',
                        height: '12px',
                        background: 'var(--accent, #00ff88)',
                        border: '2px solid #000',
                        borderRadius: h.id.length === 1 ? '3px' : '50%',
                        top: h.top,
                        left: h.left,
                        cursor: h.cursor,
                        pointerEvents: 'auto',
                        zIndex: 25,
                        boxShadow: '0 0 6px rgba(0, 255, 136, 0.8)',
                        transition: 'transform 0.1s ease'
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Toolbar & Aspect Controls Bar */}
        <div style={{
          padding: '10px 22px',
          background: 'rgba(255, 255, 255, 0.025)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Crop Mode Switcher & Aspect Ratio Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setEnableCrop(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                background: enableCrop 
                  ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.25) 0%, rgba(0, 229, 255, 0.15) 100%)' 
                  : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${enableCrop ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.12)'}`,
                color: enableCrop ? 'var(--accent, #00ff88)' : '#fff',
                boxShadow: enableCrop ? '0 0 15px rgba(0, 255, 136, 0.25)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              <Crop size={15} />
              {enableCrop ? 'Crop Active (C)' : 'Enable Crop (C)'}
            </button>

            {enableCrop && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px', 
                background: 'rgba(0, 0, 0, 0.45)', 
                padding: '3px 5px', 
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                {ASPECT_RATIOS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => applyAspectRatio(item.id)}
                    title={item.desc}
                    style={{
                      background: aspectRatio === item.id 
                        ? 'var(--accent, #00ff88)' 
                        : 'transparent',
                      color: aspectRatio === item.id ? '#000' : 'rgba(255, 255, 255, 0.75)',
                      border: 'none',
                      padding: '4px 9px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: aspectRatio === item.id ? 800 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {item.label}
                  </button>
                ))}

                <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.12)', margin: '0 2px' }} />

                <button
                  onClick={centerCropBox}
                  title="Center Crop Box"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.6)',
                    padding: '5px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'}
                >
                  <Compass size={13} />
                </button>

                <button
                  onClick={resetCrop}
                  title="Reset Full Crop Box"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.6)',
                    padding: '5px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'}
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            )}
          </div>

          {/* View Zoom, Speed, Audio Options */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Zoom Controls */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '4px 8px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <ZoomIn size={13} style={{ color: 'rgba(255,255,255,0.6)' }} />
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoomScale}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setZoomScale(val);
                  if (val === 1) setPanOffset({ x: 0, y: 0 });
                }}
                style={{ width: '75px', accentColor: 'var(--accent, #00ff88)' }}
              />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#fff', width: '34px' }}>
                {Math.round(zoomScale * 100)}%
              </span>
            </div>

            {/* Playback Speed Switcher */}
            <button
              onClick={cyclePlaybackRate}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: playbackRate !== 1 ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.8)',
                padding: '5px 9px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Playback Speed (Click to cycle)"
            >
              <span>{playbackRate}x</span>
            </button>

            {/* Mute Audio Toggle */}
            <button
              onClick={() => setIsMuted(prev => !prev)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: isMuted ? 'rgba(255, 255, 255, 0.4)' : 'var(--accent, #00ff88)',
                padding: '6px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          </div>
        </div>

        {/* Multi-Track Precision Timeline & Transport */}
        <div style={{
          padding: '14px 22px',
          background: 'rgba(0, 0, 0, 0.5)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          {/* Real-time Timecode Readouts */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '12px',
            marginBottom: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 700 }}>IN</span>
              <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 700, background: 'rgba(0,255,136,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                {formatTime(startTime)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 700 }}>POS</span>
                <span style={{ color: '#ffffff', fontWeight: 800, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                  {formatTime(currentTime)}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 700 }}>LENGTH</span>
                <span style={{ color: '#00e5ff', fontWeight: 800, background: 'rgba(0,229,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                  {formatTime(trimDuration)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 700 }}>OUT</span>
              <span style={{ color: '#00e5ff', fontWeight: 700, background: 'rgba(0,229,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                {formatTime(endTime)}
              </span>
            </div>
          </div>

          {/* Timeline Scrubber Track */}
          <div 
            ref={timelineRef}
            onMouseMove={(e) => {
              if (!timelineRef.current) return;
              const rect = timelineRef.current.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setHoverTime(ratio * duration);
              setHoverPos(e.clientX - rect.left);
            }}
            onMouseLeave={() => {
              setHoverTime(null);
              setHoverPos(null);
            }}
            onClick={(e) => {
              if (timelineRef.current && !isDraggingTimeline) {
                const rect = timelineRef.current.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                seekTo(ratio * duration);
              }
            }}
            style={{
              position: 'relative',
              height: '42px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              cursor: 'pointer',
              overflow: 'hidden',
              userSelect: 'none',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)'
            }}
          >
            {/* Time Ruler Ticks along top edge */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '8px', display: 'flex', justifyContent: 'space-between', opacity: 0.25, pointerEvents: 'none' }}>
              {Array.from({ length: 21 }).map((_, i) => (
                <div key={i} style={{ width: '1px', height: i % 5 === 0 ? '8px' : '4px', background: '#fff' }} />
              ))}
            </div>

            {/* Selected In-Out Highlight Region */}
            <div 
              onMouseDown={(e) => handleTimelineMouseDown(e, 'range')}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(startTime / duration) * 100}%`,
                width: `${((endTime - startTime) / duration) * 100}%`,
                background: 'linear-gradient(90deg, rgba(0, 255, 136, 0.18) 0%, rgba(0, 229, 255, 0.18) 100%)',
                borderLeft: '2px solid var(--accent, #00ff88)',
                borderRight: '2px solid #00e5ff',
                cursor: 'grab',
                boxShadow: '0 0 15px rgba(0, 255, 136, 0.15)'
              }}
            />

            {/* In-Point Handle [IN] */}
            <div
              onMouseDown={(e) => handleTimelineMouseDown(e, 'start')}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `calc(${(startTime / duration) * 100}% - 10px)`,
                width: '20px',
                cursor: 'ew-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 15
              }}
            >
              <div style={{
                width: '6px',
                height: '28px',
                background: 'var(--accent, #00ff88)',
                borderRadius: '3px',
                boxShadow: '0 0 8px rgba(0, 255, 136, 0.8)',
                border: '1px solid #000'
              }} />
            </div>

            {/* Out-Point Handle [OUT] */}
            <div
              onMouseDown={(e) => handleTimelineMouseDown(e, 'end')}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `calc(${(endTime / duration) * 100}% - 10px)`,
                width: '20px',
                cursor: 'ew-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 15
              }}
            >
              <div style={{
                width: '6px',
                height: '28px',
                background: '#00e5ff',
                borderRadius: '3px',
                boxShadow: '0 0 8px rgba(0, 229, 255, 0.8)',
                border: '1px solid #000'
              }} />
            </div>

            {/* Hover Ghost Cursor & Tooltip */}
            {hoverTime !== null && hoverPos !== null && (
              <>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${hoverPos}px`,
                  width: '1px',
                  background: 'rgba(255, 255, 255, 0.4)',
                  pointerEvents: 'none',
                  zIndex: 18
                }} />
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  left: `${Math.max(30, Math.min((timelineRef.current?.clientWidth || 300) - 30, hoverPos))}px`,
                  transform: 'translateX(-50%)',
                  background: 'rgba(0, 0, 0, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  padding: '1px 5px',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#fff',
                  pointerEvents: 'none',
                  zIndex: 22
                }}>
                  {formatTime(hoverTime)}
                </div>
              </>
            )}

            {/* Playhead Laser Cursor */}
            <div
              onMouseDown={(e) => handleTimelineMouseDown(e, 'playhead')}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `calc(${(currentTime / duration) * 100}% - 7px)`,
                width: '14px',
                cursor: 'ew-resize',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 20
              }}
            >
              {/* Playhead Diamond Cap */}
              <div style={{
                width: '12px',
                height: '12px',
                background: '#ffffff',
                transform: 'rotate(45deg)',
                borderRadius: '2px',
                boxShadow: '0 0 10px rgba(255, 255, 255, 0.9), 0 2px 4px rgba(0,0,0,0.8)',
                border: '1px solid #000',
                marginTop: '-1px'
              }} />
              {/* Laser Needle */}
              <div style={{ width: '2px', flex: 1, background: '#ffffff', boxShadow: '0 0 6px rgba(255,255,255,0.8)' }} />
            </div>
          </div>

          {/* Transport & Key Controls Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '12px'
          }}>
            {/* Left Transport Cluster */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Jump to IN */}
              <button
                onClick={jumpToIn}
                title="Jump to IN Point (Home)"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  padding: '7px 9px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600
                }}
              >
                |◀
              </button>

              {/* Step -5 frames */}
              <button
                onClick={() => stepFrame(-5)}
                title="Step -5 Frames (Shift + Left)"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  padding: '7px 9px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <Rewind size={14} />
              </button>

              {/* Step -1 frame */}
              <button
                onClick={() => stepFrame(-1)}
                title="Step -1 Frame (Left Arrow)"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  padding: '7px 9px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <ChevronLeft size={16} />
              </button>

              {/* Central Play/Pause Button */}
              <button
                onClick={togglePlay}
                style={{
                  background: 'var(--accent, #00ff88)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '50%',
                  width: '38px',
                  height: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 800,
                  boxShadow: '0 0 20px rgba(0, 255, 136, 0.4)',
                  transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                  transform: isPlaying ? 'scale(1.04)' : 'scale(1)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = isPlaying ? 'scale(1.04)' : 'scale(1)'}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
              </button>

              {/* Step +1 frame */}
              <button
                onClick={() => stepFrame(1)}
                title="Step +1 Frame (Right Arrow)"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  padding: '7px 9px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <ChevronRight size={16} />
              </button>

              {/* Step +5 frames */}
              <button
                onClick={() => stepFrame(5)}
                title="Step +5 Frames (Shift + Right)"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  padding: '7px 9px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <FastForward size={14} />
              </button>

              {/* Jump to OUT */}
              <button
                onClick={jumpToOut}
                title="Jump to OUT Point (End)"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  padding: '7px 9px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600
                }}
              >
                ▶|
              </button>
            </div>

            {/* Middle Loop Button */}
            <button
              onClick={() => setLoopSelection(prev => !prev)}
              style={{
                background: loopSelection ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${loopSelection ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.1)'}`,
                color: loopSelection ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.6)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <RefreshCw size={12} className={loopSelection ? 'spin-once' : ''} />
              Loop Range (L)
            </button>

            {/* Right Set In/Out Cluster */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={setInPoint}
                style={{
                  background: 'rgba(0, 255, 136, 0.12)',
                  border: '1px solid rgba(0, 255, 136, 0.35)',
                  color: 'var(--accent, #00ff88)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Set [IN] (I)
              </button>

              <button
                onClick={setOutPoint}
                style={{
                  background: 'rgba(0, 229, 255, 0.12)',
                  border: '1px solid rgba(0, 229, 255, 0.35)',
                  color: '#00e5ff',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Set [OUT] (O)
              </button>

              <button
                onClick={resetTrim}
                title="Reset Trim Bounds"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'rgba(255, 255, 255, 0.6)',
                  padding: '6px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer & Action Controls */}
        <div style={{
          padding: '16px 22px',
          background: 'rgba(255, 255, 255, 0.015)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Status or Hotkeys */}
          {errorMessage ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ff4d4d', fontWeight: 600 }}>
              <AlertTriangle size={15} />
              {errorMessage}
            </div>
          ) : isProcessing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--accent, #00ff88)', fontWeight: 700 }}>
              <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(0,255,136,0.3)', borderTopColor: '#00ff88', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              {processingMsg}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
              <span>Hotkeys:</span>
              <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 5px', borderRadius: '4px', color: '#fff', fontWeight: 600 }}>Space</span> (Play)
              <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 5px', borderRadius: '4px', color: '#fff', fontWeight: 600 }}>I</span> (In)
              <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 5px', borderRadius: '4px', color: '#fff', fontWeight: 600 }}>O</span> (Out)
              <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 5px', borderRadius: '4px', color: '#fff', fontWeight: 600 }}>&lt; / &gt;</span> (Frame Step)
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => useStore.getState().setWhatsAppShareTarget(target)}
              title="Share"
              style={{
                background: 'rgba(0, 255, 136, 0.12)',
                border: '1px solid rgba(0, 255, 136, 0.35)',
                color: 'var(--accent, #00ff88)',
                padding: '9px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 255, 136, 0.22)';
                e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 255, 136, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
              }}
            >
              <Share2 size={15} />
              <span>Share...</span>
            </button>

            <button
              onClick={onClose}
              disabled={isProcessing}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.75)',
                padding: '9px 18px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.75)'; }}
            >
              Cancel
            </button>

            <button
              onClick={() => handleExport(true)}
              disabled={isProcessing}
              style={{
                background: 'rgba(255, 77, 77, 0.12)',
                border: '1px solid rgba(255, 77, 77, 0.35)',
                color: '#ff6666',
                padding: '9px 18px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 77, 77, 0.22)'; e.currentTarget.style.borderColor = '#ff4d4d'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 77, 77, 0.12)'; e.currentTarget.style.borderColor = 'rgba(255, 77, 77, 0.35)'; }}
            >
              Replace Video In-Place
            </button>

            <button
              onClick={() => handleExport(false)}
              disabled={isProcessing}
              style={{
                background: 'linear-gradient(135deg, var(--accent, #00ff88) 0%, #00e5ff 100%)',
                border: 'none',
                color: '#000',
                padding: '9px 22px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 20px rgba(0, 255, 136, 0.35)',
                transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 255, 136, 0.5)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 255, 136, 0.35)'; }}
            >
              <Check size={16} strokeWidth={3} />
              Save as New Clip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
