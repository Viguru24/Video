import React from 'react';
import {
  Play, Pause, RefreshCw, Camera, Volume2, VolumeX, GripVertical,
  Minimize2, FolderOpen, ChevronLeft, ChevronRight, Maximize,
  Sliders, Crop, Sparkles, ExternalLink
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../../store/useStore';
import { triggerPopOut, isTauri } from '../../utils/videoUtils';
import type { VideoCardProps } from './index';
import type { useVideoCard } from './useVideoCard';

interface VideoCardOverlayProps {
  props: VideoCardProps;
  state: ReturnType<typeof useVideoCard>;
  immersive: boolean;
  enableSlideshowPanZoom: boolean;
}

export const VideoCardOverlay: React.FC<VideoCardOverlayProps> = ({
  props,
  state,
  immersive,
  enableSlideshowPanZoom,
}) => {
  return (
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
                props.onUpscale!(props.video);
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
  );
};
