import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { toCosmoUrl, toRealPath } from '../utils/videoUtils';
import { useStore } from '../store/useStore';

export type FramePreset = 'none' | 'white' | 'polaroid' | 'darkmatte' | 'wood' | 'vintagegold' | 'neon' | 'bevelglass';
export type CornerShape = 'round' | 'chamfer' | 'concave' | 'circle';

interface FrameStudioModalProps {
  video: VideoItem;
  isOpen: boolean;
  onClose: () => void;
  onLog?: (msg: string) => void;
  setVideos?: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  onFocusMedia?: (id: string) => void;
  onUpdateVideo?: (id: string, updates: Partial<VideoItem>) => void;
}

export function FrameStudioModal({ video, isOpen, onClose, onLog, setVideos, onFocusMedia, onUpdateVideo }: FrameStudioModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [framePreset, setFramePreset] = useState<FramePreset>('white');
  const [cornerShape, setCornerShape] = useState<CornerShape>('round');
  const [cornerRadius, setCornerRadius] = useState(32);
  const [borderWidth, setBorderWidth] = useState(24);
  const [useBlurBackdrop, setUseBlurBackdrop] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);

  const effectivePath = video
    ? (video.folderFiles && video.currentIdx !== undefined)
      ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url || '')
      : (video.realPath || video.url || '')
    : '';

  useEffect(() => {
    if (!isOpen || !effectivePath) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImgEl(img);
    img.onerror = () => { onLog?.('FrameStudio: failed to load image'); };
    // Resolve the real disk path and convert to a cosmo:// URL the browser can load
    const realPath = toRealPath(effectivePath) || effectivePath;
    img.src = toCosmoUrl(realPath);
  }, [isOpen, effectivePath]);

  useEffect(() => {
    if (!imgEl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const iw = imgEl.naturalWidth;
    const ih = imgEl.naturalHeight;
    // Resolution-independent scaling factor so frames look rich on full-res camera photos
    const scaleFactor = Math.max(1, Math.min(iw, ih) / 500);
    const pad = Math.round(borderWidth * scaleFactor);
    const totalW = iw + pad * 2;
    const totalH = ih + pad * 2;

    canvas.width = totalW;
    canvas.height = totalH;
    ctx.clearRect(0, 0, totalW, totalH);

    if (framePreset === 'none') {
      ctx.drawImage(imgEl, 0, 0, iw, ih);
      return;
    }

    if (useBlurBackdrop && pad > 0) {
      ctx.save();
      ctx.filter = `blur(${Math.round(24 * scaleFactor)}px)`;
      ctx.drawImage(imgEl, -20 * scaleFactor, -20 * scaleFactor, totalW + 40 * scaleFactor, totalH + 40 * scaleFactor);
      ctx.filter = 'none';
      ctx.restore();
    }

    switch (framePreset) {
      case 'white': ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, totalW, totalH); break;
      case 'polaroid': ctx.fillStyle = '#f8f4ef'; ctx.fillRect(0, 0, totalW, totalH + Math.round(pad * 1.8)); break;
      case 'darkmatte': ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, totalW, totalH); break;
      case 'wood': {
        // --- High-End Gallery Hardwood Frame Architecture ---
        // 1. Fill base dark walnut background
        ctx.fillStyle = '#2A1408';
        ctx.fillRect(0, 0, totalW, totalH);

        // 2. Mitered 4-Plank Framing Function
        const drawMiteredPlank = (
          clipPath: [number, number][],
          isVertical: boolean,
          lightBias: number // 1 = light top/left, -1 = shadow bottom/right
        ) => {
          ctx.save();
          ctx.beginPath();
          clipPath.forEach(([px, py], idx) => {
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.clip();

          // Base rich walnut gradient across the molding profile
          const grad = isVertical
            ? ctx.createLinearGradient(0, 0, totalW, 0)
            : ctx.createLinearGradient(0, 0, 0, totalH);
          
          if (isVertical) {
            grad.addColorStop(0, '#3A1E0E');
            grad.addColorStop(0.3, '#5C341A');
            grad.addColorStop(0.6, '#462512');
            grad.addColorStop(1, '#231006');
          } else {
            grad.addColorStop(0, '#4E2B15');
            grad.addColorStop(0.3, '#6A3D1E');
            grad.addColorStop(0.7, '#44220E');
            grad.addColorStop(1, '#251107');
          }
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, totalW, totalH);

          // Realistic Wood Fibers & Grain running in the direction of each plank
          let seed = isVertical ? 8821 : 3317;
          const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; };

          const fiberCount = Math.round(90 * Math.min(2.5, scaleFactor));
          for (let i = 0; i < fiberCount; i++) {
            const pos = rand() * (isVertical ? totalW : totalH);
            const wobble1 = (rand() - 0.5) * 16 * scaleFactor;
            const wobble2 = (rand() - 0.5) * 16 * scaleFactor;
            const alpha = 0.04 + rand() * 0.15;
            const width = (0.6 + rand() * 1.8) * scaleFactor;
            const isDark = rand() > 0.45;

            ctx.beginPath();
            if (isVertical) {
              ctx.moveTo(pos, 0);
              ctx.bezierCurveTo(pos + wobble1, totalH * 0.35, pos + wobble2, totalH * 0.7, pos, totalH);
            } else {
              ctx.moveTo(0, pos);
              ctx.bezierCurveTo(totalW * 0.35, pos + wobble1, totalW * 0.7, pos + wobble2, totalW, pos);
            }
            ctx.strokeStyle = isDark ? `rgba(18, 7, 2, ${alpha})` : `rgba(215, 145, 80, ${alpha * 0.75})`;
            ctx.lineWidth = width;
            ctx.stroke();
          }

          // Subtle wood pores & texture noise
          const poreCount = Math.round(150 * Math.min(2.5, scaleFactor));
          for (let p = 0; p < poreCount; p++) {
            const px = rand() * totalW;
            const py = rand() * totalH;
            ctx.fillStyle = `rgba(12, 4, 1, ${0.06 + rand() * 0.12})`;
            if (isVertical) {
              ctx.fillRect(px, py, Math.max(1.5, 1.2 * scaleFactor), Math.max(3, (3 + rand() * 6) * scaleFactor));
            } else {
              ctx.fillRect(px, py, Math.max(3, (3 + rand() * 6) * scaleFactor), Math.max(1.5, 1.2 * scaleFactor));
            }
          }

          // Molding profile lighting & bevel shading
          if (lightBias > 0) {
            // Highlight for top/left
            const lightOverlay = isVertical
              ? ctx.createLinearGradient(0, 0, pad, 0)
              : ctx.createLinearGradient(0, 0, 0, pad);
            lightOverlay.addColorStop(0, 'rgba(255, 230, 180, 0.28)');
            lightOverlay.addColorStop(0.5, 'rgba(255, 230, 180, 0.06)');
            lightOverlay.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
            ctx.fillStyle = lightOverlay;
            ctx.fillRect(0, 0, totalW, totalH);
          } else {
            // Shadow for bottom/right
            const darkOverlay = isVertical
              ? ctx.createLinearGradient(totalW - pad, 0, totalW, 0)
              : ctx.createLinearGradient(0, totalH - pad, 0, totalH);
            darkOverlay.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
            darkOverlay.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
            darkOverlay.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
            ctx.fillStyle = darkOverlay;
            ctx.fillRect(0, 0, totalW, totalH);
          }

          ctx.restore();
        };

        // Top Plank (horizontal grain, 45° cuts)
        drawMiteredPlank([[0, 0], [totalW, 0], [totalW - pad, pad], [pad, pad]], false, 1);
        // Bottom Plank (horizontal grain, 45° cuts)
        drawMiteredPlank([[0, totalH], [totalW, totalH], [totalW - pad, totalH - pad], [pad, totalH - pad]], false, -1);
        // Left Plank (vertical grain, 45° cuts)
        drawMiteredPlank([[0, 0], [pad, pad], [pad, totalH - pad], [0, totalH]], true, 1);
        // Right Plank (vertical grain, 45° cuts)
        drawMiteredPlank([[totalW, 0], [totalW, totalH], [totalW - pad, totalH - pad], [totalW - pad, pad]], true, -1);

        // 3. Draw 45° Corner Miter Seam Lines (Physical Joinery)
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = Math.max(1.5, 1.2 * scaleFactor);
        // Top-Left miter seam
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(pad, pad); ctx.stroke();
        // Top-Right miter seam
        ctx.beginPath(); ctx.moveTo(totalW, 0); ctx.lineTo(totalW - pad, pad); ctx.stroke();
        // Bottom-Left miter seam
        ctx.beginPath(); ctx.moveTo(0, totalH); ctx.lineTo(pad, totalH - pad); ctx.stroke();
        // Bottom-Right miter seam
        ctx.beginPath(); ctx.moveTo(totalW, totalH); ctx.lineTo(totalW - pad, totalH - pad); ctx.stroke();

        // 4. Gold Inset Fillet / Accent Bevel around the picture edge
        if (pad >= 10 * scaleFactor) {
          const filletW = Math.max(2, Math.min(4 * scaleFactor, pad * 0.12));
          ctx.strokeStyle = '#D4AF37';
          ctx.lineWidth = filletW;
          ctx.strokeRect(pad - filletW / 2, pad - filletW / 2, iw + filletW, ih + filletW);
          
          ctx.strokeStyle = 'rgba(255, 235, 160, 0.55)';
          ctx.lineWidth = Math.max(1, 1 * scaleFactor);
          ctx.beginPath();
          ctx.moveTo(pad - filletW, pad + ih);
          ctx.lineTo(pad - filletW, pad - filletW);
          ctx.lineTo(pad + iw, pad - filletW);
          ctx.stroke();
        }

        // 5. Outer Frame Edge Highlight & Shadow (Physical 3D Border)
        ctx.strokeStyle = 'rgba(255, 220, 160, 0.4)';
        ctx.lineWidth = Math.max(1.5, 1.5 * scaleFactor);
        ctx.beginPath();
        ctx.moveTo(0, totalH);
        ctx.lineTo(0, 0);
        ctx.lineTo(totalW, 0);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = Math.max(1.5, 1.5 * scaleFactor);
        ctx.beginPath();
        ctx.moveTo(totalW, 0);
        ctx.lineTo(totalW, totalH);
        ctx.lineTo(0, totalH);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'vintagegold': {
        const g = ctx.createLinearGradient(0,0,totalW,totalH);
        g.addColorStop(0,'#D4AF37'); g.addColorStop(0.25,'#F5E17A'); g.addColorStop(0.5,'#C8960C'); g.addColorStop(0.75,'#F0D060'); g.addColorStop(1,'#B8860B');
        ctx.fillStyle = g; ctx.fillRect(0, 0, totalW, totalH); break;
      }
      case 'neon': {
        ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, totalW, totalH);
        ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 20; ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 3;
        ctx.strokeRect(pad/2, pad/2, iw+pad, ih+pad); ctx.shadowBlur = 0; break;
      }
      case 'bevelglass': {
        const g = ctx.createLinearGradient(0,0,totalW,totalH);
        g.addColorStop(0,'rgba(255,255,255,0.7)'); g.addColorStop(0.4,'rgba(200,220,240,0.5)'); g.addColorStop(0.6,'rgba(150,180,210,0.4)'); g.addColorStop(1,'rgba(100,140,180,0.6)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, totalW, totalH); break;
      }
    }

    const r = Math.min(Math.round(cornerRadius * scaleFactor), iw/2, ih/2);
    const x = pad, y = pad, w = iw, h = ih;
    ctx.save();
    ctx.beginPath();
    if (cornerShape === 'round') {
      ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
    } else if (cornerShape === 'chamfer') {
      ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.lineTo(x+w,y+r);
      ctx.lineTo(x+w,y+h-r); ctx.lineTo(x+w-r,y+h); ctx.lineTo(x+r,y+h);
      ctx.lineTo(x,y+h-r); ctx.lineTo(x,y+r);
    } else if (cornerShape === 'concave') {
      ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
    } else if (cornerShape === 'circle') {
      ctx.arc(x+w/2, y+h/2, Math.min(w,h)/2, 0, Math.PI*2);
    } else {
      ctx.rect(x,y,w,h);
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(imgEl, x, y, w, h);

    // Physical Inset Shadow (makes the photo sit realistically recessed inside the wood molding)
    if (framePreset !== 'none' && pad > 4) {
      const shadowSpread = Math.min(22 * scaleFactor, pad * 0.8);
      // Top-Left deep inner shadow
      const innerShadowTL = ctx.createLinearGradient(x, y, x + shadowSpread, y + shadowSpread);
      innerShadowTL.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
      innerShadowTL.addColorStop(0.5, 'rgba(0, 0, 0, 0.18)');
      innerShadowTL.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = innerShadowTL;
      ctx.fillRect(x, y, w, h);

      // Bottom-Right soft ambient rim light
      const rimLightSpread = Math.min(14 * scaleFactor, pad * 0.5);
      const rimLight = ctx.createLinearGradient(x + w, y + h, x + w - rimLightSpread, y + h - rimLightSpread);
      rimLight.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
      rimLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = rimLight;
      ctx.fillRect(x, y, w, h);
    }

    ctx.restore();
  }, [imgEl, framePreset, cornerShape, cornerRadius, borderWidth, useBlurBackdrop]);

  const handleSaveFramedPhoto = async (saveAsCopy: boolean) => {
    if (!canvasRef.current || !effectivePath) return;
    setIsSaving(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.95);
      const base64 = dataUrl.split(',')[1] || dataUrl;
      const realPath = toRealPath(effectivePath) || effectivePath;

      const savedPath = await invoke<string>('save_adjusted_image_bytes', {
        path: realPath,
        base64Data: base64,
        saveAsCopy
      });

      onLog?.(`FrameStudio: ${saveAsCopy ? 'Saved new framed photo' : 'Overwrote photo'} -> ${savedPath}`);

      if (setVideos) {
        const liveCosmoUrl = `${toCosmoUrl(savedPath)}?t=${Date.now()}`;
        if (saveAsCopy) {
          // Add as a new tile placed right next to the original for instant comparison
          const newUnit: VideoItem = {
            id: `framed-${Date.now()}`,
            title: `${video.title.replace(/\s*\(Framed\)/i, '')} (Framed)`,
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
              const updated = [...prev];
              updated.splice(currentIdx + 1, 0, newUnit);
              return updated;
            }
            return [...prev, newUnit];
          });
          useStore.getState().setSortOrder('custom');
          onFocusMedia?.(newUnit.id);
        } else {
          // Overwrite existing card in-place
          setVideos(prev => prev.map(v => {
            if (v.id === video.id) {
              return {
                ...v,
                url: liveCosmoUrl,
                realPath: savedPath,
                title: v.title
              };
            }
            return v;
          }));
          onUpdateVideo?.(video.id, { url: liveCosmoUrl, realPath: savedPath });
          onFocusMedia?.(video.id);
        }
      }
      onClose();
    } catch (e: any) {
      console.error("FrameStudio Save Error:", e);
      onLog?.(`FrameStudio: Save failed -- ${e}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 250000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '60px 24px 80px', position: 'relative', width: '100%' }}>
        <canvas
          ref={canvasRef}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}
        />
      </div>

      {/* Compact HUD Control Strip */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: '20px',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 8px 28px rgba(0, 0, 0, 0.65)',
          zIndex: 250002,
          maxWidth: '960px',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Frame:</span>
          <select value={framePreset} onChange={(e) => setFramePreset(e.target.value as FramePreset)}
            style={{ background: 'rgba(20,20,28,0.95)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '2px 6px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
            <option value="none">🚫 Borderless</option>
            <option value="white">⬜ Studio White</option>
            <option value="polaroid">📷 Polaroid</option>
            <option value="darkmatte">🖤 Dark Matte</option>
            <option value="wood">🪵 Realistic Oak</option>
            <option value="vintagegold">🏛️ Antique Gold</option>
            <option value="neon">⚡ Neon Glow</option>
            <option value="bevelglass">💎 Glass Bevel</option>
          </select>
        </div>

        <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.12)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Corners:</span>
          <select value={cornerShape} onChange={(e) => setCornerShape(e.target.value as CornerShape)}
            style={{ background: 'rgba(20,20,28,0.95)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '2px 6px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
            <option value="round">🔴 Round</option>
            <option value="chamfer">✂️ Notched</option>
            <option value="concave">🌙 Scalloped</option>
            <option value="circle">⚪ Pill</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)' }}>Radius:</span>
          <input 
            type="range" 
            min="0" 
            max="150" 
            value={cornerRadius} 
            onInput={(e) => setCornerRadius(parseInt((e.target as HTMLInputElement).value))}
            onChange={(e) => setCornerRadius(parseInt(e.target.value))} 
            style={{ width: '60px', accentColor: 'var(--accent, #00ff88)', cursor: 'ew-resize' }} 
          />
          <span style={{ fontSize: '9px', color: 'var(--accent, #00ff88)', fontWeight: 700, minWidth: '22px' }}>{cornerRadius}px</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)' }}>Border:</span>
          <input 
            type="range" 
            min="0" 
            max="80" 
            value={borderWidth} 
            onInput={(e) => setBorderWidth(parseInt((e.target as HTMLInputElement).value))}
            onChange={(e) => setBorderWidth(parseInt(e.target.value))} 
            style={{ width: '55px', accentColor: 'var(--accent, #00ff88)', cursor: 'ew-resize' }} 
          />
          <span style={{ fontSize: '9px', color: 'var(--accent, #00ff88)', fontWeight: 700, minWidth: '22px' }}>{borderWidth}px</span>
        </div>

        <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.12)' }} />

        <button onClick={() => setUseBlurBackdrop(!useBlurBackdrop)}
          style={{ background: useBlurBackdrop ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.07)', border: useBlurBackdrop ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(255,255,255,0.12)', color: useBlurBackdrop ? 'var(--accent,#00ff88)' : 'rgba(255,255,255,0.8)', padding: '3px 8px', borderRadius: '8px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          title="Fills frame backdrop with blurred version of photo">
          {useBlurBackdrop ? '🌫️ Blur: ON' : '🌫️ Blur'}
        </button>

        <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.12)' }} />

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button 
            onClick={() => handleSaveFramedPhoto(true)} 
            disabled={isSaving}
            style={{ 
              background: 'var(--accent,#00ff88)', 
              border: 'none', 
              color: '#000', 
              padding: '4px 10px', 
              borderRadius: '10px', 
              fontSize: '9.5px', 
              fontWeight: 800, 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="Save as a new separate file and add new tile to workspace"
          >
            {isSaving ? 'Saving...' : '➕ Save as Copy'}
          </button>

          <button 
            onClick={() => handleSaveFramedPhoto(false)} 
            disabled={isSaving}
            style={{ 
              background: 'rgba(255, 80, 80, 0.15)', 
              border: '1px solid rgba(255, 80, 80, 0.4)', 
              color: '#ff6666', 
              padding: '4px 10px', 
              borderRadius: '10px', 
              fontSize: '9.5px', 
              fontWeight: 700, 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="Overwrite the original file directly on disk"
          >
            {isSaving ? 'Saving...' : '💾 Overwrite'}
          </button>

          <button 
            onClick={onClose}
            style={{ 
              background: 'rgba(255,255,255,0.07)', 
              border: '1px solid rgba(255, 255, 255, 0.12)', 
              color: 'rgba(255,255,255,0.7)', 
              padding: '4px 8px', 
              borderRadius: '10px', 
              fontSize: '9.5px', 
              cursor: 'pointer' 
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
