import React from 'react';
import { Sparkles, Cpu, Pause, Play, RefreshCw, Maximize } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface SystemBadgesProps {
  onForceSetup?: () => void;
  aiHardwareStatus: string;
  slideshowInterval: number;
  storeSlideshowInterval?: number;
  setSlideshowInterval: React.Dispatch<React.SetStateAction<number>>;
  setStoreSlideshowInterval?: (val: number | ((prev: number) => number)) => void;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (val: boolean) => void;
  setShowSettings: (val: boolean) => void;
  enableSlideshowPanZoom: boolean;
  setEnableSlideshowPanZoom: (val: boolean) => void;
}

export const SystemBadges: React.FC<SystemBadgesProps> = ({
  onForceSetup,
  aiHardwareStatus,
  slideshowInterval,
  storeSlideshowInterval,
  setSlideshowInterval,
  setStoreSlideshowInterval,
  isSlideshowActive,
  setIsSlideshowActive,
  setShowSettings,
  enableSlideshowPanZoom,
  setEnableSlideshowPanZoom,
}) => {
  const currentInterval = (typeof slideshowInterval === 'number' && !isNaN(slideshowInterval))
    ? slideshowInterval
    : (typeof storeSlideshowInterval === 'number' && !isNaN(storeSlideshowInterval))
      ? storeSlideshowInterval
      : 5;

  const updateInterval = (updater: number | ((prev: number) => number)) => {
    if (typeof setSlideshowInterval === 'function') {
      setSlideshowInterval(updater as any);
    }
    if (typeof setStoreSlideshowInterval === 'function') {
      setStoreSlideshowInterval(updater);
    }
  };

  return (
    <>
      <div 
        onClick={onForceSetup}
        className={`ai-status-badge ${
          aiHardwareStatus.includes('GPU') 
            ? 'status-gpu' 
            : aiHardwareStatus === 'Detecting...' 
            ? 'status-detecting' 
            : 'status-cpu'
        }`}
        style={{ cursor: 'pointer' }}
        data-tooltip={
          aiHardwareStatus.includes('GPU')
            ? "Nvidia RTX CUDA GPU Upscaler and GFPGAN Face Restore are active & ready. Click to re-run setup."
            : aiHardwareStatus === 'Detecting...'
            ? "Detecting AI processing hardware status..."
            : "Running with Bilateral Filter CPU fallback. Click here to download GPU Acceleration Pack."
        }
      >
        {aiHardwareStatus.includes('GPU') ? (
          <Sparkles size={11} className="ai-status-icon pulse-gold" />
        ) : (
          <Cpu size={11} className={`ai-status-icon ${aiHardwareStatus === 'Detecting...' ? 'spin-slow' : ''}`} />
        )}
        <span className="ai-status-lbl">
          {aiHardwareStatus.includes('GPU') 
            ? 'AI: GPU' 
            : aiHardwareStatus === 'Detecting...' 
            ? 'AI: Checking...' 
            : 'AI: CPU'}
        </span>
      </div>

      {/* VERSION & DEV BADGES */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', pointerEvents: 'auto' }}>
        <a
          href="https://cosmowhisper.com"
          data-no-drag
          onClick={async (e) => {
            e.preventDefault();
            try {
              await invoke('open_external_url', { url: 'https://cosmowhisper.com' });
            } catch (err) {
              try {
                window.open('https://cosmowhisper.com', '_blank', 'noopener,noreferrer');
              } catch (e2) {}
            }
          }}
          style={{
            color: 'var(--accent, #00ff88)',
            fontSize: '10px',
            textDecoration: 'underline',
            marginRight: '8px',
            fontWeight: 600,
            letterSpacing: '0.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Discover Cosmo Whisper"
        >
          🚀 Cosmo Whisper
        </a>
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          height: '28px',
          padding: '0 8px',
          color: 'rgba(255, 255, 255, 0.6)',
          fontSize: '10px',
          fontFamily: 'monospace',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          letterSpacing: '0.5px',
          userSelect: 'none',
          marginLeft: '4px'
        }}>
          v1.4.8
        </div>
        <div style={{
          height: '18px',
          padding: '0 6px',
          background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
          boxShadow: '0 0 8px rgba(168, 85, 247, 0.4)',
          borderRadius: '4px',
          color: '#fff',
          fontSize: '8px',
          fontWeight: 900,
          letterSpacing: '1px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          textTransform: 'uppercase'
        }} title="Cosmo Symphony Developer Build">
          DEV
        </div>
      </div>

      {/* SLIDESHOW TIMER WIDGET */}
      <div 
        className="slideshow-interval-badge"
        data-tooltip={`${isSlideshowActive ? "Pause Slideshow" : "Play All Fullscreen (Slideshow)"} - Interval: ${currentInterval}s (Scroll wheel up/down to adjust)`}
        onClick={() => setIsSlideshowActive && setIsSlideshowActive(!isSlideshowActive)}
        onWheel={(e) => {
          e.stopPropagation();
          const direction = e.deltaY < 0 ? 1 : -1;
          updateInterval((prev) => {
            const current = typeof prev === 'number' && !isNaN(prev) ? prev : currentInterval;
            return Math.max(1, Math.min(120, current + direction));
          });
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: isSlideshowActive ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))' : 'rgba(255, 255, 255, 0.05)',
          border: isSlideshowActive ? '1px solid rgba(0, 255, 136, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          height: '28px',
          padding: '0 8px',
          color: isSlideshowActive ? 'var(--accent, #00ff88)' : 'var(--text, #fff)',
          fontSize: '11px',
          fontFamily: 'monospace',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 0.2s',
          marginLeft: '4px',
          marginRight: '4px',
          pointerEvents: 'auto',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isSlideshowActive 
            ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))'
            : 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
          e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 136, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isSlideshowActive
            ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))'
            : 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = isSlideshowActive ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {isSlideshowActive ? <Pause size={11} /> : <Play size={11} />}
        <RefreshCw size={11} className={isSlideshowActive ? "spin-slow" : ""} style={{ color: isSlideshowActive ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.7)' }} />
        <span>{currentInterval}s</span>
      </div>

      {/* SLIDESHOW PAN & ZOOM TOGGLE */}
      <div
        className="slideshow-panzoom-badge"
        data-tooltip={enableSlideshowPanZoom ? "Slideshow Pan & Zoom: ON" : "Slideshow Pan & Zoom: OFF"}
        onClick={() => setEnableSlideshowPanZoom(!enableSlideshowPanZoom)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: enableSlideshowPanZoom ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))' : 'rgba(255, 255, 255, 0.05)',
          border: enableSlideshowPanZoom ? '1px solid rgba(0, 255, 136, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          height: '28px',
          padding: '0 8px',
          color: enableSlideshowPanZoom ? 'var(--accent, #00ff88)' : 'var(--text, #fff)',
          fontSize: '11px',
          fontFamily: 'monospace',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 0.2s',
          marginRight: '4px',
          pointerEvents: 'auto',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = enableSlideshowPanZoom 
            ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))'
            : 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
          e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 136, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = enableSlideshowPanZoom
            ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))'
            : 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = enableSlideshowPanZoom ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <Maximize size={11} />
        <span>Zoom</span>
      </div>
    </>
  );
};
