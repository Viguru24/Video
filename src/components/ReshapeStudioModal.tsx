import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { convertToVideoUrl, toCosmoUrl } from '../utils/videoUtils';
import { useStore } from '../store/useStore';
import { ReshapeSuccessModal } from './reshape/ReshapeSuccessModal';
import { ReshapeToolbar } from './reshape/ReshapeToolbar';

interface ReshapeStudioModalProps {
  video: VideoItem;
  isOpen: boolean;
  onClose: () => void;
  onLog?: (msg: string) => void;
  setVideos?: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  onFocusMedia?: (id: string) => void;
  onUpdateVideo?: (id: string, updates: Partial<VideoItem>) => void;
}

export function ReshapeStudioModal({
  video,
  isOpen,
  onClose,
  onLog,
  setVideos,
  onFocusMedia,
  onUpdateVideo
}: ReshapeStudioModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [activeTab, setActiveTab] = useState<'stretch' | 'sculpt'>('stretch');

  // Overall Aspect Stretch state
  const [scaleX, setScaleX] = useState<number>(1.0); // Thinner (0.5) <-> Normal (1.0) <-> Wider (1.8)
  const [scaleY, setScaleY] = useState<number>(1.0); // Shorter (0.5) <-> Normal (1.0) <-> Taller (1.8)

  // Localized Sculpting (Inflate/Deflate/Blemish Eraser) state
  const [sculptMode, setSculptMode] = useState<'inflate' | 'deflate' | 'blemish'>('blemish');
  const [brushSize, setBrushSize] = useState<number>(30); // Default 30px for spot blemish
  const [brushStrength, setBrushStrength] = useState<number>(0.5);
  const [isSculpting, setIsSculpting] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 1. Interactive Before / After Split View state
  const [showSplitView, setShowSplitView] = useState<boolean>(false);
  const [splitPos, setSplitPos] = useState<number>(0.5); // 0.0 to 1.0
  const isDraggingSplitRef = useRef<boolean>(false);

  // 2. Multi-Step Undo / Redo History Stack
  const [historyStack, setHistoryStack] = useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState<number>(-1);

  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchDims = async () => {
      try {
        const targetPath = (video.folderFiles && video.currentIdx !== undefined)
          ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url)
          : (video.realPath || video.url);

        const [w, h] = await invoke<[number, number]>('get_media_dimensions', { path: targetPath });
        if (w && h) {
          setImgSize({ w, h });
        }
      } catch (err) {
        console.error("Failed to query raw dimensions from backend:", err);
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = convertToVideoUrl(video);
      img.onload = () => {
        originalImgRef.current = img;
        setImgSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });

        const off = document.createElement('canvas');
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const ctx = off.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          offscreenCanvasRef.current = off;
          renderCanvas();
          // Save initial pristine image as history step 0
          const initialData = ctx.getImageData(0, 0, off.width, off.height);
          setHistoryStack([initialData]);
          setHistoryStep(0);
        }
      };
    };

    fetchDims();
  }, [video, isOpen]);

  // Viewport Zoom & Pan state for extreme precision sculpting
  const [viewZoom, setViewZoom] = useState<number>(1.0); // 0.5x to 5.0x
  const [panPos, setPanPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number }>({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  // Cursor-centered Wheel Zoom & Pan (Only when Ctrl key is held or scrolling over canvas)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      // Require Ctrl key or Alt key to zoom with mouse wheel so normal scrolling isn't hijacked
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;

      setViewZoom((prevZoom) => {
        const nextZoom = Math.max(0.5, Math.min(6.0, parseFloat((prevZoom * zoomFactor).toFixed(2))));
        if (nextZoom === prevZoom) return prevZoom;

        // Shift panPos so the point under the cursor stays under the cursor
        const scaleChange = nextZoom / prevZoom;
        setPanPos((prevPan) => ({
          x: mouseX - (mouseX - prevPan.x) * scaleChange,
          y: mouseY - (mouseY - prevPan.y) * scaleChange
        }));

        return nextZoom;
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isOpen]);

  const handlePointerDownContainer = (e: React.PointerEvent) => {
    // If split view is on, clicking anywhere dismisses split view
    if (showSplitView) {
      setShowSplitView(false);
    }

    // Right click (button 2), Middle click (button 1), or Space held down for Pan
    if (e.button === 2 || e.button === 1 || e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      panStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: panPos.x,
        panY: panPos.y
      };
    }
  };

  const handlePointerMoveContainer = (e: React.PointerEvent) => {
    if (isPanning) {
      const deltaX = e.clientX - panStartRef.current.mouseX;
      const deltaY = e.clientY - panStartRef.current.mouseY;
      setPanPos({
        x: panStartRef.current.panX + deltaX,
        y: panStartRef.current.panY + deltaY
      });
    }
  };

  const handlePointerUpContainer = () => {
    if (isPanning) {
      setIsPanning(false);
    }
  };

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
  }, [isOpen]);

  // History Stack (Undo / Redo) helpers
  const saveHistoryState = () => {
    const offCanvas = offscreenCanvasRef.current;
    if (!offCanvas) return;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;

    const data = ctx.getImageData(0, 0, offCanvas.width, offCanvas.height);
    setHistoryStack((prev) => {
      const sliced = prev.slice(0, historyStep + 1);
      if (sliced.length >= 25) sliced.shift();
      return [...sliced, data];
    });
    setHistoryStep((prev) => Math.min(24, prev + 1));
  };

  const handleUndo = () => {
    if (historyStep <= 0 || !historyStack[historyStep - 1] || !offscreenCanvasRef.current) return;
    const prevData = historyStack[historyStep - 1];
    const ctx = offscreenCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.putImageData(prevData, 0, 0);
      setHistoryStep((prev) => prev - 1);
      renderCanvas();
    }
  };

  const handleRedo = () => {
    if (historyStep >= historyStack.length - 1 || !historyStack[historyStep + 1] || !offscreenCanvasRef.current) return;
    const nextData = historyStack[historyStep + 1];
    const ctx = offscreenCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.putImageData(nextData, 0, 0);
      setHistoryStep((prev) => prev + 1);
      renderCanvas();
    }
  };

  // Keyboard Shortcuts: Ctrl+Z (Undo) / Ctrl+Y (Redo) / [ and ] (Brush Size)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === '[') {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : (brushSize <= 10 ? 1 : 3);
        setBrushSize(prev => Math.max(1, prev - delta));
      } else if (e.key === ']') {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : (brushSize < 10 ? 1 : 3);
        setBrushSize(prev => Math.min(600, prev + delta));
      } else if (e.key === 'Escape') {
        if (showSplitView) {
          e.preventDefault();
          setShowSplitView(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, historyStep, historyStack, brushSize, showSplitView]);

  const renderCanvas = () => {
    const mainCanvas = canvasRef.current;
    const offCanvas = offscreenCanvasRef.current;
    if (!mainCanvas || !offCanvas) return;

    mainCanvas.width = offCanvas.width;
    mainCanvas.height = offCanvas.height;
    const ctx = mainCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    ctx.save();
    const centerX = mainCanvas.width / 2;
    const centerY = mainCanvas.height / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(scaleX, scaleY);

    if (showSplitView && originalImgRef.current) {
      // 1. Draw edited canvas
      ctx.drawImage(offCanvas, -centerX, -centerY);

      // 2. Clip and draw original photo on left portion according to splitPos
      const splitX = -centerX + mainCanvas.width * splitPos;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-centerX, -centerY, mainCanvas.width * splitPos, mainCanvas.height);
      ctx.clip();
      ctx.drawImage(originalImgRef.current, -centerX, -centerY, mainCanvas.width, mainCanvas.height);
      ctx.restore();

      // 3. Draw vertical glowing divider line & handle
      ctx.beginPath();
      ctx.moveTo(splitX, -centerY);
      ctx.lineTo(splitX, centerY);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 4 / Math.max(scaleX, scaleY);
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 10;
      ctx.stroke();
    } else {
      ctx.drawImage(offCanvas, -centerX, -centerY);
    }

    ctx.restore();
  };

  useEffect(() => {
    if (isOpen) renderCanvas();
  }, [scaleX, scaleY, showSplitView, splitPos, isOpen]);

  // Professional 2D Vector Displacement Warp & Smooth Skin Brush
  const applySculptWarp = (cx: number, cy: number) => {
    const offCanvas = offscreenCanvasRef.current;
    if (!offCanvas) return;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;

    const width = offCanvas.width;
    const height = offCanvas.height;
    const radius = brushSize;

    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(height - 1, Math.ceil(cy + radius));

    const regionW = maxX - minX + 1;
    const regionH = maxY - minY + 1;
    if (regionW <= 0 || regionH <= 0) return;

    const imgData = ctx.getImageData(minX, minY, regionW, regionH);
    const pixels = imgData.data;
    const copyData = new Uint8ClampedArray(pixels);

    if (sculptMode === 'blemish') {
      // 🩹 Spot Blemish Eraser: Content-Aware Texture Interpolation
      let sumR = 0, sumG = 0, sumB = 0, count = 0;

      // Sample clean skin pixels on circle perimeter
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
        const bx = Math.round(cx + Math.cos(angle) * (radius - 2));
        const by = Math.round(cy + Math.sin(angle) * (radius - 2));
        const rx = Math.max(0, Math.min(regionW - 1, bx - minX));
        const ry = Math.max(0, Math.min(regionH - 1, by - minY));
        const idx = (ry * regionW + rx) * 4;
        sumR += copyData[idx];
        sumG += copyData[idx + 1];
        sumB += copyData[idx + 2];
        count++;
      }

      const avgR = count > 0 ? sumR / count : 128;
      const avgG = count > 0 ? sumG / count : 128;
      const avgB = count > 0 ? sumB / count : 128;

      const blendStrength = Math.min(1.0, brushStrength * 0.9);

      for (let y = 0; y < regionH; y++) {
        const realY = minY + y;
        const dy = realY - cy;

        for (let x = 0; x < regionW; x++) {
          const realX = minX + x;
          const dx = realX - cx;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < radius) {
            const idx = (y * regionW + x) * 4;
            const normDist = dist / radius;
            // Cosine smooth radial falloff
            const weight = (1 - Math.cos((1 - normDist) * Math.PI / 2)) * blendStrength;

            pixels[idx] = Math.round(pixels[idx] * (1 - weight) + avgR * weight);
            pixels[idx + 1] = Math.round(pixels[idx + 1] * (1 - weight) + avgG * weight);
            pixels[idx + 2] = Math.round(pixels[idx + 2] * (1 - weight) + avgB * weight);
          }
        }
      }
    } else {
      // 2D Vector Displacement Warp (Inflate / Deflate)
      const strength = sculptMode === 'inflate' ? brushStrength * 0.4 : -brushStrength * 0.4;
      for (let y = 0; y < regionH; y++) {
        const realY = minY + y;
        const dy = realY - cy;

        for (let x = 0; x < regionW; x++) {
          const realX = minX + x;
          const dx = realX - cx;
          const distSq = dx * dx + dy * dy;

          if (distSq < radius * radius && distSq > 0) {
            const normDist = Math.sqrt(distSq) / radius;
            const factor = strength * Math.pow(1 - normDist * normDist, 2);

            const srcX = Math.round(x - factor * dx);
            const srcY = Math.round(y - factor * dy);

            const clampedSrcX = Math.max(0, Math.min(regionW - 1, srcX));
            const clampedSrcY = Math.max(0, Math.min(regionH - 1, srcY));

            const targetIdx = (y * regionW + x) * 4;
            const srcIdx = (clampedSrcY * regionW + clampedSrcX) * 4;

            pixels[targetIdx] = copyData[srcIdx];
            pixels[targetIdx + 1] = copyData[srcIdx + 1];
            pixels[targetIdx + 2] = copyData[srcIdx + 2];
            pixels[targetIdx + 3] = copyData[srcIdx + 3];
          }
        }
      }
    }

    ctx.putImageData(imgData, minX, minY);
    renderCanvas();
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // If split view is on, clicking anywhere on the image immediately dismisses split view
    if (showSplitView) {
      setShowSplitView(false);
    }

    if (activeTab !== 'sculpt') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleFactorX = canvas.width / rect.width;
    const scaleFactorY = canvas.height / rect.height;

    const cx = (e.clientX - rect.left) * scaleFactorX;
    const cy = (e.clientY - rect.top) * scaleFactorY;

    // Save history snapshot BEFORE applying brush stroke for 100% reliable Undo/Redo
    saveHistoryState();

    setIsSculpting(true);
    applySculptWarp(cx, cy);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleFactorX = canvas.width / rect.width;
    const scaleFactorY = canvas.height / rect.height;

    const cx = (e.clientX - rect.left) * scaleFactorX;
    const cy = (e.clientY - rect.top) * scaleFactorY;

    // Convert raw image canvas coordinates (cx, cy) to container element coordinates
    const canvasX = (cx / canvas.width) * visibleW;
    const canvasY = (cy / canvas.height) * visibleH;
    setMousePos({ x: canvasX, y: canvasY });

    if (isSculpting && activeTab === 'sculpt') {
      applySculptWarp(cx, cy);
    }
  };

  const handleCanvasPointerUp = () => {
    setIsSculpting(false);
  };

  const resetAllReshape = () => {
    setScaleX(1.0);
    setScaleY(1.0);
    if (originalImgRef.current && offscreenCanvasRef.current) {
      const off = offscreenCanvasRef.current;
      const ctx = off.getContext('2d');
      if (ctx) {
        ctx.drawImage(originalImgRef.current, 0, 0);
        renderCanvas();
      }
    }
  };

  const [saveSuccessNotice, setSaveSuccessNotice] = useState<{ open: boolean; path: string } | null>(null);

  const handleSaveReshape = async (saveAsCopy: boolean = true) => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return;

    try {
      setIsSaving(true);
      const dataUrl = mainCanvas.toDataURL('image/png');
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');

      const targetPath = (video.folderFiles && video.currentIdx !== undefined)
        ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url)
        : (video.realPath || video.url);

      const savedPath = await invoke<string>('save_adjusted_image_bytes', {
        path: targetPath,
        base64Data,
        saveAsCopy
      });

      if (onLog) onLog(`Reshape: ${saveAsCopy ? 'Saved new copy' : 'Overwrote photo'} -> ${savedPath}`);

      const liveCosmoUrl = `${toCosmoUrl(savedPath)}?t=${Date.now()}`;

      if (setVideos) {
        if (saveAsCopy) {
          const separator = savedPath.includes('\\') ? '\\' : '/';
          const fileNameWithExt = savedPath.substring(savedPath.lastIndexOf(separator) + 1);
          const extIdx = fileNameWithExt.lastIndexOf('.');
          const cleanTitle = extIdx !== -1 ? fileNameWithExt.substring(0, extIdx) : fileNameWithExt;

          const newUnit: VideoItem = {
            id: `reshaped-${Date.now()}`,
            title: `${video.title.replace(/\s*\(Reshaped\)/i, '')} (Reshaped)`,
            url: liveCosmoUrl,
            realPath: savedPath,
            currentTime: 0,
            playing: false,
            muted: video.muted,
            repeatMode: 'none',
            repeatCount: 0,
            cols: video.cols || 1
          };

          setVideos(prev => {
            const currentIdx = prev.findIndex(item => item.id === video.id);
            if (currentIdx !== -1) {
              const next = [...prev];
              next.splice(currentIdx + 1, 0, newUnit);
              return next;
            }
            return [...prev, newUnit];
          });
          useStore.getState().setSortOrder('custom');
          onFocusMedia?.(newUnit.id);
        } else {
          // Overwrite in place
          setVideos(prev => prev.map(v => {
            if (v.id === video.id) {
              return {
                ...v,
                url: liveCosmoUrl,
                realPath: savedPath
              };
            }
            return v;
          }));
          onUpdateVideo?.(video.id, { url: liveCosmoUrl, realPath: savedPath });
          onFocusMedia?.(video.id);
        }
      }

      onClose();
    } catch (err: any) {
      console.error('Failed to save reshaped image:', err);
      alert(`Error saving image: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const imgRatio = (imgSize.w * scaleX) / (imgSize.h * scaleY);
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

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDownContainer}
      onPointerMove={handlePointerMoveContainer}
      onPointerUp={handlePointerUpContainer}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 250000,
        background: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : 'default'
      }}
    >
      {/* Top Header */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '20px',
          right: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 250002
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '1px' }}>
            ✨ Reshape Studio
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>— {video.title}</span>

          {/* Quick Viewport Zoom & Pan Reset Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '2px 6px', marginLeft: '12px' }}>
            <button
              onClick={() => setViewZoom(prev => Math.max(0.5, parseFloat((prev - 0.25).toFixed(2))))}
              title="Zoom Out (Mouse Wheel Down)"
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '14px', padding: '2px 6px', cursor: 'pointer' }}
            >
              −
            </button>
            <span
              onClick={() => {
                setViewZoom(1.0);
                setPanPos({ x: 0, y: 0 });
              }}
              title="Click to reset 100% zoom and center image"
              style={{ fontSize: '10px', color: '#ffffff', fontWeight: 'bold', cursor: 'pointer', padding: '0 4px', textAlign: 'center' }}
            >
              Zoom: {Math.round(viewZoom * 100)}%
            </span>
            <button
              onClick={() => setViewZoom(prev => Math.min(6.0, parseFloat((prev + 0.25).toFixed(2))))}
              title="Zoom In (Mouse Wheel Up)"
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '14px', padding: '2px 6px', cursor: 'pointer' }}
            >
              +
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => handleSaveReshape(true)}
            disabled={isSaving}
            style={{
              background: 'var(--accent, #00ff88)',
              border: 'none',
              color: '#000',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: isSaving ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: '0 0 12px rgba(0, 255, 136, 0.35)',
              transition: 'all 0.2s'
            }}
          >
            ➕ {isSaving ? 'Saving...' : 'Save as Copy'}
          </button>

          <button
            onClick={() => handleSaveReshape(false)}
            disabled={isSaving}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#fff',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: isSaving ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.2s'
            }}
          >
            💾 Overwrite
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#fff',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Floating Split View Status Banner */}
      {showSplitView && (
        <div
          onClick={() => setShowSplitView(false)}
          style={{
            position: 'absolute',
            top: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid rgba(0, 229, 255, 0.6)',
            borderRadius: '20px',
            padding: '5px 14px',
            color: '#00e5ff',
            fontSize: '11px',
            fontWeight: 800,
            cursor: 'pointer',
            zIndex: 250004,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.9)'
          }}
          title="Click anywhere to dismiss Split View"
        >
          <span>↔️ Split View Active</span>
          <span style={{ color: '#fff', opacity: 0.7, fontSize: '10px' }}>(Click anywhere on image to dismiss)</span>
          <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px' }}>✕</span>
        </div>
      )}

      {/* Render Canvas Wrapper with Viewport Zoom and Pan */}
      <div
        style={{
          position: 'absolute',
          left: `${offsetX}px`,
          top: `${offsetY}px`,
          width: `${visibleW}px`,
          height: `${visibleH}px`,
          transform: `translate(${panPos.x}px, ${panPos.y}px) scale(${viewZoom})`,
          transformOrigin: 'center center',
          transition: isPanning ? 'none' : 'transform 0.05s ease-out',
          boxShadow: '0 10px 40px rgba(0,0,0,0.8)'
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: activeTab === 'sculpt' ? 'crosshair' : 'default'
          }}
        />

        {/* Sculpting Brush Cursor */}
        {activeTab === 'sculpt' && mousePos && (
          <div
            style={{
              position: 'absolute',
              left: `${mousePos.x}px`,
              top: `${mousePos.y}px`,
              width: `${brushSize * 2 * (visibleW / imgSize.w)}px`,
              height: `${brushSize * 2 * (visibleH / imgSize.h)}px`,
              borderRadius: '50%',
              border: `2px dashed ${sculptMode === 'inflate' ? '#00ff88' : '#ff4d4d'}`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              boxShadow: `0 0 10px ${sculptMode === 'inflate' ? 'rgba(0,255,136,0.4)' : 'rgba(255,77,77,0.4)'}`
            }}
          />
        )}
      </div>

      {/* Maximized Control HUD Bar */}
      <ReshapeToolbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        showSplitView={showSplitView}
        setShowSplitView={setShowSplitView}
        historyStep={historyStep}
        historyStackLength={historyStack.length}
        onUndo={handleUndo}
        onRedo={handleRedo}
        isSaving={isSaving}
        onSaveCopy={() => handleSaveReshape(true)}
        onSaveOverwrite={() => handleSaveReshape(false)}
        scaleX={scaleX}
        setScaleX={setScaleX}
        scaleY={scaleY}
        setScaleY={setScaleY}
        sculptMode={sculptMode}
        setSculptMode={setSculptMode}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        brushStrength={brushStrength}
        setBrushStrength={setBrushStrength}
        onReset={resetAllReshape}
      />

      {/* Premium Glassmorphic Save Success Dialog */}
      {saveSuccessNotice && saveSuccessNotice.open && (
        <ReshapeSuccessModal
          path={saveSuccessNotice.path}
          onLog={onLog}
          onClose={() => {
            setSaveSuccessNotice(null);
            onClose();
          }}
        />
      )}
    </div>
  );
}
