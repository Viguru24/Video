import React, { useState, useEffect } from 'react';
import { Minimize2, X, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../../types';

interface ResizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: VideoItem | null;
  onSuccess: (newPath: string, overwrite: boolean) => void;
  addLog: (msg: string) => void;
}

const DEFAULT_SIZES = [
  { label: 'Full HD (16:9)', w: 1920, h: 1080 },
  { label: 'HD Ready (16:9)', w: 1280, h: 720 },
  { label: 'Square (1:1)', w: 1080, h: 1080 },
  { label: 'Standard (4:3)', w: 800, h: 600 },
  { label: 'Compact (4:3)', w: 640, h: 480 },
];

export const ResizeModal: React.FC<ResizeModalProps> = ({
  isOpen,
  onClose,
  target,
  onSuccess,
  addLog,
}) => {
  const [width, setWidth] = useState<string>('1920');
  const [height, setHeight] = useState<string>('1080');
  const [lockAspect, setLockAspect] = useState(true);
  const [originalRatio, setOriginalRatio] = useState<number>(16 / 9);
  const [loadingDimensions, setLoadingDimensions] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isProcessing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isProcessing]);

  // Fetch original dimensions to establish aspect ratio when modal opens
  useEffect(() => {
    if (!isOpen || !target || !target.realPath) return;

    setLoadingDimensions(true);
    invoke<{ width: number; height: number }>('get_video_metadata', { path: target.realPath })
      .then((meta) => {
        if (meta && meta.width && meta.height) {
          setWidth(meta.width.toString());
          setHeight(meta.height.toString());
          setOriginalRatio(meta.width / meta.height);
        }
      })
      .catch((err) => {
        console.error('Failed to get media dimensions for resize:', err);
      })
      .finally(() => {
        setLoadingDimensions(false);
      });
  }, [isOpen, target]);

  if (!isOpen || !target) return null;

  const handleWidthChange = (val: string) => {
    setWidth(val);
    const num = parseInt(val);
    if (!isNaN(num) && num > 0 && lockAspect) {
      setHeight(Math.round(num / originalRatio).toString());
    }
  };

  const handleHeightChange = (val: string) => {
    setHeight(val);
    const num = parseInt(val);
    if (!isNaN(num) && num > 0 && lockAspect) {
      setWidth(Math.round(num * originalRatio).toString());
    }
  };

  const selectPreset = (w: number, h: number) => {
    setWidth(w.toString());
    setHeight(h.toString());
    if (lockAspect) {
      setOriginalRatio(w / h);
    }
  };

  const executeResize = async (overwrite: boolean) => {
    const wNum = parseInt(width);
    const hNum = parseInt(height);

    if (isNaN(wNum) || wNum <= 0 || isNaN(hNum) || hNum <= 0) {
      alert('Please enter valid width and height values.');
      return;
    }

    setIsProcessing(true);
    try {
      addLog(`Starting custom resize: ${target.title} to ${wNum}x${hNum}`);
      const newPath = await invoke<string>('resize_image_on_disk', {
        path: target.realPath,
        width: wNum,
        height: hNum,
        overwrite,
      });

      addLog(`SUCCESS: Resized ${target.title} saved to: ${newPath}`);
      onSuccess(newPath, overwrite);
      onClose();
    } catch (err: any) {
      console.error(err);
      addLog(`ERROR: Resize failed - ${err}`);
      alert(`Resize failed: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="save-upscale-options-overlay"
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
        userSelect: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(18, 18, 24, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '24px 30px',
          maxWidth: '520px',
          width: '90%',
          boxShadow: '0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'inline-flex', padding: '8px', borderRadius: '50%', background: 'rgba(0, 255, 136, 0.1)', color: 'var(--accent)' }}>
              <Minimize2 size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>
                RESCALE / RESIZE MEDIA
              </h2>
              <span style={{ fontSize: '9px', opacity: 0.5, fontWeight: 800, color: '#fff' }}>ADJUST IMAGE RESOLUTION</span>
            </div>
          </div>
          {!isProcessing && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          )}
        </div>

        {/* Preset Sizes */}
        <div>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 900, display: 'block', marginBottom: '8px' }}>
            SELECT PRESETS
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {DEFAULT_SIZES.map((preset) => (
              <button
                key={preset.label}
                onClick={() => selectPreset(preset.w, preset.h)}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                }}
              >
                {preset.w} x {preset.h} <span style={{ opacity: 0.5, fontSize: '9px', fontWeight: 'normal' }}>({preset.label.split(' ')[0]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Dimensions */}
        <div>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 900, display: 'block', marginBottom: '8px' }}>
            CUSTOM SIZE (PIXELS)
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', color: '#888' }}>Width</label>
              <input
                type="number"
                value={width}
                onChange={(e) => handleWidthChange(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
            </div>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '16px', marginTop: '16px' }}>×</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', color: '#888' }}>Height</label>
              <input
                type="number"
                value={height}
                onChange={(e) => handleHeightChange(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
            </div>
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '12px', cursor: 'pointer', fontSize: '12px', color: '#aaa' }}>
            <input
              type="checkbox"
              checked={lockAspect}
              onChange={(e) => {
                setLockAspect(e.target.checked);
                const w = parseInt(width);
                const h = parseInt(height);
                if (e.target.checked && !isNaN(w) && !isNaN(h) && h > 0) {
                  setOriginalRatio(w / h);
                }
              }}
              style={{ accentColor: 'var(--accent, #00ff88)' }}
            />
            Lock aspect ratio
          </label>
        </div>

        {/* Output Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
          <button
            onClick={() => executeResize(false)}
            disabled={isProcessing}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '12px 16px',
              textAlign: 'left',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              opacity: isProcessing ? 0.5 : 1,
            }}
            onMouseOver={(e) => {
              if (isProcessing) return;
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
            onMouseOut={(e) => {
              if (isProcessing) return;
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>Save as Separate File (Save As Copy)</span>
            <span style={{ fontSize: '10px', color: '#aaa' }}>Creates a new file with serial increments (e.g. filename_resize.001.png).</span>
          </button>

          <button
            onClick={() => executeResize(true)}
            disabled={isProcessing}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '12px 16px',
              textAlign: 'left',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              opacity: isProcessing ? 0.5 : 1,
            }}
            onMouseOver={(e) => {
              if (isProcessing) return;
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
            onMouseOut={(e) => {
              if (isProcessing) return;
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>Overwrite Original File</span>
            <span style={{ fontSize: '10px', color: '#aaa' }}>Replaces the original file physically with custom dimensions.</span>
          </button>
        </div>

        {isProcessing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontSize: '11px', fontWeight: '700' }}>
            <RefreshCw size={14} className="spin-animation" style={{ animation: 'spin 1.5s linear infinite' }} />
            <span>Processing scale operation...</span>
          </div>
        )}
      </div>
    </div>
  );
};
