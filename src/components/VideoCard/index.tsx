import React from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RefreshCw, Camera, Volume2, VolumeX, GripVertical, Minimize2, FolderOpen, X, AlertCircle, ChevronLeft, ChevronRight, Maximize, CheckCircle2, Trash2, Sliders, Crop, Sparkles, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../../store/useStore';
import { triggerPopOut, isTauri } from '../../utils/videoUtils';
import { useVideoCard } from './useVideoCard';
import type { UseVideoCardProps } from './useVideoCard';
import { AudioCard } from './AudioCard';
import { CardActionMenu } from './CardActionMenu';
import { ColorFilterDefs } from '../ColorFilterDefs';
import { VideoCardOverlay } from './VideoCardOverlay';

export interface VideoCardProps extends Omit<UseVideoCardProps, 'quality'> {
  quality?: 'low' | 'high';
  fitMode?: 'cover' | 'contain';
}

function VideoCardInternal(props: VideoCardProps) {
  const { fitMode = 'contain' } = props;
  const state = useVideoCard(props);

  const setGlobalVolume = useStore((state) => state.setGlobalVolume);
  const immersive = useStore((state) => state.immersive);
  const enableSlideshowPanZoom = useStore((state) => state.enableSlideshowPanZoom);

  const isSingleVideo = !props.video.folderFiles || props.video.folderFiles.length === 0;
  const currentMode = (() => {
    // Unit loop settings explicitly override the global settings
    if (props.video.repeatMode && props.video.repeatMode !== 'none') {
      let m = props.video.repeatMode;
      if (m as any === 'all') m = 'folder';
      return m;
    }
    // Otherwise fallback to global
    const baseMode = props.globalRepeat;
    if (baseMode === 'none') return 'none';
    let normMode = baseMode;
    if (normMode as any === 'all') normMode = 'folder';
    
    // In solo/focused mode, 'folder' repeat mode should play sequentially across workspace siblings
    if (props.isFocused && normMode === 'folder') {
      return 'folder';
    }
    
    return isSingleVideo ? 'always' : 'folder';
  })();

  return (
    <motion.div
      ref={state.cardRef}
      layoutId={`video-card-${props.video.id}`}
      className={`video-card ${state.recovering ? 'recovering' : ''} ${props.isFocused ? 'focused' : ''} ${props.isSelected ? 'selected-card' : ''} ${state.showControls ? 'ui-visible' : 'ui-hidden'}`}
      {...state.dragProps}
      onMouseEnter={() => state.setIsHovered(true)}
      onMouseLeave={() => { 
        state.setIsHovered(false); 
        state.handleMouseUp(); 
      }}
      onMouseDown={state.handleMouseDown}
      onMouseMove={state.handleMouseMove}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input')) return;
        if (props.isFocused && state.zoomScale > 1) {
          e.preventDefault();
          e.stopPropagation();
          state.resetZoom();
          return;
        }
        props.onDeepFocus(state.videoRef.current ? state.videoRef.current.currentTime : undefined);
      }}
      onTouchStart={state.handleTouchStart}
      onTouchEnd={state.handleTouchEnd}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); props.onContextMenu(e.clientX, e.clientY); }}
      data-id={props.video.id}
      style={{
        border: props.isSelected ? '2px solid var(--accent)' : undefined,
        boxShadow: props.isSelected ? '0 0 25px rgba(var(--accent-rgb), 0.65), inset 0 0 15px rgba(var(--accent-rgb), 0.3)' : undefined,
        cursor: props.isFocused && state.zoomScale > 1 ? (state.isPanning ? 'grabbing' : 'grab') : undefined
      }}
    >
      {props.isVisible && !props.isAiEnhancing && (
        <ColorFilterDefs
          videoId={state.filterId}
          finalR={state.finalR}
          finalG={state.finalG}
          finalB={state.finalB}
          alpha={state.filters.alpha.toString()}
          gamma={state.filters.gamma}
          negative={state.filters.negative}
        />
      )}
      
      {props.isVisible && !props.isAiEnhancing ? (
        state.isImage ? (
            <div
              className="media-wrapper"
              data-zoom={state.zoomScale}
              data-pan-x={state.panOffset.x}
              data-pan-y={state.panOffset.y}
              data-rotation={props.video.rotation || 0}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                backgroundColor: '#000',
                transform: `translate(${state.panOffset.x}px, ${state.panOffset.y}px) scale(${state.zoomScale}) ${props.video.flipped ? 'scaleX(-1) ' : ''}rotate(${props.video.rotation || 0}deg)`,
                transition: state.isPanning ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              <img
                key={state.effectiveImgSrc}
                src={state.effectiveImgSrc}
                alt={props.video.title}
                draggable="false"
                decoding="async"
                loading="lazy"
                fetchPriority={props.isVisible ? "high" : "low"}
                onLoad={state.handleMediaSuccess}
                onError={() => state.handleMediaError('image')}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: props.isCropping ? 'contain' : fitMode, 
                  filter: props.video.colorFilters ? `url(#filter-${state.filterId}) brightness(${state.filters.brightness}) contrast(${state.filters.contrast}) saturate(${state.filters.saturation}) hue-rotate(${state.filters.hue}deg)` : undefined
                }}
                className={props.isSlideshowActive && props.isFocused && enableSlideshowPanZoom ? state.animationClass : ''}
              />
            </div>
        ) : state.isAudio ? (
          <AudioCard
            video={props.video}
            displayUrl={state.displayUrl}
            effectiveMuted={state.effectiveMuted}
            globalRepeat={props.globalRepeat || 'folder'}
            songInfo={state.songInfo}
            videoRef={state.videoRef}
            lastTime={state.lastTime}
            onEnded={props.onEnded}
            handleTimeUpdate={state.handleTimeUpdate}
            setDuration={state.setDuration}
            setError={state.setError}
            zoomScale={state.zoomScale}
            panOffset={state.panOffset}
            onUpdateVideo={props.onUpdateVideo}
            onLog={props.onLog}
            onMediaError={state.handleMediaError}
            onMediaSuccess={state.handleMediaSuccess}
          />
        ) : (
          <video
            key={state.displayUrl}
            ref={state.videoRef}
            src={state.displayUrl}
            preload="metadata"
            draggable="false"
            playsInline
            loop={currentMode === 'always'}
            onEnded={(e) => {
              if (props.onLog) {
                props.onLog(`SYSTEM: Video [${props.video.title}] ended. Mode: ${currentMode}`);
              }
              if (currentMode === 'always') {
                const vid = e.currentTarget;
                vid.currentTime = 0;
                vid.play().catch((err) => {
                  if (props.onLog) props.onLog(`SYSTEM: Local loop play failed: ${err}. Retrying in 50ms...`);
                  setTimeout(() => {
                    vid.play().catch((err2) => {
                      if (props.onLog) props.onLog(`SYSTEM: Local loop play retry failed: ${err2}`);
                    });
                  }, 50);
                });
              } else if (currentMode === 'once') {
                const vid = e.currentTarget;
                const count = props.video.repeatCount || 0;
                if (count < 1) {
                  vid.currentTime = 0;
                  vid.play().catch((err) => {
                    if (props.onLog) props.onLog(`SYSTEM: Local loop play failed: ${err}. Retrying in 50ms...`);
                    setTimeout(() => {
                      vid.play().catch((err2) => {
                        if (props.onLog) props.onLog(`SYSTEM: Local loop play retry failed: ${err2}`);
                      });
                    }, 50);
                  });
                  if (props.onUpdateVideo) {
                    props.onUpdateVideo(props.video.id, { repeatCount: count + 1 });
                  }
                } else {
                  props.onEnded();
                }
              } else {
                props.onEnded();
              }
            }}
            muted={state.effectiveMuted}
            onTimeUpdate={state.handleTimeUpdate}
            data-zoom={state.zoomScale}
            data-pan-x={state.panOffset.x}
            data-pan-y={state.panOffset.y}
            data-rotation={props.video.rotation || 0}
            onLoadedMetadata={() => {
              state.handleMediaSuccess();
              const dur = state.videoRef.current?.duration || 0;
              state.setDuration(dur);
              if (state.lastTime.current > 0 && state.videoRef.current) {
                // If saved time is within 2.5 seconds of the end or past 96% of video, restart from beginning
                if (dur > 4 && (state.lastTime.current >= dur - 2.5 || state.lastTime.current / dur > 0.96)) {
                  state.videoRef.current.currentTime = 0;
                  state.lastTime.current = 0;
                } else {
                  state.videoRef.current.currentTime = state.lastTime.current;
                }
              } else if (state.videoRef.current && !props.video.playing) {
                try {
                  state.videoRef.current.currentTime = 0.001;
                } catch {}
              }
              
              if (props.video.playing && state.videoRef.current) {
                state.videoRef.current.play().catch(e => console.warn("Autoplay failed:", e));
              }
              setTimeout(state.handleTimeUpdate, 50);
            }}
            onError={() => {
              state.handleMediaError('video');
            }}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: props.isCropping ? 'contain' : fitMode, 
              backgroundColor: '#000',
              transform: `translate(${state.panOffset.x}px, ${state.panOffset.y}px) scale(${state.zoomScale}) ${props.video.flipped ? 'scaleX(-1) ' : ''}rotate(${props.video.rotation || 0}deg)`,
              transition: state.isPanning ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              filter: props.video.colorFilters ? `url(#filter-${state.filterId}) brightness(${state.filters.brightness}) contrast(${state.filters.contrast}) saturate(${state.filters.saturation}) hue-rotate(${state.filters.hue}deg)` : undefined
            }}
          />
        )
      ) : (
        props.isAiEnhancing ? (
          <div className="video-hibernate" style={{ background: '#000' }}>
            <div className="hibernate-label" style={{ color: 'var(--accent)', animation: 'pulse 1s infinite alternate' }}>
              ENHANCING PROTOCOL ACTIVE...
            </div>
          </div>
        ) : (
          <div className="video-hibernate">
            <div className="hibernate-shimmer" />
            <div className="hibernate-label">HIBERNATING...</div>
          </div>
        )
      )}

      {state.error && (
        <div className="unit-error-overlay">
          <AlertCircle size={20} color="var(--danger)" />
          <p>{state.error}</p>
          <button className="retry-btn" onClick={() => { state.handleManualRetry(); state.setError("RETRYING..."); }}>
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      {state.isSyncingOrRecovering && !state.error && (
        <div className="unit-syncing-overlay" style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(10, 15, 29, 0.88)',
          border: '1px solid var(--accent, #00ff88)',
          borderRadius: '16px',
          padding: '4px 10px',
          fontSize: '10px',
          fontWeight: 700,
          color: 'var(--accent, #00ff88)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(10px)',
          zIndex: 101,
          pointerEvents: 'none'
        }}>
          <RefreshCw size={11} className="spin" />
          <span>SYNCING MEDIA...</span>
        </div>
      )}

      {state.snapshotToast && (
        <div key={state.snapshotToast} className="snapshot-toast">SNAPSHOT SAVED</div>
      )}

      {/* Floating Zoom HUD Badge & Quick Reset Button */}
      {props.isFocused && state.zoomScale > 1 && !props.isCropping && (
        <div 
          className="zoom-hud-badge"
          style={{
            position: 'absolute',
            top: '24px',
            right: '24px',
            zIndex: 200000,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(10, 15, 29, 0.88)',
            border: '1px solid var(--accent, #00ff88)',
            borderRadius: '20px',
            padding: '5px 12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0, 255, 136, 0.3)',
            backdropFilter: 'blur(16px)',
            pointerEvents: 'auto',
            userSelect: 'none'
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>
            🔍 {Math.round(state.zoomScale * 100)}%
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              state.resetZoom();
            }}
            title="Reset Zoom to 100% (or Double Click / Esc)"
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '12px',
              padding: '2px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--accent, #00ff88)';
              e.currentTarget.style.color = '#000';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = '#fff';
            }}
          >
            Reset 1:1
          </button>
        </div>
      )}

      {/* Localized Demo File Warning Label */}
      {(props.video.url?.startsWith('demos/') || props.video.url?.startsWith('/demos/') || props.video.realPath?.includes('demos')) && (
        <div className="demo-notice-tag" style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          background: 'rgba(255, 171, 0, 0.9)',
          color: '#000',
          fontSize: '9px',
          fontWeight: 900,
          padding: '3px 8px',
          borderRadius: '4px',
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.4)',
          zIndex: 80,
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          Demo File: Snapshots Restricted
        </div>
      )}

      {props.masterShowUI && !immersive && (
        <div 
          className={`selection-indicator ${props.isSelected ? 'selected' : ''}`}
          onClick={(e) => { e.stopPropagation(); props.onToggleSelect?.(e.shiftKey, true); }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            props.onSelectAll?.();
          }}
          style={{ zIndex: 102 }}
        >
          {props.isSelected ? <CheckCircle2 size={18} fill="var(--accent)" color="black" /> : <div className="indicator-empty" />}
          
          <div className="select-badge-popover">
            <span className="primary-desc">Select Item</span>
            <div className="popover-divider" />
            <span className="secondary-desc">🖱️ Right-Click: Select All</span>
          </div>
        </div>
      )}

      {!props.isFocused && !state.isSyncingOrRecovering && (state.error || (props.masterShowUI && (props.selectionMode || state.showControls || props.isSelected))) && !immersive && (
        <button 
          onClick={(e) => { e.stopPropagation(); props.onRemove(props.video.id); }} 
          className="premium-close-btn"
          data-tooltip="Remove from Grid"
          style={{ 
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.6)', 
            border: '1px solid rgba(255,255,255,0.2)', 
            borderRadius: '50%', 
            width: '24px', 
            height: '24px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: '#fff',
            pointerEvents: 'auto',
            zIndex: 102,
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 77, 77, 0.8)';
            e.currentTarget.style.borderColor = 'rgba(255, 77, 77, 1)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.6)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <X size={12} />
        </button>
      )}

      <VideoCardOverlay
        props={props}
        state={state}
        immersive={immersive}
        enableSlideshowPanZoom={enableSlideshowPanZoom}
      />

      {!props.isFocused && state.showCardMenu && (
        <CardActionMenu
          isImage={state.isImage}
          unitRepeatMode={state.unitRepeatMode}
          onSelectAll={props.onSelectAll}
          onAnnihilate={() => props.onAnnihilate(props.video.id)}
          onClose={() => state.setShowCardMenu(false)}
          onStartStep={state.startStep}
          onStopStep={state.stopStep}
          onTakeSnapshot={state.takeSnapshot}
          onToggleUnitLoop={() => {
            props.onUpdateVideo(props.video.id, { repeatMode: state.unitRepeatMode === 'always' ? 'none' : 'always' });
          }}
        />
      )}

      {state.hudData && (
        <div className="hud-overlay">
          <div className="hud-badge">
            <span className="hud-title">{state.hudData.title}</span>
            <span className="hud-value">{state.hudData.value}</span>
          </div>
        </div>
      )}

      {state.isHoldingToCutout && (
        <div className="cutout-holding-overlay" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          border: '2px solid var(--accent, #00ff88)',
          borderRadius: 'inherit',
          boxShadow: '0 0 20px rgba(var(--accent-rgb, 0, 255, 136), 0.5), inset 0 0 10px rgba(var(--accent-rgb, 0, 255, 136), 0.3)',
          animation: 'pulse-cutout 0.8s ease-in-out infinite',
          zIndex: 9,
          pointerEvents: 'none'
        }} />
      )}

      {props.isStickerLoading && (
        <div className="card-processing-overlay premium-glass" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(5, 5, 8, 0.75)',
          backdropFilter: 'blur(10px)',
          zIndex: 10,
          gap: '12px'
        }}>
          <div className="spinner" style={{ 
            border: '2px solid rgba(255, 255, 255, 0.1)', 
            borderTop: '2px solid var(--accent, #00ff88)',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--accent, #00ff88)', letterSpacing: '1px', textTransform: 'uppercase' }}>
            CREATING STICKER...
          </span>
          {props.onCancelSticker && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                props.onCancelSticker();
              }}
              style={{
                marginTop: '4px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fff',
                fontSize: '9px',
                fontWeight: 'bold',
                padding: '4px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'background 0.2s',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

class UnitErrorBoundary extends React.Component<{ children: React.ReactNode, id: string }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode, id: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="video-card ui-visible" style={{ border: '2px solid var(--danger)', padding: 10, background: '#000000' }}>
          <div className="unit-error-overlay" style={{ position: 'relative', height: '100%' }}>
            <AlertCircle size={24} color="var(--danger)" />
            <p style={{ margin: '10px 0', fontSize: 12, wordBreak: 'break-all' }}>UNIT CRASH: {this.state.error?.message}</p>
            <button className="retry-btn" onClick={() => this.setState({ hasError: false, error: null })}>
              <RefreshCw size={14} /> RECOVER
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const VideoCard = React.memo((props: any) => (
  <UnitErrorBoundary id={props.video.id}>
    <VideoCardInternal {...props} />
  </UnitErrorBoundary>
));
export default VideoCard;
