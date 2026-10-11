import React from 'react';
import { 
  Volume2, VolumeX, RotateCcw, ChevronLeft, ChevronRight,
  Rewind, FastForward, Play, Pause, RefreshCw, ZoomIn, Compass, Crop
} from 'lucide-react';

export type AspectRatio = 'free' | '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '21:9';

export const ASPECT_RATIOS: { id: AspectRatio; label: string; ratio: number | null; desc: string }[] = [
  { id: 'free', label: 'Free', ratio: null, desc: 'Custom unconstrained' },
  { id: '16:9', label: '16:9', ratio: 16 / 9, desc: 'YouTube / Widescreen' },
  { id: '9:16', label: '9:16', ratio: 9 / 16, desc: 'TikTok / Reels / Shorts' },
  { id: '1:1', label: '1:1', ratio: 1, desc: 'Square / Feed' },
  { id: '4:5', label: '4:5', ratio: 4 / 5, desc: 'Instagram Portrait' },
  { id: '4:3', label: '4:3', ratio: 4 / 3, desc: 'Standard Video' },
  { id: '21:9', label: '21:9', ratio: 21 / 9, desc: 'Cinematic Ultrawide' },
];

export function formatTime(sec: number): string {
  if (isNaN(sec) || sec < 0) sec = 0;
  const mins = Math.floor(sec / 60);
  const remainingSecs = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

interface TrimCropToolbarProps {
  enableCrop: boolean;
  setEnableCrop: React.Dispatch<React.SetStateAction<boolean>>;
  aspectRatio: AspectRatio;
  applyAspectRatio: (r: AspectRatio) => void;
  centerCropBox: () => void;
  resetCrop: () => void;
  zoomScale: number;
  setZoomScale: (val: number) => void;
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  playbackRate: number;
  cyclePlaybackRate: () => void;
  isMuted: boolean;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
}

export const TrimCropToolbar: React.FC<TrimCropToolbarProps> = ({
  enableCrop,
  setEnableCrop,
  aspectRatio,
  applyAspectRatio,
  centerCropBox,
  resetCrop,
  zoomScale,
  setZoomScale,
  setPanOffset,
  playbackRate,
  cyclePlaybackRate,
  isMuted,
  setIsMuted,
}) => {
  return (
    <div style={{
      padding: '8px 20px',
      background: 'rgba(255, 255, 255, 0.025)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '10px',
      flexShrink: 0
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
  );
};
