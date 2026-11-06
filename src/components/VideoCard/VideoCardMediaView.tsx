import React from 'react';
import { ColorFilterDefs } from '../ColorFilterDefs';
import { AudioCard } from './AudioCard';
import type { VideoCardProps } from './types';
import type { RepeatMode } from '../../types';

export interface VideoCardMediaViewProps {
  props: VideoCardProps;
  state: any;
  fitMode: 'contain' | 'cover' | 'fill';
  currentMode: RepeatMode;
  enableSlideshowPanZoom: boolean;
}

export function VideoCardMediaView({
  props,
  state,
  fitMode,
  currentMode,
  enableSlideshowPanZoom
}: VideoCardMediaViewProps) {
  return (
    <>
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
              decoding="auto"
              loading="eager"
              fetchPriority="high"
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
    </>
  );
}
