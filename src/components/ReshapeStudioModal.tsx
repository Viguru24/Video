import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { convertToVideoUrl, toCosmoUrl } from '../utils/videoUtils';
import { useStore } from '../store/useStore';

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

  const [hudCollapsed, setHudCollapsed] = useState<boolean>(true);

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

      {/* Collapsible Control HUD Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.38)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '20px',
          padding: hudCollapsed ? '5px 14px' : '6px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
          zIndex: 250002,
          userSelect: 'none',
          maxWidth: '620px',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Toggle Collapse Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: '10px', alignItems: 'center' }}>
            <button
              onClick={() => setActiveTab('stretch')}
              style={{
                background: activeTab === 'stretch' ? 'var(--accent, #00ff88)' : 'transparent',
                color: activeTab === 'stretch' ? '#000' : 'rgba(255,255,255,0.8)',
                border: 'none',
                borderRadius: '7px',
                padding: '3px 9px',
                fontSize: '9px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ↔️ Stretch
            </button>
            <button
              onClick={() => setActiveTab('sculpt')}
              style={{
                background: activeTab === 'sculpt' ? 'var(--accent, #00ff88)' : 'transparent',
                color: activeTab === 'sculpt' ? '#000' : 'rgba(255,255,255,0.8)',
                border: 'none',
                borderRadius: '7px',
                padding: '3px 9px',
                fontSize: '9px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🎨 Sculpt
            </button>
            <button
              onClick={() => setShowSplitView(!showSplitView)}
              onPointerDown={() => setShowSplitView(true)}
              onPointerUp={() => setShowSplitView(false)}
              style={{
                background: showSplitView ? '#00e5ff' : 'rgba(255,255,255,0.07)',
                color: showSplitView ? '#000' : 'rgba(255,255,255,0.8)',
                border: 'none',
                borderRadius: '7px',
                padding: '3px 9px',
                fontSize: '9px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Click or Hold to Compare (Auto-dismisses on click or sculpt)"
            >
              {showSplitView ? '↔️ Split: ON' : '↔️ Split'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {/* Undo & Redo History Buttons */}
            <button
              onClick={handleUndo}
              disabled={historyStep <= 0}
              title="Undo Last Stroke (Ctrl+Z)"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: historyStep > 0 ? '#fff' : 'rgba(255,255,255,0.25)',
                borderRadius: '7px',
                padding: '3px 8px',
                fontSize: '9px',
                cursor: historyStep > 0 ? 'pointer' : 'default'
              }}
            >
              ↩️ Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={historyStep >= historyStack.length - 1}
              title="Redo (Ctrl+Y)"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: historyStep < historyStack.length - 1 ? '#fff' : 'rgba(255,255,255,0.25)',
                borderRadius: '7px',
                padding: '3px 8px',
                fontSize: '9px',
                cursor: historyStep < historyStack.length - 1 ? 'pointer' : 'default'
              }}
            >
              ↪️ Redo
            </button>

            <button
              onClick={() => handleSaveReshape(true)}
              disabled={isSaving}
              style={{
                background: 'var(--accent, #00ff88)',
                border: 'none',
                color: '#000',
                padding: '3px 10px',
                borderRadius: '10px',
                fontSize: '9px',
                fontWeight: 800,
                cursor: isSaving ? 'wait' : 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              ➕ {isSaving ? 'Saving...' : 'Save Copy'}
            </button>
            <button
              onClick={() => handleSaveReshape(false)}
              disabled={isSaving}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: '10px',
                fontSize: '9px',
                fontWeight: 700,
                cursor: isSaving ? 'wait' : 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              💾 Overwrite
            </button>
            <button
              onClick={() => setHudCollapsed(!hudCollapsed)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                borderRadius: '7px',
                padding: '3px 7px',
                fontSize: '9px',
                cursor: 'pointer'
              }}
            >
              {hudCollapsed ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {!hudCollapsed && (
          <>
            {activeTab === 'stretch' && (
              <div style={{ display: 'flex', gap: '16px', width: '100%', justifyContent: 'center', alignItems: 'center', paddingTop: '4px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '160px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
                    <span>Width (Thinner/Wider)</span>
                    <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 'bold' }}>{Math.round(scaleX * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.8"
                    step="0.01"
                    value={scaleX}
                    onChange={(e) => setScaleX(parseFloat(e.target.value))}
                    style={{ accentColor: 'var(--accent, #00ff88)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '160px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
                    <span>Height (Shorter/Taller)</span>
                    <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 'bold' }}>{Math.round(scaleY * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.8"
                    step="0.01"
                    value={scaleY}
                    onChange={(e) => setScaleY(parseFloat(e.target.value))}
                    style={{ accentColor: 'var(--accent, #00ff88)' }}
                  />
                </div>

                <button
                  onClick={resetAllReshape}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: 'none',
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
              </div>
            )}

            {activeTab === 'sculpt' && (
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center', width: '100%', justifyContent: 'center', paddingTop: '4px' }}>
                <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: '6px' }}>
                  <button
                    onClick={() => setSculptMode('blemish')}
                    style={{
                      background: sculptMode === 'blemish' ? 'var(--accent, #00ff88)' : 'transparent',
                      color: sculptMode === 'blemish' ? '#000' : '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    🩹 Spot Blemish Eraser
                  </button>
                  <button
                    onClick={() => setSculptMode('inflate')}
                    style={{
                      background: sculptMode === 'inflate' ? 'rgba(255,255,255,0.2)' : 'transparent',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    🔍 Inflate
                  </button>
                  <button
                    onClick={() => setSculptMode('deflate')}
                    style={{
                      background: sculptMode === 'deflate' ? 'rgba(255,255,255,0.2)' : 'transparent',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    🔍 Deflate
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '150px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>Brush Size:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <input
                        type="number"
                        min="1"
                        max="600"
                        value={brushSize}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val)) setBrushSize(Math.max(1, Math.min(600, val)));
                        }}
                        style={{
                          width: '38px',
                          background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '4px',
                          color: 'var(--accent, #00ff88)',
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '1px 3px',
                          textAlign: 'center'
                        }}
                      />
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>px</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="600"
                    step="1"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value) || 1)}
                    style={{ accentColor: 'var(--accent, #00ff88)' }}
                    title="Brush Size (Shortcut: [ to shrink down to 1px, ] to enlarge)"
                  />
                  <div style={{ display: 'flex', gap: '3px', marginTop: '1px' }}>
                    {[1, 5, 15, 45, 120].map((size) => (
                      <button
                        key={size}
                        onClick={() => setBrushSize(size)}
                        style={{
                          background: brushSize === size ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.08)',
                          color: brushSize === size ? '#000' : 'rgba(255,255,255,0.7)',
                          border: 'none',
                          borderRadius: '3px',
                          fontSize: '8px',
                          fontWeight: 700,
                          padding: '1px 4px',
                          cursor: 'pointer'
                        }}
                      >
                        {size}p
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '110px' }}>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)' }}>Strength: {Math.round(brushStrength * 100)}%</span>
                  <input
                    type="range"
                    min="0.1"
                    max="0.8"
                    step="0.05"
                    value={brushStrength}
                    onChange={(e) => setBrushStrength(parseFloat(e.target.value))}
                    style={{ accentColor: 'var(--accent, #00ff88)' }}
                  />
                </div>

                <button
                  onClick={resetAllReshape}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: 'none',
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Premium Glassmorphic Save Success Dialog */}
      {saveSuccessNotice && saveSuccessNotice.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 28, 0.95), rgba(12, 12, 18, 0.98))',
              border: '1px solid rgba(0, 255, 136, 0.3)',
              borderRadius: '24px',
              padding: '28px 32px',
              width: '440px',
              maxWidth: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 255, 136, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '16px'
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: 'rgba(0, 255, 136, 0.12)',
                border: '2px solid var(--accent, #00ff88)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                color: 'var(--accent, #00ff88)',
                boxShadow: '0 0 20px rgba(0, 255, 136, 0.4)'
              }}
            >
              ✓
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#fff', letterSpacing: '0.5px' }}>
                Photo Saved Successfully!
              </span>
              <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                A reshaped copy has been saved to your disk:
              </span>
            </div>

            <div
              onClick={() => {
                navigator.clipboard.writeText(saveSuccessNotice.path);
                if (onLog) onLog(`Copied file path to clipboard: ${saveSuccessNotice.path}`);
              }}
              title="Click to copy path to clipboard"
              style={{
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '12px',
                padding: '10px 14px',
                fontSize: '11px',
                color: 'var(--accent, #00ff88)',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                width: '100%',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              📋 {saveSuccessNotice.path}
            </div>

            <button
              onClick={() => {
                setSaveSuccessNotice(null);
                onClose();
              }}
              style={{
                marginTop: '8px',
                background: 'linear-gradient(135deg, #00ff88, #00b862)',
                border: 'none',
                color: '#000',
                padding: '10px 32px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '1px',
                boxShadow: '0 4px 20px rgba(0, 255, 136, 0.4)',
                width: '100%'
              }}
            >
              DONE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
