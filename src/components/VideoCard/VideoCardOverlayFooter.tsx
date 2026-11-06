import React from 'react';
import { 
  Play, 
  Pause, 
  Camera, 
  Volume2, 
  VolumeX, 
  FolderOpen, 
  ChevronLeft, 
  ChevronRight, 
  Maximize, 
  Sliders, 
  Crop, 
  Sparkles 
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../../store/useStore';
import type { VideoCardProps } from './types';
import { SoloTimelinePins } from '../solo/SoloTimelinePins';

export interface VideoCardOverlayFooterProps {
  props: VideoCardProps;
  state: any;
  enableSlideshowPanZoom: boolean;
}

export function VideoCardOverlayFooter({
  props,
  state,
  enableSlideshowPanZoom
}: VideoCardOverlayFooterProps) {
  if (props.isFocused) return null;

  return (
    <div className="overlay-footer" style={{ background: 'transparent', backdropFilter: 'none', borderTop: 'none', padding: '8px' }}>
      {!state.isImage && (
        <div 
          className="scrub-container" 
          onMouseDown={(e) => { e.stopPropagation(); (state as any).isScrubbing.current = true; state.handleScrub(e); }}
          style={{ position: 'relative' }}
        >
          <div className="scrub-bar-bg">
            <div ref={state.progressRef} className="scrub-progress" style={{ width: '0%' }} />
          </div>
          {props.video.bookmarks && props.video.bookmarks.length > 0 && state.videoRef?.current?.duration && (
            <SoloTimelinePins
              bookmarks={props.video.bookmarks}
              duration={state.videoRef.current.duration}
              onSeek={(time) => {
                if (state.videoRef?.current) {
                  state.videoRef.current.currentTime = time;
                }
              }}
            />
          )}
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
                (state as any).showHudNotification?.('PAN & ZOOM', nextVal ? 'ON' : 'OFF');
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
            <button 
              className="mini-btn" 
              onClick={(e) => { e.stopPropagation(); props.onUpscale?.(props.video); }} 
              data-tooltip="Upscale using RTX GPU" 
              style={{ background: 'transparent' }}
            >
              <Sparkles size={12} />
            </button>
          </>
        ) : (
          <>
            <button
              className="mini-btn highlight"
              onClick={(e) => {
                e.stopPropagation();
                props.onUpdateVideo(props.video.id, { playing: !props.video.playing });
              }}
              data-tooltip={props.video.playing ? "Pause" : "Play"}
            >
              {props.video.playing ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button
              className="mini-btn"
              onClick={(e) => {
                e.stopPropagation();
                props.onUpdateVideo(props.video.id, { muted: !props.video.muted });
              }}
              data-tooltip={props.video.muted ? "Unmute" : "Mute"}
            >
              {props.video.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
            <button
              className="mini-btn"
              onClick={(e) => {
                e.stopPropagation();
                state.handleSnapshot();
              }}
              data-tooltip="Save Snapshot"
            >
              <Camera size={12} />
            </button>
          </>
        )}

        {props.video.folderFiles && props.video.folderFiles.length > 1 && (
          <div className="folder-nav-group">
            <button
              className="mini-btn"
              onClick={(e) => {
                e.stopPropagation();
                state.navigateFolder(-1);
              }}
              data-tooltip="Previous File"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              className="mini-btn"
              onClick={(e) => {
                e.stopPropagation();
                state.navigateFolder(1);
              }}
              data-tooltip="Next File"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}

        <button
          className="mini-btn expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            props.onDeepFocus(state.videoRef.current ? state.videoRef.current.currentTime : undefined);
          }}
          data-tooltip="Enlarge (Focus Mode)"
        >
          <Maximize size={12} />
        </button>
      </div>
    </div>
  );
}
