import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, Loader2, User, Share2 } from 'lucide-react';
import type { VideoItem } from '../types';
import { convertToVideoUrl, isTauri } from '../utils/videoUtils';
import { useStore } from '../store/useStore';

interface AutoCropBoxResult {
  x: number;
  y: number;
  w: number;
  h: number;
  detected: boolean;
  label: string;
}

interface CropOverlayProps {
  video: VideoItem;
  cropBox: { x: number; y: number; w: number; h: number };
  setCropBox: React.Dispatch<React.SetStateAction<{ x: number; y: number; w: number; h: number }>>;
  aspectRatio: 'free' | '1:1' | '16:9' | '4:3';
  setAspectRatio: (val: 'free' | '1:1' | '16:9' | '4:3') => void;
  onSave: () => void;
  onCancel: () => void;
}

export function CropOverlay({
  video,
  cropBox,
  setCropBox,
  aspectRatio,
  setAspectRatio,
  onSave,
  onCancel
}: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionLabel, setDetectionLabel] = useState<string | null>(null);

  const detectSubject = useCallback(async () => {
    if (!isTauri()) return;
    try {
      setIsDetecting(true);
      setDetectionLabel("AI finding person / subject...");

      const targetPath = (video.folderFiles && video.currentIdx !== undefined)
        ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url)
        : (video.realPath || video.url);

      if (!targetPath) {
        setIsDetecting(false);
        return;
      }

      const result = await invoke<AutoCropBoxResult>('detect_person_crop', { path: targetPath });
      if (result && result.w > 0 && result.h > 0) {
        setCropBox({
          x: result.x,
          y: result.y,
          w: result.w,
          h: result.h
        });
        setDetectionLabel(result.detected ? `✨ ${result.label}` : "Centered on main area");
      }
    } catch (err) {
      console.error("AI Subject Auto-Crop error:", err);
      setDetectionLabel("Auto-crop fallback applied");
    } finally {
      setIsDetecting(false);
      setTimeout(() => {
        setDetectionLabel(null);
      }, 4000);
    }
  }, [video, setCropBox]);

  useEffect(() => {
    // Run AI person auto-detect automatically when crop overlay opens
    detectSubject();
  }, [video]);

  useEffect(() => {
    const fetchDims = async () => {
      try {
        const targetPath = (video.folderFiles && video.currentIdx !== undefined)
          ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url)
          : (video.realPath || video.url);

        const [w, h] = await invoke<[number, number]>('get_media_dimensions', { path: targetPath });
        if (w && h) {
          setImgSize({ w, h });
          return;
        }
      } catch (err) {
        console.error("Failed to query raw dimensions from backend:", err);
      }

      // Fallback
      const mediaEl = document.querySelector('.solo-container .media-wrapper img, .solo-container .media-wrapper video') as HTMLImageElement | HTMLVideoElement | null;
      if (mediaEl) {
        const isVideo = mediaEl.tagName.toLowerCase() === 'video';
        const w = isVideo ? (mediaEl as HTMLVideoElement).videoWidth : (mediaEl as HTMLImageElement).naturalWidth;
        const h = isVideo ? (mediaEl as HTMLVideoElement).videoHeight : (mediaEl as HTMLImageElement).naturalHeight;
        if (w && h) {
          setImgSize({ w, h });
          return;
        }
      }

      const img = new Image();
      img.src = convertToVideoUrl(video);
      img.onload = () => {
        setImgSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      };
    };

    fetchDims();
  }, [video]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          w: containerRef.current.clientWidth || 800,
          h: containerRef.current.clientHeight || 600
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      // If user scrolls mouse wheel while cropping, dismiss crop overlay so navigation continues smoothly
      if (Math.abs(e.deltaY) > 10) {
        onCancel();
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [onCancel]);

  const imgRatio = imgSize.w / imgSize.h;
  const containerRatio = containerSize.w / containerSize.h;

  let visibleW = containerSize.w;
  let visibleH = containerSize.h;
  let offsetX = 0;
  let offsetY = 0;

  if (imgRatio > containerRatio) {
    visibleW = containerSize.w;
    visibleH = containerSize.w / imgRatio;
    offsetY = (containerSize.h - visibleH) / 2;
  } else {
    visibleH = containerSize.h;
    visibleW = containerSize.h * imgRatio;
    offsetX = (containerSize.w - visibleW) / 2;
  }

  const [isDragging, setIsDragging] = useState(false);
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 });

  const handlePointerDown = (e: React.PointerEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragHandle(handle);
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: cropBox.x,
      boxY: cropBox.y,
      boxW: cropBox.w,
      boxH: cropBox.h
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragHandle) return;
    e.preventDefault();
    e.stopPropagation();

    const deltaX = ((e.clientX - dragStart.current.mouseX) / visibleW) * 100;
    const deltaY = ((e.clientY - dragStart.current.mouseY) / visibleH) * 100;

    let newX = dragStart.current.boxX;
    let newY = dragStart.current.boxY;
    let newW = dragStart.current.boxW;
    let newH = dragStart.current.boxH;

    const targetRatio = aspectRatio === '1:1' ? 1 : aspectRatio === '16:9' ? 16 / 9 : aspectRatio === '4:3' ? 4 / 3 : null;

    if (dragHandle === 'move') {
      newX = Math.max(0, Math.min(100 - newW, dragStart.current.boxX + deltaX));
      newY = Math.max(0, Math.min(100 - newH, dragStart.current.boxY + deltaY));
    } else {
      if (dragHandle.includes('right')) {
        newW = Math.max(2, Math.min(100 - dragStart.current.boxX, dragStart.current.boxW + deltaX));
      }
      if (dragHandle.includes('bottom')) {
        newH = Math.max(2, Math.min(100 - dragStart.current.boxY, dragStart.current.boxH + deltaY));
      }
      if (dragHandle.includes('left')) {
        const rawNewX = Math.max(0, Math.min(dragStart.current.boxX + dragStart.current.boxW - 2, dragStart.current.boxX + deltaX));
        newW = dragStart.current.boxX + dragStart.current.boxW - rawNewX;
        newX = rawNewX;
      }
      if (dragHandle.includes('top')) {
        const rawNewY = Math.max(0, Math.min(dragStart.current.boxY + dragStart.current.boxH - 2, dragStart.current.boxY + deltaY));
        newH = dragStart.current.boxY + dragStart.current.boxH - rawNewY;
        newY = rawNewY;
      }

      if (targetRatio) {
        if (dragHandle === 'right' || dragHandle === 'left') newH = newW / targetRatio;
        else if (dragHandle === 'bottom' || dragHandle === 'top') newW = newH * targetRatio;
        else newH = newW / targetRatio;
      }
    }

    setCropBox({
      x: Math.max(0, Math.min(100 - newW, newX)),
      y: Math.max(0, Math.min(100 - newH, newY)),
      w: Math.max(2, Math.min(100 - newX, newW)),
      h: Math.max(2, Math.min(100 - newY, newH))
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
      setIsDragging(false);
      setDragHandle(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className="crop-overlay-container"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 200000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
      onPointerDown={(e) => {
        // Dismiss crop if clicking on empty overlay space outside the crop box & HUD
        if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('crop-backdrop-mask')) {
          onCancel();
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="crop-backdrop-mask"
        style={{
          position: 'absolute',
          left: `${offsetX}px`,
          top: `${offsetY}px`,
          width: `${visibleW}px`,
          height: `${visibleH}px`
        }}
      >
        {/* Crop Selection Rectangle */}
        <div
          style={{
            position: 'absolute',
            left: `${cropBox.x}%`,
            top: `${cropBox.y}%`,
            width: `${cropBox.w}%`,
            height: `${cropBox.h}%`,
            border: '2px solid var(--accent, #00ff88)',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
            cursor: 'move'
          }}
          onPointerDown={(e) => handlePointerDown(e, 'move')}
        >
          {/* Grid overlay */}
          <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr', pointerEvents: 'none' }}>
            {[...Array(9)].map((_, i) => (
              <div key={i} style={{ border: '0.5px solid rgba(255, 255, 255, 0.2)' }} />
            ))}
          </div>

          {/* Corner Handles */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'top-left')}
            style={{ position: 'absolute', top: '-6px', left: '-6px', width: '14px', height: '14px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '3px', cursor: 'nwse-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'top-right')}
            style={{ position: 'absolute', top: '-6px', right: '-6px', width: '14px', height: '14px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '3px', cursor: 'nesw-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'bottom-left')}
            style={{ position: 'absolute', bottom: '-6px', left: '-6px', width: '14px', height: '14px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '3px', cursor: 'nesw-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'bottom-right')}
            style={{ position: 'absolute', bottom: '-6px', right: '-6px', width: '14px', height: '14px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '3px', cursor: 'nwse-resize', zIndex: 10 }}
          />

          {/* Edge Handles */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'top')}
            style={{ position: 'absolute', top: '-6px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '8px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '4px', cursor: 'ns-resize', zIndex: 9 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'bottom')}
            style={{ position: 'absolute', bottom: '-6px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '8px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '4px', cursor: 'ns-resize', zIndex: 9 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'left')}
            style={{ position: 'absolute', left: '-6px', top: '50%', transform: 'translateY(-50%)', height: '20px', width: '8px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '4px', cursor: 'ew-resize', zIndex: 9 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'right')}
            style={{ position: 'absolute', right: '-6px', top: '50%', transform: 'translateY(-50%)', height: '20px', width: '8px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '4px', cursor: 'ew-resize', zIndex: 9 }}
          />
        </div>
      </div>

      <div
        className="presets-hud"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 10, 12, 0.88)',
          backdropFilter: 'blur(16px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          padding: '5px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
          zIndex: 200001,
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '9px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700, whiteSpace: 'nowrap' }}>Ratio:</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['free', '1:1', '16:9', '4:3'] as const).map(ratio => (
            <button
              key={ratio}
              onClick={() => {
                setAspectRatio(ratio);
                const targetRatio = ratio === '1:1' ? 1 : ratio === '16:9' ? 16/9 : ratio === '4:3' ? 4/3 : null;
                if (targetRatio) {
                  const newH = cropBox.w / targetRatio;
                  if (cropBox.y + newH <= 100) {
                    setCropBox(p => ({ ...p, h: newH }));
                  } else {
                    const newW = cropBox.h * targetRatio;
                    if (cropBox.x + newW <= 100) {
                      setCropBox(p => ({ ...p, w: newW }));
                    } else {
                      const fitW = 60;
                      const fitH = fitW / targetRatio;
                      setCropBox({
                        x: (100 - fitW) / 2,
                        y: (100 - fitH) / 2,
                        w: fitW,
                        h: fitH
                      });
                    }
                  }
                }
              }}
              style={{
                background: aspectRatio === ratio ? 'var(--accent)' : 'rgba(255, 255, 255, 0.07)',
                border: 'none',
                color: aspectRatio === ratio ? '#000' : 'rgba(255,255,255,0.8)',
                padding: '3px 8px',
                borderRadius: '10px',
                fontSize: '9px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
                letterSpacing: '0.3px'
              }}
            >
              {ratio.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.12)' }} />

        {/* AI Auto-Detect Person Button */}
        <button
          onClick={detectSubject}
          disabled={isDetecting}
          title="Intelligently detect person and snap crop rectangle around them"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(0, 255, 136, 0.12)',
            border: '1px solid rgba(0, 255, 136, 0.4)',
            color: 'var(--accent, #00ff88)',
            padding: '3px 9px',
            borderRadius: '10px',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.3px',
            cursor: isDetecting ? 'wait' : 'pointer',
            transition: 'all 0.15s',
            opacity: isDetecting ? 0.7 : 1,
            whiteSpace: 'nowrap'
          }}
          onMouseOver={e => !isDetecting && (e.currentTarget.style.background = 'rgba(0, 255, 136, 0.22)')}
          onMouseOut={e => !isDetecting && (e.currentTarget.style.background = 'rgba(0, 255, 136, 0.12)')}
        >
          {isDetecting ? (
            <Loader2 size={10} className="spin-slow" />
          ) : (
            <Sparkles size={10} />
          )}
          {isDetecting ? 'Detecting...' : 'AI Person'}
        </button>

        <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.12)' }} />

        <button
          onClick={() => useStore.getState().setWhatsAppShareTarget(video)}
          style={{
            background: 'rgba(37, 211, 102, 0.15)',
            border: '1px solid rgba(37, 211, 102, 0.4)',
            color: '#25D366',
            padding: '3px 9px',
            borderRadius: '10px',
            fontSize: '9px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.15s'
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(37, 211, 102, 0.28)';
            e.currentTarget.style.borderColor = '#25D366';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(37, 211, 102, 0.15)';
            e.currentTarget.style.borderColor = 'rgba(37, 211, 102, 0.4)';
          }}
          title="Quick Share (WhatsApp, Telegram, Phone...)"
        >
          <Share2 size={10} />
          Share
        </button>

        <button
          onClick={onSave}
          style={{
            background: 'var(--accent)',
            border: 'none',
            color: '#000',
            padding: '3px 10px',
            borderRadius: '10px',
            fontSize: '9px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s',
            letterSpacing: '0.3px'
          }}
        >
          Save
        </button>

        <button
          onClick={onCancel}
          style={{
            background: 'rgba(255, 255, 255, 0.07)',
            border: 'none',
            color: 'rgba(255,255,255,0.7)',
            padding: '3px 10px',
            borderRadius: '10px',
            fontSize: '9px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)'}
        >
          Cancel
        </button>
      </div>

      {/* Floating Detection Status Notification */}
      {detectionLabel && (
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 20, 15, 0.92)',
            border: '1px solid rgba(0, 255, 136, 0.35)',
            borderRadius: '12px',
            padding: '4px 12px',
            fontSize: '9px',
            fontWeight: 600,
            color: '#00ff88',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            zIndex: 200002,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            pointerEvents: 'none',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <User size={10} />
          <span>{detectionLabel}</span>
        </div>
      )}
    </div>
  );
}
