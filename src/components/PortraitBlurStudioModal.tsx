import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { convertToVideoUrl, toRealPath, toCosmoUrl } from '../utils/videoUtils';
import { useStore } from '../store/useStore';

interface PortraitBlurStudioModalProps {
  video: VideoItem;
  isOpen: boolean;
  onClose: () => void;
  onLog?: (msg: string) => void;
  setVideos?: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  onFocusMedia?: (id: string) => void;
  onUpdateVideo?: (id: string, updates: Partial<VideoItem>) => void;
}

export function PortraitBlurStudioModal({
  video,
  isOpen,
  onClose,
  onLog,
  setVideos,
  onFocusMedia,
  onUpdateVideo
}: PortraitBlurStudioModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [imgSize, setImgSize] = useState({ w: 800, h: 600 });
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

  // AI Segmentation State
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(true);
  const [aiError, setAiError] = useState<string | null>(null);

  // Blur Control State
  const [blurRadius, setBlurRadius] = useState<number>(25); // 0 to 60px bokeh blur
  const [edgeTrim, setEdgeTrim] = useState<number>(2); // 0 to 8px edge choke trim
  const [antiHaloBleed, setAntiHaloBleed] = useState<boolean>(true); // Erase subject skin bleed from background
  const [subjectBrightness, setSubjectBrightness] = useState<number>(1.0); // 0.8 to 1.3
  const [showSplitView, setShowSplitView] = useState<boolean>(false);
  const [splitPos, setSplitPos] = useState<number>(0.5);

  const [isSaving, setIsSaving] = useState<boolean>(false);

  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const cutoutImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;
    setIsLoadingAi(true);
    setAiError(null);

    const loadImages = async () => {
      try {
        const rawPath = (video.folderFiles && video.currentIdx !== undefined)
          ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url)
          : (video.realPath || video.url);

        const targetPath = toRealPath(rawPath) || rawPath;

        // 1. Load Original Photo
        const origImg = new Image();
        origImg.crossOrigin = 'anonymous';
        origImg.src = toCosmoUrl(targetPath);
        await new Promise((res, rej) => {
          origImg.onload = res;
          origImg.onerror = rej;
        });
        originalImgRef.current = origImg;
        if (isSubscribed) {
          setImgSize({ w: origImg.naturalWidth || 800, h: origImg.naturalHeight || 600 });
        }

        if (onLog) onLog(`AI: Isolating subject for Portrait Blur from: ${video.title}...`);

        // 2. Invoke AI Subject Cutout in Rust Backend
        const cutoutPath = await invoke<string>('extract_subject_on_disk', { path: targetPath });

        const cutoutImg = new Image();
        cutoutImg.crossOrigin = 'anonymous';
        cutoutImg.src = toCosmoUrl(cutoutPath);
        await new Promise((res, rej) => {
          cutoutImg.onload = res;
          cutoutImg.onerror = rej;
        });
        cutoutImgRef.current = cutoutImg;

        if (isSubscribed) {
          setIsLoadingAi(false);
          if (onLog) onLog(`AI Portrait Segmentation complete! Subject isolated successfully.`);
        }
      } catch (err: any) {
        console.error('AI Portrait Segmentation error:', err);
        if (isSubscribed) {
          setIsLoadingAi(false);
          setAiError(err?.message || String(err));
        }
      }
    };

    loadImages();

    return () => {
      isSubscribed = false;
    };
  }, [video, isOpen]);

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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showSplitView) {
        e.preventDefault();
        setShowSplitView(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showSplitView]);

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    const origImg = originalImgRef.current;
    const cutoutImg = cutoutImgRef.current;
    if (!canvas || !origImg) return;

    const w = origImg.naturalWidth || 800;
    const h = origImg.naturalHeight || 600;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Background Layer (Optical Bokeh Blur)
    ctx.save();
    if (blurRadius > 0) {
      ctx.filter = `blur(${blurRadius}px) saturate(108%) contrast(102%) brightness(0.97)`;
      ctx.drawImage(origImg, 0, 0, w, h);
    } else {
      ctx.filter = 'none';
      ctx.drawImage(origImg, 0, 0, w, h);
    }
    ctx.restore();

    // 2. Draw Crystal-Sharp Foreground Subject on Top
    if (cutoutImg) {
      // If edgeTrim > 0 and blur is active, add subtle ambient contact occlusion for realistic lens transition
      if (edgeTrim > 0 && blurRadius > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.35, edgeTrim * 0.08);
        ctx.filter = `blur(${Math.min(10, edgeTrim * 2)}px) brightness(0)`;
        ctx.drawImage(cutoutImg, 0, 0, w, h);
        ctx.restore();
      }

      ctx.save();
      if (subjectBrightness !== 1.0) {
        ctx.filter = `brightness(${subjectBrightness}) contrast(102%)`;
      }
      // Draw 100% crisp, sharp foreground subject!
      ctx.drawImage(cutoutImg, 0, 0, w, h);
      ctx.restore();
    }

    // 3. Interactive Before / After Split View Overlay
    if (showSplitView) {
      const splitX = Math.round(w * splitPos);
      ctx.save();
      // Left side shows Original Photo (100% sharp everywhere)
      ctx.beginPath();
      ctx.rect(0, 0, splitX, h);
      ctx.clip();
      ctx.filter = 'none';
      ctx.drawImage(origImg, 0, 0, w, h);
      ctx.restore();

      // Divider Line
      ctx.strokeStyle = 'var(--accent, #00ff88)';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, h);
      ctx.stroke();

      // Handle Label Badges
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(splitX - 70, 20, 60, 22);
      ctx.fillRect(splitX + 10, 20, 85, 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('ORIGINAL', splitX - 63, 34);
      ctx.fillStyle = 'var(--accent, #00ff88)';
      ctx.fillText('AI PORTRAIT', splitX + 15, 34);
    }
  };

  useEffect(() => {
    if (isOpen && !isLoadingAi) renderCanvas();
  }, [blurRadius, edgeTrim, antiHaloBleed, subjectBrightness, showSplitView, splitPos, isLoadingAi, isOpen]);

  const handleSavePortraitBlur = async (saveAsCopy: boolean = true) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      setIsSaving(true);
      // Use high quality JPEG (0.92) to keep file size compact (~1.2MB instead of 13MB uncompressed PNG)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '').replace(/^data:image\/png;base64,/, '');

      const targetPath = (video.folderFiles && video.currentIdx !== undefined)
        ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url)
        : (video.realPath || video.url);

      const savedPath = await invoke<string>('save_adjusted_image_bytes', {
        path: targetPath,
        base64Data,
        saveAsCopy
      });

      if (onLog) onLog(`AI Portrait Blur: ${saveAsCopy ? 'Saved new copy' : 'Overwrote photo'} -> ${savedPath}`);

      const liveCosmoUrl = `${toCosmoUrl(savedPath)}?t=${Date.now()}`;

      if (setVideos) {
        if (saveAsCopy) {
          const separator = savedPath.includes('\\') ? '\\' : '/';
          const fileNameWithExt = savedPath.substring(savedPath.lastIndexOf(separator) + 1);
          const extIdx = fileNameWithExt.lastIndexOf('.');
          const cleanTitle = extIdx !== -1 ? fileNameWithExt.substring(0, extIdx) : fileNameWithExt;

          const newUnit: VideoItem = {
            id: `portrait-${Date.now()}`,
            title: `${video.title.replace(/\s*\(Portrait\)/i, '')} (Portrait)`,
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
      console.error('Failed to save AI Portrait Blur photo:', err);
      alert(`Error saving photo: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const canvasRatio = imgSize.w / imgSize.h;
  const containerRatio = containerSize.w / containerSize.h;

  let visibleW = containerSize.w * 0.85;
  let visibleH = containerSize.h * 0.85;

  if (canvasRatio > containerRatio) {
    visibleH = visibleW / canvasRatio;
  } else {
    visibleW = visibleH * canvasRatio;
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 250000,
        background: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '1px' }}>
            ✨ AI Portrait Background Blur (Bokeh)
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>— {video.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => handleSavePortraitBlur(true)}
            disabled={isSaving || isLoadingAi}
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
            onClick={() => handleSavePortraitBlur(false)}
            disabled={isSaving || isLoadingAi}
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

      {/* AI Processing Loading Screen */}
      {isLoadingAi && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            color: '#fff',
            zIndex: 250003
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              border: '3px solid rgba(0, 255, 136, 0.2)',
              borderTopColor: 'var(--accent, #00ff88)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}
          />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent, #00ff88)' }}>
              AI Subject Segmentation in Progress...
            </span>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              Isolating subject to keep person sharp while blurring background
            </span>
          </div>
        </div>
      )}

      {/* Error Fallback */}
      {!isLoadingAi && aiError && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            color: '#ff4d4d',
            maxWidth: '400px',
            textAlign: 'center'
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>AI Subject Extraction Failed</span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{aiError}</span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: '12px',
              cursor: 'pointer'
            }}
          >
            CLOSE
          </button>
        </div>
      )}
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
            border: '1px solid rgba(0, 255, 136, 0.6)',
            borderRadius: '20px',
            padding: '5px 14px',
            color: 'var(--accent, #00ff88)',
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

      {/* Main Canvas Viewport */}
      {!isLoadingAi && !aiError && (
        <div
          onClick={() => {
            if (showSplitView) setShowSplitView(false);
          }}
          style={{
            width: `${visibleW}px`,
            height: `${visibleH}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: showSplitView ? 'pointer' : 'default'
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              borderRadius: '8px'
            }}
          />
        </div>
      )}

      {/* Ultra-Compact Control Strip */}
      {!isLoadingAi && !aiError && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.38)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '20px',
            padding: '5px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            zIndex: 250002
          }}
        >
          {/* Background Blur Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 700 }}>Blur:</span>
            <input
              type="range"
              min="0"
              max="50"
              value={blurRadius}
              onChange={(e) => {
                setBlurRadius(parseInt(e.target.value));
                if (showSplitView) setShowSplitView(false);
              }}
              style={{ width: '80px', accentColor: 'var(--accent, #00ff88)' }}
            />
            <span style={{ fontSize: '9px', color: 'var(--accent, #00ff88)', fontWeight: 800, width: '22px' }}>
              {blurRadius}px
            </span>
          </div>

          {/* Subject Brightness / Pop Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 700 }}>Pop:</span>
            <input
              type="range"
              min="0.8"
              max="1.3"
              step="0.05"
              value={subjectBrightness}
              onChange={(e) => {
                setSubjectBrightness(parseFloat(e.target.value));
                if (showSplitView) setShowSplitView(false);
              }}
              style={{ width: '70px', accentColor: 'var(--accent, #00ff88)' }}
            />
            <span style={{ fontSize: '9px', color: 'var(--accent, #00ff88)', fontWeight: 800, width: '28px' }}>
              {Math.round(subjectBrightness * 100)}%
            </span>
          </div>

          {/* Interactive Split View Toggle */}
          <button
            onClick={() => setShowSplitView(!showSplitView)}
            onPointerDown={() => setShowSplitView(true)}
            onPointerUp={() => setShowSplitView(false)}
            style={{
              background: showSplitView ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.07)',
              border: 'none',
              color: showSplitView ? '#000' : 'rgba(255,255,255,0.8)',
              padding: '3px 8px',
              borderRadius: '8px',
              fontSize: '9px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
            title="Click or Hold to Compare (Auto-dismisses on click elsewhere)"
          >
            {showSplitView ? '↔️ Split: ON' : '↔️ Split'}
          </button>

          <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.12)' }} />

          {/* Save Actions */}
          <button
            onClick={() => handleSavePortraitBlur(true)}
            disabled={isSaving || isLoadingAi}
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
            onClick={() => handleSavePortraitBlur(false)}
            disabled={isSaving || isLoadingAi}
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
        </div>
      )}
    </div>
  );
}
