import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { convertToVideoUrl } from '../utils/videoUtils';

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
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

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
      if (dragHandle.includes('left')) {
        const maxX = dragStart.current.boxX + dragStart.current.boxW - 10;
        newX = Math.max(0, Math.min(maxX, dragStart.current.boxX + deltaX));
        newW = dragStart.current.boxX + dragStart.current.boxW - newX;
      }
      if (dragHandle.includes('right')) {
        newW = Math.max(10, Math.min(100 - dragStart.current.boxX, dragStart.current.boxW + deltaX));
      }
      if (dragHandle.includes('top')) {
        const maxY = dragStart.current.boxY + dragStart.current.boxH - 10;
        newY = Math.max(0, Math.min(maxY, dragStart.current.boxY + deltaY));
        newH = dragStart.current.boxY + dragStart.current.boxH - newY;
      }
      if (dragHandle.includes('bottom')) {
        newH = Math.max(10, Math.min(100 - dragStart.current.boxY, dragStart.current.boxH + deltaY));
      }

      if (targetRatio) {
        if (dragHandle.includes('left') || dragHandle.includes('right')) {
          newH = newW / targetRatio;
          if (dragHandle.includes('top')) {
            newY = dragStart.current.boxY + dragStart.current.boxH - newH;
          }
        } else {
          newW = newH * targetRatio;
          if (dragHandle.includes('left')) {
            newX = dragStart.current.boxX + dragStart.current.boxW - newW;
          }
        }

        if (newX < 0) {
          newX = 0;
          newW = dragStart.current.boxX + dragStart.current.boxW;
          newH = newW / targetRatio;
          if (dragHandle.includes('top')) {
            newY = dragStart.current.boxY + dragStart.current.boxH - newH;
          }
        }
        if (newY < 0) {
          newY = 0;
          newH = dragStart.current.boxY + dragStart.current.boxH;
          newW = newH * targetRatio;
          if (dragHandle.includes('left')) {
            newX = dragStart.current.boxX + dragStart.current.boxW - newW;
          }
        }
        if (newX + newW > 100) {
          newW = 100 - newX;
          newH = newW / targetRatio;
        }
        if (newY + newH > 100) {
          newH = 100 - newY;
          newW = newH * targetRatio;
        }
      }
    }

    setCropBox({
      x: Math.round(newX * 10) / 10,
      y: Math.round(newY * 10) / 10,
      w: Math.round(newW * 10) / 10,
      h: Math.round(newH * 10) / 10
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setIsDragging(false);
      setDragHandle(null);
    }
  };

  return (
    <div 
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        zIndex: 200000
      }}
    >
      <div
        id="crop-visible-container"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'absolute',
          left: `${offsetX}px`,
          top: `${offsetY}px`,
          width: `${visibleW}px`,
          height: `${visibleH}px`,
          touchAction: 'none',
          userSelect: 'none'
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${cropBox.y}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: `${100 - (cropBox.y + cropBox.h)}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: `${cropBox.y}%`, left: 0, width: `${cropBox.x}%`, height: `${cropBox.h}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: `${cropBox.y}%`, right: 0, width: `${100 - (cropBox.x + cropBox.w)}%`, height: `${cropBox.h}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />

        <div
          style={{
            position: 'absolute',
            left: `${cropBox.x}%`,
            top: `${cropBox.y}%`,
            width: `${cropBox.w}%`,
            height: `${cropBox.h}%`,
            border: '2px solid var(--accent)',
            boxShadow: '0 0 20px rgba(0, 255, 136, 0.3)',
            cursor: 'grab'
          }}
          onPointerDown={(e) => handlePointerDown(e, 'move')}
        >
          <div style={{ position: 'absolute', left: '33.33%', top: 0, width: 0, height: '100%', borderLeft: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: '66.66%', top: 0, width: 0, height: '100%', borderLeft: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '33.33%', left: 0, height: 0, width: '100%', borderTop: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '66.66%', left: 0, height: 0, width: '100%', borderTop: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />

          <div
            onPointerDown={(e) => handlePointerDown(e, 'top-left')}
            style={{ position: 'absolute', top: '-6px', left: '-6px', width: '12px', height: '12px', background: 'var(--accent)', border: '2px solid #000', borderRadius: '50%', cursor: 'nwse-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'top-right')}
            style={{ position: 'absolute', top: '-6px', right: '-6px', width: '12px', height: '12px', background: 'var(--accent)', border: '2px solid #000', borderRadius: '50%', cursor: 'nesw-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'bottom-left')}
            style={{ position: 'absolute', bottom: '-6px', left: '-6px', width: '12px', height: '12px', background: 'var(--accent)', border: '2px solid #000', borderRadius: '50%', cursor: 'nesw-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'bottom-right')}
            style={{ position: 'absolute', bottom: '-6px', right: '-6px', width: '12px', height: '12px', background: 'var(--accent)', border: '2px solid #000', borderRadius: '50%', cursor: 'nwse-resize', zIndex: 10 }}
          />

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
        style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 10, 12, 0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '30px',
          padding: '8px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
          zIndex: 200001,
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Aspect Ratio:</span>
        <div style={{ display: 'flex', gap: '8px' }}>
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
                background: aspectRatio === ratio ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: aspectRatio === ratio ? '#000' : '#fff',
                padding: '4px 12px',
                borderRadius: '15px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {ratio.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255, 255, 255, 0.15)' }} />

        <button
          onClick={onSave}
          style={{
            background: 'var(--accent)',
            border: 'none',
            color: '#000',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 0 15px rgba(0, 255, 136, 0.3)',
            transition: 'all 0.2s'
          }}
        >
          SAVE CROP
        </button>

        <button
          onClick={onCancel}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}
