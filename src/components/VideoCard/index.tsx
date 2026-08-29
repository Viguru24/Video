import React from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RefreshCw, Camera, Volume2, VolumeX, GripVertical, Minimize2, FolderOpen, X, AlertCircle, ChevronLeft, ChevronRight, Maximize, CheckCircle2, Trash2, Sliders, Crop, Sparkles, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../../store/useStore';
import { triggerPopOut } from '../../utils/videoUtils';
import { useVideoCard } from './useVideoCard';
import type { UseVideoCardProps } from './useVideoCard';
import { AudioCard } from './AudioCard';
import { ColorFilterDefs } from '../ColorFilterDefs';

interface VideoCardProps extends Omit<UseVideoCardProps, 'quality'> {
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
      onMouseUp={state.handleMouseUp}
      onDoubleClick={() => props.onDeepFocus(state.videoRef.current ? state.videoRef.current.currentTime : undefined)}
      onTouchStart={state.handleTouchStart}
      onTouchEnd={state.handleTouchEnd}
      onContextMenu={(e) => { e.preventDefault(); props.onContextMenu(e.clientX, e.clientY); }}
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
                key={state.displayUrl}
                src={state.displayUrl}
                alt={props.video.title}
                crossOrigin="anonymous"
                draggable="false"
                decoding="async"
                loading="lazy"
                fetchPriority={props.isVisible ? "high" : "low"}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: props.isCropping ? 'contain' : fitMode, 
                  imageOrientation: 'none', 
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
              state.setError(null);
              
              if (props.video.playing && state.videoRef.current) {
                state.videoRef.current.play().catch(e => console.warn("Autoplay failed:", e));
              }
              setTimeout(state.handleTimeUpdate, 50);
            }}
            onError={() => {
              const friendlyError = "LOAD ERROR";
              // If initial load failed, attempt a quick retry in 1.2s in case file was still being written
              if (!state.retryAttempted?.current) {
                if (state.retryAttempted) state.retryAttempted.current = true;
                setTimeout(() => {
                  if (state.videoRef.current) {
                    state.videoRef.current.load();
                  }
                }, 1200);
              } else {
                state.setError(friendlyError);
                props.onLog(`Unit [${props.video.title}] Error: ${friendlyError}`);
              }
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
          <button className="retry-btn" onClick={() => { state.videoRef.current?.load(); state.setError("RETRYING..."); }}>
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      {state.snapshotToast && (
        <div key={state.snapshotToast} className="snapshot-toast">SNAPSHOT SAVED</div>
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

      {!props.isFocused && (state.error || (props.masterShowUI && (props.selectionMode || state.showControls || props.isSelected))) && !immersive && (
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

      {(
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

        {props.isFocused && !immersive && (
          <div className="focused-exit-overlay" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {props.onUpscale && (
              <button
                className="exit-focus-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onUpscale(props.video);
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
        )}

        {!props.isFocused && (
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
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        )}

        <div className="overlay-center" onClick={(e) => {
          if ((props.selectionMode || e.shiftKey || e.ctrlKey || e.metaKey) && props.onToggleSelect) {
            props.onToggleSelect(e.shiftKey, e.ctrlKey || e.metaKey);
          } else if (!state.isImage) {
            props.onUpdateVideo(props.video.id, { playing: !props.video.playing });
          }
        }}>
          <div className="play-indicator-subtle" style={{ opacity: state.showControls ? 1 : 0 }}>
             {!props.selectionMode && !state.isImage && (props.video.playing ? <Pause size={24} fill="rgba(255,255,255,0.4)" color="transparent" /> : <Play size={24} fill="rgba(255,255,255,0.4)" color="transparent" />)}
          </div>
        </div>

        {!props.isFocused && (
          <div className="overlay-footer" style={{ background: 'transparent', backdropFilter: 'none', borderTop: 'none', padding: '8px' }}>
            {!state.isImage && (
              <div 
                className="scrub-container" 
                onMouseDown={(e) => { e.stopPropagation(); (state as any).isScrubbing.current = true; state.handleScrub(e); }}
              >
                <div className="scrub-bar-bg">
                  <div ref={state.progressRef} className="scrub-progress" style={{ width: '0%' }} />
                </div>
                <div ref={state.handleRef} className="scrub-handle" style={{ left: '0%' }} />
                <div ref={state.textRef} className="progress-text">0%</div>
              </div>
            )}

            {state.isImage && props.video.folderFiles && props.video.folderFiles.length > 1 && (
              <div className="image-counter" style={{ fontSize: '10px', opacity: 0.6, textAlign: 'center', padding: '2px 0', letterSpacing: '1px' }}>
                {(props.video.currentIdx || 0) + 1} / {props.video.folderFiles.length}
              </div>
            )}

            <div className="mini-controls" onDoubleClick={(e) => e.stopPropagation()}>
              {state.isImage ? (
                <>
                  <button 
                    className="mini-btn highlight" 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (props.setIsSlideshowActive) {
                        if (!props.isSlideshowActive) {
                          props.onFocus();
                        }
                        props.setIsSlideshowActive(!props.isSlideshowActive);
                      }
                    }}
                    data-tooltip={props.isSlideshowActive ? "Pause Slideshow" : "Play Slideshow"}
                    style={{ 
                      background: 'var(--accent, #00ff88)',
                      color: '#000',
                      borderRadius: '50%'
                    }}
                  >
                    {props.isSlideshowActive ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                  </button>

                  <button
                    className="mini-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const nextVal = !enableSlideshowPanZoom;
                      useStore.getState().setEnableSlideshowPanZoom(nextVal);
                      (state as any).showHudNotification('PAN & ZOOM', nextVal ? 'ON' : 'OFF');
                    }}
                    data-tooltip={enableSlideshowPanZoom ? "Slideshow Pan & Zoom: ON" : "Slideshow Pan & Zoom: OFF"}
                    style={{
                      background: 'transparent',
                      color: enableSlideshowPanZoom ? 'var(--accent, #00ff88)' : '#fff'
                    }}
                  >
                    <Maximize size={12} />
                  </button>
                  
                  <button 
                    className="mini-btn" 
                    onClick={(e) => { e.stopPropagation(); props.onColorAdjust?.(props.video.id); }} 
                    data-tooltip="Color Adjustment" 
                    style={{ background: 'transparent' }}
                  >
                    <Sliders size={12} />
                  </button>

                  <button 
                    className="mini-btn" 
                    onClick={(e) => { e.stopPropagation(); props.onStartCrop?.(props.video.id); }} 
                    data-tooltip="Crop Image" 
                    style={{ background: 'transparent' }}
                  >
                    <Crop size={12} />
                  </button>

                  {props.onUpscale && (
                    <button 
                      className="mini-btn" 
                      onClick={(e) => { e.stopPropagation(); props.onUpscale?.(props.video); }} 
                      data-tooltip="AI Upscale (4x Enhance)" 
                      style={{ background: 'transparent' }}
                      disabled={props.isAiEnhancing}
                    >
                      <Sparkles size={12} className={props.isAiEnhancing ? "spin-slow" : ""} />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button 
                    className="mini-btn" 
                    onMouseDown={(e) => { e.stopPropagation(); state.startStep(-1); }} 
                    onMouseUp={(e) => { e.stopPropagation(); state.stopStep(); }} 
                    onMouseLeave={(e) => { e.stopPropagation(); state.stopStep(); }}
                    data-tooltip="Step Back"
                    style={{ background: 'transparent' }}
                  >
                    <ChevronLeft size={10} />
                  </button>
                  
                  <button 
                    className="mini-btn play-btn highlight" 
                    onClick={(e) => { e.stopPropagation(); props.onUpdateVideo(props.video.id, { playing: !props.video.playing }); }}
                    data-tooltip={props.video.playing ? "Pause" : "Play"}
                  >
                    {props.video.playing ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
                  </button>
                  
                  <button 
                    className="mini-btn" 
                    onMouseDown={(e) => { e.stopPropagation(); state.startStep(1); }} 
                    onMouseUp={(e) => { e.stopPropagation(); state.stopStep(); }} 
                    onMouseLeave={(e) => { e.stopPropagation(); state.stopStep(); }}
                    data-tooltip="Step Forward"
                    style={{ background: 'transparent' }}
                  >
                    <ChevronRight size={10} />
                  </button>

                  <button 
                    className="mini-btn" 
                    onClick={(e) => { e.stopPropagation(); state.handleMuteToggle(); }} 
                    data-tooltip={state.effectiveMuted ? "Unmute" : "Mute"} 
                    style={{ background: 'transparent' }}
                  >
                    {state.effectiveMuted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                  </button>



                  <button 
                    className="mini-btn cyan-outline" 
                    onClick={(e) => { e.stopPropagation(); state.takeSnapshot(); }} 
                    data-tooltip="Save Snapshot" 
                  >
                    <Camera size={10} />
                  </button>
                  
                  <button 
                    className="mini-btn cyan-outline" 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      const targetPath = (props.snapshotDir && props.snapshotDir.trim() !== '') ? props.snapshotDir : 'default_snapshots';
                      if (props.onLog) {
                        props.onLog(`SYSTEM: Opening snapshots folder → "${targetPath}"`);
                      }
                      invoke('open_folder', { path: targetPath }).catch((err: any) => {
                        if (props.onLog) props.onLog(`ERROR: open_folder failed: ${err}`);
                        console.error('open_folder invoke error:', err);
                      });
                    }} 
                    data-tooltip="Open Snapshots Folder"
                  >
                    <FolderOpen size={10} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {!props.isFocused && state.showCardMenu && (
        <div 
          className="card-action-menu"
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="card-menu-header">
            <span>ACTIONS</span>
            <button 
              onClick={(e) => { e.stopPropagation(); state.setShowCardMenu(false); }} 
              className="card-menu-close"
            >
              <X size={10} />
            </button>
          </div>
          <div className="card-menu-items">
            {state.isImage ? (
              <>
                {props.onSelectAll && (
                  <button 
                    className="card-menu-item" 
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onSelectAll();
                      state.setShowCardMenu(false);
                    }}
                  >
                    <CheckCircle2 size={12} />
                    <span>Select All</span>
                  </button>
                )}
                <button 
                  className="card-menu-item danger" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    props.onAnnihilate(props.video.id); 
                    state.setShowCardMenu(false); 
                  }}
                >
                  <Trash2 size={12} />
                  <span>Recycle Bin</span>
                </button>
              </>
            ) : (
              <>
                <div className="card-menu-row">
                  <button 
                    className="card-menu-item-half" 
                    onMouseDown={(e) => { e.stopPropagation(); state.startStep(-1); }} 
                    onMouseUp={(e) => { e.stopPropagation(); state.stopStep(); }} 
                    onMouseLeave={(e) => { e.stopPropagation(); state.stopStep(); }}
                  >
                    <ChevronLeft size={12} />
                    <span>Step Back</span>
                  </button>
                  <button 
                    className="card-menu-item-half" 
                    onMouseDown={(e) => { e.stopPropagation(); state.startStep(1); }} 
                    onMouseUp={(e) => { e.stopPropagation(); state.stopStep(); }} 
                    onMouseLeave={(e) => { e.stopPropagation(); state.stopStep(); }}
                  >
                    <ChevronRight size={12} />
                    <span>Step Fwd</span>
                  </button>
                </div>
                <button className="card-menu-item" onClick={(e) => { e.stopPropagation(); state.takeSnapshot(); state.setShowCardMenu(false); }}>
                  <Camera size={12} />
                  <span>Save Snapshot</span>
                </button>
                <button 
                  className="card-menu-item" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    props.onUpdateVideo(props.video.id, { repeatMode: state.unitRepeatMode === 'always' ? 'none' : 'always' }); 
                  }}
                >
                  <Repeat1 size={12} />
                  <span>Loop: {state.unitRepeatMode === 'always' ? 'ON' : 'OFF'}</span>
                </button>
                {props.onSelectAll && (
                  <button 
                    className="card-menu-item" 
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onSelectAll();
                      state.setShowCardMenu(false);
                    }}
                  >
                    <CheckCircle2 size={12} />
                    <span>Select All</span>
                  </button>
                )}
                <button 
                  className="card-menu-item danger" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    props.onAnnihilate(props.video.id); 
                    state.setShowCardMenu(false); 
                  }}
                >
                  <Trash2 size={12} />
                  <span>Recycle Bin</span>
                </button>
              </>
            )}
          </div>
        </div>
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
