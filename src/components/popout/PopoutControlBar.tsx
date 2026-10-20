import React from 'react';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Repeat1,
  Repeat,
  Volume2,
  VolumeX,
  Sliders,
  Crop,
  Sparkles,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { VideoItem } from '../../types';

interface PopoutControlBarProps {
  activeVideo: VideoItem;
  isCropping: boolean;
  showUI: boolean;
  isImage: boolean;
  videoPlaying: boolean;
  setVideoPlaying: (v: boolean) => void;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (v: boolean) => void;
  slideshowInterval: number;
  setSlideshowInterval: React.Dispatch<React.SetStateAction<number>>;
  showHudNotification: (label: string, value: string) => void;
  startFrameStep: (action: 'stepback' | 'stepforward') => void;
  stopFrameStep: () => void;
  onUpdateVideo: (id: any, updates: any) => void;
  popoutVolumeContainerRef: React.RefObject<HTMLDivElement | null>;
  muted: boolean;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  volume: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  setColorAdjustId: (id: string | null) => void;
  setIsCropping: (c: boolean) => void;
  setCropBox: (b: any) => void;
  setAspectRatio: (a: any) => void;
  handleUpscale: (video: VideoItem) => void;
}

export const PopoutControlBar: React.FC<PopoutControlBarProps> = ({
  activeVideo,
  isCropping,
  showUI,
  isImage,
  videoPlaying,
  setVideoPlaying,
  isSlideshowActive,
  setIsSlideshowActive,
  slideshowInterval,
  setSlideshowInterval,
  showHudNotification,
  startFrameStep,
  stopFrameStep,
  onUpdateVideo,
  popoutVolumeContainerRef,
  muted,
  setMuted,
  volume,
  setVolume,
  setColorAdjustId,
  setIsCropping,
  setCropBox,
  setAspectRatio,
  handleUpscale,
}) => {
  if (!activeVideo || isCropping) return null;

  return (
    <div 
      className="solo-control-bar" 
      style={{
        position: 'absolute',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100000,
        background: 'rgba(10, 10, 12, 0.75)',
        backdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '30px',
        padding: '4px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        opacity: showUI ? 1 : 0,
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
        pointerEvents: showUI ? 'auto' : 'none'
      }}
    >
      {/* Frame Step Back (1 frame) */}
      {!isImage && (
        <button 
          onClick={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            if (e.button === 0) startFrameStep('stepback');
          }}
          onMouseUp={stopFrameStep}
          onMouseLeave={stopFrameStep}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            borderRadius: '50%',
            transition: 'background 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          onMouseOut={e => e.currentTarget.style.background = 'none'}
          title="Step Back (1 Frame)"
        >
          <ChevronLeft size={12} />
        </button>
      )}

      {/* Play / Pause Toggle Button */}
      <button 
        onClick={() => {
          if (isImage) {
            setIsSlideshowActive(!isSlideshowActive);
          } else {
            setVideoPlaying(!videoPlaying);
          }
        }}
        onWheel={(e) => {
          if (isImage) {
            e.stopPropagation();
            const direction = e.deltaY < 0 ? 1 : -1;
            const next = Math.max(1, Math.min(60, (slideshowInterval || 5) + direction));
            setSlideshowInterval(next);
            showHudNotification('SLIDESHOW', `${next}s`);
          }
        }}
        style={{
          background: '#ffffff',
          border: 'none',
          color: '#000',
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          cursor: 'pointer',
          boxShadow: '0 0 10px rgba(255, 255, 255, 0.4)'
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = 'scale(1.08)';
          e.currentTarget.style.boxShadow = '0 0 14px rgba(255, 255, 255, 0.6)';
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 0 10px rgba(255, 255, 255, 0.4)';
        }}
        title={isImage ? `${isSlideshowActive ? "Pause Slideshow" : "Play Slideshow"} (${slideshowInterval}s - scroll to adjust)` : (videoPlaying ? "Pause Video" : "Play Video")}
      >
        {isImage ? (
          isSlideshowActive ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />
        ) : (
          videoPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />
        )}
      </button>

      {/* Frame Step Forward (1 frame) */}
      {!isImage && (
        <button 
          onClick={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            if (e.button === 0) startFrameStep('stepforward');
          }}
          onMouseUp={stopFrameStep}
          onMouseLeave={stopFrameStep}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            borderRadius: '50%',
            transition: 'background 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          onMouseOut={e => e.currentTarget.style.background = 'none'}
          title="Step Forward (1 Frame)"
        >
          <ChevronRight size={12} />
        </button>
      )}

      {/* Divider */}
      <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.12)' }} />

      {/* Repeat One (Loop Single Video) */}
      <button 
        onClick={() => {
          const current = activeVideo?.repeatMode || (localStorage.getItem('cosmo-repeat') || 'folder');
          const nextMode = current === 'always' ? 'none' : 'always';
          if (activeVideo) {
            onUpdateVideo(activeVideo.id, { repeatMode: nextMode });
          }
          localStorage.setItem('cosmo-repeat', nextMode);
          showHudNotification("REPEAT MODE", nextMode === 'always' ? "Repeat One" : "Off");
        }}
        style={{
          background: 'none',
          border: 'none',
          color: (activeVideo?.repeatMode === 'always' || localStorage.getItem('cosmo-repeat') === 'always') 
            ? 'var(--accent, #00ff88)' 
            : '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          borderRadius: '50%',
          transition: 'all 0.2s'
        }}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseOut={e => e.currentTarget.style.background = 'none'}
        title="Repeat One (Loop Video)"
      >
        <Repeat1 size={14} />
      </button>

      {/* Repeat All (Loop Playlist / Folder) */}
      <button 
        onClick={() => {
          const current = activeVideo?.repeatMode || (localStorage.getItem('cosmo-repeat') || 'folder');
          const nextMode = current === 'folder' ? 'none' : 'folder';
          if (activeVideo) {
            onUpdateVideo(activeVideo.id, { repeatMode: nextMode });
          }
          localStorage.setItem('cosmo-repeat', nextMode);
          showHudNotification("REPEAT MODE", nextMode === 'folder' ? "Repeat All" : "Off");
        }}
        style={{
          background: 'none',
          border: 'none',
          color: (activeVideo?.repeatMode === 'folder' || localStorage.getItem('cosmo-repeat') === 'folder') 
            ? 'var(--accent, #00ff88)' 
            : '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          borderRadius: '50%',
          transition: 'all 0.2s'
        }}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseOut={e => e.currentTarget.style.background = 'none'}
        title="Repeat All (Loop Folder)"
      >
        <Repeat size={14} />
      </button>

      {/* Divider */}
      <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.12)' }} />

      {/* Volume Control Group */}
      {!isImage && (
        <div 
          ref={popoutVolumeContainerRef}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <button 
            onClick={() => setMuted(prev => !prev)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '50%',
              transition: 'background 0.2s, transform 0.1s'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input 
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              if (muted) {
                setMuted(false);
              }
            }}
            style={{
              width: '50px',
              height: '3px',
              borderRadius: '2px',
              background: `linear-gradient(to right, var(--accent, #00ff88) ${(muted ? 0 : volume) * 100}%, rgba(255, 255, 255, 0.2) ${(muted ? 0 : volume) * 100}%)`,
              outline: 'none',
              cursor: 'pointer',
              WebkitAppearance: 'none',
              transition: 'all 0.2s'
            }}
            title={`Volume: ${Math.round((muted ? 0 : volume) * 100)}% - Scroll to adjust`}
          />
        </div>
      )}

      {/* Divider */}
      <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.12)' }} />

      {/* Tools: Color Adjust */}
      <button 
        onClick={() => setColorAdjustId(activeVideo.id)}
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          borderRadius: '50%',
          transition: 'background 0.2s, transform 0.1s'
        }}
        onMouseOver={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseOut={e => {
          e.currentTarget.style.background = 'none';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        title="Color adjustment"
      >
        <Sliders size={14} />
      </button>

      {isImage && (
        <button 
          onClick={() => {
            setIsCropping(true);
            setCropBox({ x: 15, y: 15, w: 70, h: 70 });
            setAspectRatio('free');
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px',
            borderRadius: '50%',
            transition: 'background 0.2s, transform 0.1s'
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Crop Image"
        >
          <Crop size={18} />
        </button>
      )}

      {isImage && (
        <button 
          onClick={() => handleUpscale(activeVideo)}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px',
            borderRadius: '50%',
            transition: 'background 0.2s, transform 0.1s'
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="✨ AI Upscaling"
        >
          <Sparkles size={18} />
        </button>
      )}

      <button 
        onClick={() => getCurrentWindow().close()}
        style={{
          background: 'rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#fff',
          fontSize: '10px',
          fontWeight: 'bold',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          borderRadius: '20px',
          padding: '6px 14px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          marginLeft: '4px'
        }}
        onMouseOver={e => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }}
        onMouseOut={e => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }}
      >
        {isImage ? 'Close' : 'Stop'}
      </button>
    </div>
  );
};
