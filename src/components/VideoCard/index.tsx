import React from 'react';
import { motion } from 'framer-motion';
import { 
  Play, 
  Pause, 
  RefreshCw, 
  X, 
  AlertCircle, 
  CheckCircle2 
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useVideoCard } from './useVideoCard';
import type { VideoCardProps } from './types';
import { CardActionMenu } from './CardActionMenu';
import { VideoCardMediaView } from './VideoCardMediaView';
import { VideoCardOverlayHeader } from './VideoCardOverlayHeader';
import { VideoCardOverlayFooter } from './VideoCardOverlayFooter';
import { UnitErrorBoundary } from './UnitErrorBoundary';

export * from './types';

function VideoCardInternal(props: VideoCardProps) {
  const { fitMode = 'contain' } = props;
  const state = useVideoCard(props);

  const immersive = useStore((state) => state.immersive);
  const enableSlideshowPanZoom = useStore((state) => state.enableSlideshowPanZoom);

  const isSingleVideo = !props.video.folderFiles || props.video.folderFiles.length === 0;
  const currentMode = (() => {
    if (props.video.repeatMode && props.video.repeatMode !== 'none') {
      let m = props.video.repeatMode;
      if (m as any === 'all') m = 'folder';
      return m;
    }
    const baseMode = props.globalRepeat;
    if (baseMode === 'none') return 'none';
    let normMode = baseMode;
    if (normMode as any === 'all') normMode = 'folder';
    
    if (props.isFocused && normMode === 'folder') {
      return 'folder';
    }
    
    return isSingleVideo ? 'always' : 'folder';
  })();

  const handleCardDoubleClick = React.useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('.drag-handle-mini') ||
      target.closest('.scrub-container') ||
      target.closest('.focused-scrub-container') ||
      target.closest('.card-action-menu') ||
      target.closest('.selection-indicator') ||
      target.closest('.mini-controls') ||
      target.closest('.zoom-hud-badge')
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (props.isCropping) return;

    if (!props.isFocused) {
      props.onDeepFocus(state.videoRef.current ? state.videoRef.current.currentTime : undefined);
    } else {
      if (state.zoomScale > 1) {
        state.resetZoom();
      } else {
        props.onCloseFocus();
      }
    }
  }, [props.isCropping, props.isFocused, props.onDeepFocus, props.onCloseFocus, state.zoomScale, state.resetZoom, state.videoRef]);

  return (
    <motion.div
      ref={state.cardRef}
      className={`video-card ${props.isFocused ? 'focused' : ''} ${props.isSelected ? 'selected' : ''} ${state.showControls ? 'ui-visible' : ''} ${props.video.borderWidth ? `border-w-${props.video.borderWidth}` : ''}`}
      data-id={props.video.id}
      layout="position"
      {...state.dragProps}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onContextMenu(e.clientX, e.clientY);
      }}
      onMouseEnter={() => {
        state.setIsHovered(true);
        state.resetControlsTimer();
      }}
      onMouseMove={state.handleMouseMove}
      onMouseUp={state.handleMouseUp}
      onMouseLeave={() => {
        state.setIsHovered(false);
        state.setIsInteracting(false);
      }}
      onMouseDown={state.handleMouseDown}
      onTouchStart={state.handleTouchStart}
      onTouchEnd={state.handleTouchEnd}
      onDoubleClick={handleCardDoubleClick}
      style={{
        borderColor: props.video.borderColor || undefined,
        touchAction: 'none'
      }}
    >
      <VideoCardMediaView
        props={props}
        state={state}
        fitMode={fitMode}
        currentMode={currentMode}
        enableSlideshowPanZoom={enableSlideshowPanZoom}
      />

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

      {/* Floating Zoom HUD Badge */}
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

      <div className={`video-overlay ${(props.selectionMode || state.showControls || props.isFocused || props.isSelected) && props.masterShowUI ? 'visible' : 'hidden'}`}>
        
        {props.isFocused && !state.isImage && (
          <div 
            ref={state.focusedScrubContainerRef}
            className="focused-scrub-container"
            onMouseDown={(e) => { e.stopPropagation(); (state as any).isScrubbing.current = true; state.handleFocusedScrub(e); }}
            onMouseEnter={() => {
              const handle = state.focusedHandleRef.current;
              if (handle) handle.style.transform = 'translate(-50%, -50%) scale(1.3)';
            }}
            onMouseLeave={() => {
              const handle = state.focusedHandleRef.current;
              if (handle) handle.style.transform = 'translate(-50%, -50%) scale(1)';
            }}
            style={{
              position: 'absolute',
              bottom: '96px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '90%',
              maxWidth: '1200px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              zIndex: 100000,
              cursor: 'pointer',
              pointerEvents: props.masterShowUI ? 'auto' : 'none',
              opacity: props.masterShowUI ? 1 : 0,
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              padding: '0 10px',
              userSelect: 'none'
            }}
          >
            <div 
              ref={state.focusedTrackRef}
              style={{
                position: 'relative',
                flex: 1,
                height: '6px',
                background: 'rgba(255, 255, 255, 0.12)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '4px'
              }}
            >
              <div 
                ref={state.focusedProgressRef}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--accent, #00ff88), #0096ff)',
                  borderRadius: '4px',
                  boxShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
                  width: '0%'
                }}
              />
              <div 
                ref={state.focusedHandleRef}
                style={{
                  position: 'absolute',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: '#fff',
                  border: '2px solid var(--accent, #00ff88)',
                  boxShadow: '0 0 8px rgba(0, 255, 136, 0.8), 0 2px 4px rgba(0,0,0,0.5)',
                  left: '0%',
                  transition: 'transform 0.1s ease',
                  pointerEvents: 'none'
                }}
              />
            </div>
            <div 
              ref={state.focusedTimeTextRef}
              style={{
                color: '#fff',
                fontSize: '12px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                letterSpacing: '0.5px',
                background: 'rgba(10, 10, 12, 0.75)',
                backdropFilter: 'blur(12px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '4px 10px',
                borderRadius: '12px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                minWidth: '95px',
                textAlign: 'center'
              }}
            >
              0:00 / 0:00
            </div>
          </div>
        )}

        <VideoCardOverlayHeader
          props={props}
          state={state}
          immersive={immersive}
        />

        <div 
          className="overlay-center" 
          onClick={(e) => {
            if ((props.selectionMode || e.shiftKey || e.ctrlKey || e.metaKey) && props.onToggleSelect) {
              props.onToggleSelect(e.shiftKey, e.ctrlKey || e.metaKey);
            } else if (!state.isImage) {
              props.onUpdateVideo(props.video.id, { playing: !props.video.playing });
            }
          }}
          onDoubleClick={handleCardDoubleClick}
        >
          <div className="play-indicator-subtle" style={{ opacity: state.showControls ? 1 : 0 }}>
             {!props.selectionMode && !state.isImage && (props.video.playing ? <Pause size={24} fill="rgba(255,255,255,0.4)" color="transparent" /> : <Play size={24} fill="rgba(255,255,255,0.4)" color="transparent" />)}
          </div>
        </div>

        <VideoCardOverlayFooter
          props={props}
          state={state}
          enableSlideshowPanZoom={enableSlideshowPanZoom}
        />
      </div>

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
                props.onCancelSticker?.();
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

export const VideoCard = React.memo((props: any) => (
  <UnitErrorBoundary id={props.video.id}>
    <VideoCardInternal {...props} />
  </UnitErrorBoundary>
));
export default VideoCard;
