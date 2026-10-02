import React, { useEffect, useState } from 'react';
import { Zap, AlertTriangle, AlertCircle, Scaling, Sparkles, Palette } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../../types';

export interface UpscaleOptions {
  restoreFaces?: boolean;
  restoreColor?: boolean;
  oneXOnly?: boolean;
}

interface SaveUpscaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (overwrite: boolean, options?: UpscaleOptions) => void;
  target?: VideoItem | null;
  onOpenResize?: () => void;
}

export const SaveUpscaleModal: React.FC<SaveUpscaleModalProps> = ({
  isOpen,
  onClose,
  onExecute,
  target,
  onOpenResize
}) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number; size?: string } | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [restoreFaces, setRestoreFaces] = useState(() => {
    const saved = localStorage.getItem('cosmo_upscale_restore_faces');
    return saved !== null ? saved === 'true' : true;
  });
  const [restoreColor, setRestoreColor] = useState(() => {
    const saved = localStorage.getItem('cosmo_upscale_restore_color');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleFaces = () => {
    setRestoreFaces(prev => {
      const next = !prev;
      localStorage.setItem('cosmo_upscale_restore_faces', String(next));
      return next;
    });
  };

  const toggleColor = () => {
    setRestoreColor(prev => {
      const next = !prev;
      localStorage.setItem('cosmo_upscale_restore_color', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !target?.realPath) {
      setDimensions(null);
      return;
    }

    setLoadingMeta(true);
    invoke<{ width: number; height: number; size?: string }>('get_video_metadata', { path: target.realPath })
      .then((meta) => {
        if (meta && meta.width && meta.height) {
          setDimensions({ width: meta.width, height: meta.height, size: meta.size });
        }
      })
      .catch((err) => {
        console.error('Failed to probe media dimensions for upscale warning:', err);
      })
      .finally(() => {
        setLoadingMeta(false);
      });
  }, [isOpen, target?.realPath]);

  const isVideo = target?.realPath?.toLowerCase().match(/\.(mp4|webm|mov|mkv|avi|ts|mpeg|mpg)$/);
  const width = dimensions?.width || 0;
  const height = dimensions?.height || 0;
  const totalPixels = width * height;
  const megapixels = totalPixels > 0 ? (totalPixels / 1_000_000).toFixed(1) : null;
  const outputWidth = width * 4;
  const outputHeight = height * 4;
  const outputMegapixels = Math.round((outputWidth * outputHeight) / 1_000_000);

  // Severe / Fatal condition: Upscale will definitely fail / not work
  // Photos > 4096px in either dimension or > 12 MP (e.g. 6040x9096 is 55 MP)
  // Videos > 1920x1080 (1080p is the hard max for video AI super-resolution)
  const isImageTooLarge = !isVideo && width > 0 && height > 0 && (Math.max(width, height) > 4096 || totalPixels > 12_000_000);
  const isVideoTooLarge = isVideo && width > 0 && height > 0 && (Math.max(width, height) > 1920 || totalPixels > 2_073_600);
  const isTooLarge = isImageTooLarge || isVideoTooLarge;

  const isImageCaution = !isVideo && !isTooLarge && width > 0 && (Math.max(width, height) > 2560 || totalPixels > 6_000_000);

  if (!isOpen) return null;

  return (
    <div
      className="save-upscale-options-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(5, 5, 8, 0.85)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300000,
        userSelect: 'none'
      }}
    >
      <div
        style={{
          background: 'rgba(18, 18, 24, 0.85)',
          border: isTooLarge ? '1px solid rgba(255, 77, 77, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '28px',
          maxWidth: '520px',
          width: '92%',
          boxShadow: isTooLarge 
            ? '0 30px 60px rgba(255,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05)'
            : '0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            display: 'inline-flex', 
            padding: '10px', 
            borderRadius: '50%', 
            background: isTooLarge ? 'rgba(255, 77, 77, 0.12)' : 'rgba(0, 255, 136, 0.1)', 
            color: isTooLarge ? '#ff4d4d' : 'var(--accent)', 
            marginBottom: '10px' 
          }}>
            {isTooLarge ? <AlertTriangle size={24} /> : <Zap size={24} fill="currentColor" />}
          </div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>
            {isTooLarge ? 'FILE TOO LARGE FOR UPSCALE' : 'AI UPSCALE OPTIONS'}
          </h2>
          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#888' }}>
            {target?.title ? (
              <span style={{ color: '#bbb' }}>{target.title}</span>
            ) : (
              'Select how you want to save your upscaled high-fidelity image.'
            )}
          </p>

          {/* Current dimensions & file size badge */}
          {width > 0 && height > 0 && (
            <div style={{ marginTop: '8px', display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '6px 14px', borderRadius: '20px', fontSize: '11px', color: '#aaa', border: '1px solid rgba(255,255,255,0.08)' }}>
              {dimensions?.size && (
                <span>Disk Size: <strong style={{ color: '#fff' }}>{dimensions.size}</strong></span>
              )}
              {dimensions?.size && <span style={{ opacity: 0.3 }}>|</span>}
              <span>Resolution: <strong style={{ color: isTooLarge ? '#ff4d4d' : '#fff' }}>{width.toLocaleString()} × {height.toLocaleString()}</strong> ({megapixels} Megapixels)</span>
            </div>
          )}
        </div>

        {/* AUTOMATIC SEVERE WARNING: FILE IS TOO LARGE */}
        {isTooLarge && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.12), rgba(255, 149, 0, 0.12))',
            border: '1px solid rgba(255, 59, 48, 0.4)',
            borderRadius: '14px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 8px 24px rgba(255, 59, 48, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} color="#ff4d4d" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#ff4d4d', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                Resolution Too High For AI Upscale
              </span>
            </div>

            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', lineHeight: '1.45' }}>
              Although this file is only <strong>{dimensions?.size || '1.3 MB'}</strong> on disk (due to JPEG compression), its physical resolution is <strong>{width.toLocaleString()} × {height.toLocaleString()} ({megapixels} Megapixels)</strong>.
            </div>

            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', lineHeight: '1.45' }}>
              A 4× AI upscale would multiply the pixels to an astronomical <strong>{outputWidth.toLocaleString()} × {outputHeight.toLocaleString()} ({outputMegapixels} Million Pixels)</strong>. Processing that in uncompressed memory requires over <strong>4.5 GB of continuous GPU RAM</strong>, causing the neural network to run out of memory and fail.
            </div>

            <div style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.7)',
              background: 'rgba(0,0,0,0.3)',
              padding: '8px 10px',
              borderRadius: '8px',
              lineHeight: '1.4'
            }}>
              💡 <strong>Megapixels (MP) vs Megabytes (MB):</strong> MP measures the image's pixel dimensions, not its storage size on disk. Please scale this file down below {isVideo ? '1080p (1920×1080)' : '4K (3840×2160)'} using the Resize tool before running AI super-resolution.
            </div>

            {onOpenResize && (
              <button
                onClick={onOpenResize}
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.2), rgba(0, 150, 255, 0.2))',
                  border: '1px solid rgba(0, 255, 136, 0.5)',
                  color: 'var(--accent, #00ff88)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                  marginTop: '4px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.3), rgba(0, 150, 255, 0.3))'}
                onMouseOut={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.2), rgba(0, 150, 255, 0.2))'}
              >
                <Scaling size={15} />
                Open Resize Tool Instead
              </button>
            )}
          </div>
        )}

        {/* MODERATE CAUTION WARNING */}
        {isImageCaution && (
          <div style={{
            background: 'rgba(255, 170, 0, 0.08)',
            border: '1px solid rgba(255, 170, 0, 0.25)',
            borderRadius: '12px',
            padding: '10px 14px',
            fontSize: '11.5px',
            color: 'rgba(255,255,255,0.85)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={15} color="#ffaa00" style={{ flexShrink: 0 }} />
            <span>
              <strong>High Resolution:</strong> This image ({width} × {height}) will produce a {outputWidth} × {outputHeight} output. Upscaling may take several minutes on GPU.
            </span>
          </div>
        )}

        {/* ENHANCEMENT MODULES CARD (Always visible & configurable) */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>
            Enhancement Modules
          </div>

          {/* Face Restoration Toggle */}
          <div 
            onClick={toggleFaces}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '6px 4px',
              borderRadius: '8px',
              transition: 'background 0.15s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: restoreFaces ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                color: restoreFaces ? 'var(--accent, #00ff88)' : '#666',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}>
                <Sparkles size={16} />
              </div>
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: restoreFaces ? '#fff' : '#888' }}>
                  Face Detail Restoration
                </div>
                <div style={{ fontSize: '10.5px', color: '#666' }}>
                  Reconstructs eyes, facial features & skin naturally
                </div>
              </div>
            </div>
            {/* Toggle Switch */}
            <div style={{
              width: '42px',
              height: '22px',
              borderRadius: '11px',
              background: restoreFaces ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.15)',
              position: 'relative',
              transition: 'background 0.2s'
            }}>
              <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#000',
                position: 'absolute',
                top: '2px',
                left: restoreFaces ? '22px' : '2px',
                transition: 'left 0.2s'
              }} />
            </div>
          </div>

          {/* Color & Vibrance Restoration Toggle */}
          <div 
            onClick={toggleColor}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '6px 4px',
              borderRadius: '8px',
              transition: 'background 0.15s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: restoreColor ? 'rgba(0, 200, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                color: restoreColor ? '#00c8ff' : '#666',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}>
                <Palette size={16} />
              </div>
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: restoreColor ? '#fff' : '#888' }}>
                  Color & Vibrance Restoration
                </div>
                <div style={{ fontSize: '10.5px', color: '#666' }}>
                  De-fades washed out photos & balances tones
                </div>
              </div>
            </div>
            {/* Toggle Switch */}
            <div style={{
              width: '42px',
              height: '22px',
              borderRadius: '11px',
              background: restoreColor ? '#00c8ff' : 'rgba(255, 255, 255, 0.15)',
              position: 'relative',
              transition: 'background 0.2s'
            }}>
              <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#000',
                position: 'absolute',
                top: '2px',
                left: restoreColor ? '22px' : '2px',
                transition: 'left 0.2s'
              }} />
            </div>
          </div>
        </div>

        {/* 1X COLOR & FACE RESTORATION FOR OVERSIZED FILES */}
        {isTooLarge && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(0, 200, 255, 0.08), rgba(0, 255, 136, 0.08))',
            border: '1px solid rgba(0, 200, 255, 0.3)',
            borderRadius: '14px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#00c8ff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Palette size={15} />
              <span>Restore Colors & Faces at 1× Size (No 4× Scaling)</span>
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.4' }}>
              4× super-resolution is blocked to avoid GPU memory overflow, but you can safely apply <strong>Color Restoration</strong> and <strong>Face Enhancement</strong> at this photo's original {width} × {height} resolution.
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
              <button
                onClick={() => onExecute(false, { restoreFaces, restoreColor, oneXOnly: true })}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, rgba(0, 200, 255, 0.25), rgba(0, 255, 136, 0.25))',
                  border: '1px solid rgba(0, 200, 255, 0.5)',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 200, 255, 0.35), rgba(0, 255, 136, 0.35))'}
                onMouseOut={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 200, 255, 0.25), rgba(0, 255, 136, 0.25))'}
              >
                ✨ Restore (Save As New)
              </button>
              <button
                onClick={() => onExecute(true, { restoreFaces, restoreColor, oneXOnly: true })}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
              >
                💾 Overwrite (1×)
              </button>
            </div>
          </div>
        )}

        {/* STANDARD 4X UPSCALE BUTTONS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Choice 1: Save as Separate File */}
          <button
            disabled={isTooLarge}
            onClick={() => !isTooLarge && onExecute(false, { restoreFaces, restoreColor, oneXOnly: false })}
            style={{
              background: isTooLarge ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '14px 16px',
              textAlign: 'left',
              cursor: isTooLarge ? 'not-allowed' : 'pointer',
              opacity: isTooLarge ? 0.35 : 1,
              filter: isTooLarge ? 'grayscale(0.8)' : 'none',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
            onMouseOver={e => {
              if (isTooLarge) return;
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.15)';
            }}
            onMouseOut={e => {
              if (isTooLarge) return;
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.08)';
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: isTooLarge ? '#888' : '#fff' }}>
              4× AI Upscale (Save As Separate File) {isTooLarge && '— Blocked (Too Large)'}
            </span>
            <span style={{ fontSize: '11px', color: '#888' }}>Multiplies resolution 4× with UltraSharp super-resolution + active modules.</span>
          </button>

          {/* Choice 2: Overwrite Original */}
          <button
            disabled={isTooLarge}
            onClick={() => !isTooLarge && onExecute(true, { restoreFaces, restoreColor, oneXOnly: false })}
            style={{
              background: isTooLarge ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '14px 16px',
              textAlign: 'left',
              cursor: isTooLarge ? 'not-allowed' : 'pointer',
              opacity: isTooLarge ? 0.35 : 1,
              filter: isTooLarge ? 'grayscale(0.8)' : 'none',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
            onMouseOver={e => {
              if (isTooLarge) return;
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.15)';
            }}
            onMouseOut={e => {
              if (isTooLarge) return;
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.08)';
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: isTooLarge ? '#888' : '#fff' }}>
              4× AI Upscale (Overwrite Original) {isTooLarge && '— Blocked (Too Large)'}
            </span>
            <span style={{ fontSize: '11px', color: '#888' }}>Replaces the original file physically with 4× resolution. Auto-bypasses caching.</span>
          </button>
        </div>

        {/* Hardware Recommendation Note (when not oversized) */}
        {!isTooLarge && (
          <div style={{
            background: 'rgba(0, 255, 136, 0.04)',
            border: '1px solid rgba(0, 255, 136, 0.12)',
            borderRadius: '12px',
            padding: '12px',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.7)',
            lineHeight: '1.4',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}>
            <Zap size={14} color="var(--accent)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <span>
              <strong>Hardware Recommendation:</strong> AI super-resolution utilizes hardware acceleration on <strong>NVIDIA graphics cards</strong> (via CUDA) or <strong>AMD graphics cards</strong> (via DirectML) for maximum performance. A high-fidelity bilateral CPU filter fallback is used automatically if compatible graphics hardware is not detected.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              padding: '8px 16px',
              transition: 'color 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.color = '#fff'}
            onMouseOut={e => e.currentTarget.style.color = '#888'}
          >
            {isTooLarge ? 'CLOSE' : 'CANCEL'}
          </button>
        </div>
      </div>
    </div>
  );
};
