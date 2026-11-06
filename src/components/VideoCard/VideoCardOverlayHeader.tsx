import React from 'react';
import { GripVertical, RefreshCw, ExternalLink, Minimize2 } from 'lucide-react';
import { triggerPopOut, isTauri } from '../../utils/videoUtils';
import type { VideoCardProps } from './types';

export interface VideoCardOverlayHeaderProps {
  props: VideoCardProps;
  state: any;
  immersive: boolean;
}

const COLOR_TAG_MAP: Record<string, string> = {
  red: '#f87171',
  green: '#4ade80',
  blue: '#60a5fa',
  yellow: '#facc15',
  purple: '#c084fc',
};

export function VideoCardOverlayHeader({ props, state, immersive }: VideoCardOverlayHeaderProps) {
  if (props.isFocused) {
    if (immersive) return null;
    return (
      <div className="focused-exit-overlay" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        {props.onUpscale && (
          <button
            className="exit-focus-btn"
            onClick={(e) => {
              e.stopPropagation();
              props.onUpscale?.(props.video);
            }}
            style={{
              background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))',
              border: '1px solid rgba(0, 255, 136, 0.35)',
              boxShadow: '0 0 15px rgba(0, 255, 136, 0.15)',
              color: 'var(--accent)',
              fontWeight: 'bold',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '12px',
              padding: '8px 16px',
              height: '36px',
              cursor: 'pointer',
              width: 'auto',
              pointerEvents: 'auto'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.7)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
            }}
            data-tooltip="Upscale using RTX GPU"
          >
            <span>✨ AI UPSCALE</span>
          </button>
        )}
        <button 
          className="exit-focus-btn" 
          onClick={() => props.onDeepFocus(state.videoRef.current ? state.videoRef.current.currentTime : undefined)} 
          data-tooltip="Exit Enlarge Mode"
          style={{ height: '36px', width: '36px', pointerEvents: 'auto' }}
        >
          <Minimize2 size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="overlay-header" style={{ 
      background: 'transparent', 
      backdropFilter: 'none', 
      borderBottom: 'none', 
      padding: '8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div 
          className="drag-handle-mini" 
          {...props.dragListeners} 
          {...props.dragAttributes} 
          style={{ 
            pointerEvents: 'auto',
            marginLeft: (props.selectionMode || state.showControls || props.isSelected) ? '32px' : '0px',
            transition: 'margin-left 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            touchAction: 'none'
          }}
        >
          <GripVertical size={16} />
        </div>

        {props.video.colorTag && (
          <div
            className="card-color-tag-dot"
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              backgroundColor: COLOR_TAG_MAP[props.video.colorTag] || '#aaa',
              boxShadow: `0 0 8px ${COLOR_TAG_MAP[props.video.colorTag] || '#aaa'}`,
              pointerEvents: 'none',
              flexShrink: 0,
            }}
            title={`Tag: ${props.video.colorTag}`}
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {/* Refresh Tile Button */}
        <button
          className="mini-btn refresh-btn"
          onClick={(e) => {
            e.stopPropagation();
            const cacheBuster = `t=${Date.now()}`;
            const cleanUrl = props.video.url.split('?')[0];
            props.onUpdateVideo(props.video.id, { url: `${cleanUrl}?${cacheBuster}` });
            if (props.onLog) {
              props.onLog(`SYSTEM: Refreshed tile "${props.video.title}"`);
            }
          }}
          data-tooltip="Refresh Tile"
          style={{
            pointerEvents: 'auto',
            background: 'rgba(10, 10, 12, 0.45)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '6px',
            width: '26px',
            height: '26px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            opacity: state.showControls ? 1 : 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.background = 'rgba(10, 10, 12, 0.8)';
            e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            e.currentTarget.style.background = 'rgba(10, 10, 12, 0.45)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          }}
        >
          <RefreshCw size={12} />
        </button>

        {/* Pop Out Window Button */}
        <button
          className="mini-btn popout-btn"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              const effectivePath = (props.video.folderFiles && props.video.currentIdx !== undefined)
                ? (props.video.folderFiles[props.video.currentIdx]?.path || props.video.folderFiles[props.video.currentIdx]?.url)
                : props.video.realPath || props.video.url;
              await triggerPopOut(effectivePath, props.video.title);
              if (props.onLog) {
                props.onLog(`SYSTEM: Popped out asset "${props.video.title}"`);
              }
            } catch (err) {
              console.error("Popout failed:", err);
            }
          }}
          data-tooltip="Pop Out Player"
          style={{
            pointerEvents: 'auto',
            background: 'rgba(10, 10, 12, 0.45)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '6px',
            width: '26px',
            height: '26px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            opacity: (state.showControls || !isTauri() || (typeof window !== 'undefined' && 'ontouchstart' in window)) ? 1 : 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.background = 'rgba(10, 10, 12, 0.8)';
            e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            e.currentTarget.style.background = 'rgba(10, 10, 12, 0.45)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          }}
        >
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  );
}
