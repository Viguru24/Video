import React from 'react';
import { Pause, Play, Sliders, Crop, Minimize2, ChevronLeft, ChevronRight, VolumeX, Volume2, Camera, CheckCircle2, MoreHorizontal, Repeat, Repeat1, Scissors, Share2 } from 'lucide-react';
import type { VideoItem } from '../../types';
import { useStore } from '../../store/useStore';
import { triggerPopOut } from '../../utils/videoUtils';
import { SoloAiMenu } from './SoloAiMenu';
import { ExternalLink } from 'lucide-react';

interface SoloControlBarProps {
  focusedVideo: VideoItem;
  isFocusedImage: boolean;
  showImmersiveUI: boolean;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (val: boolean) => void;
  setColorAdjustId: (id: string | null) => void;
  setIsCropping: (val: boolean) => void;
  setCropBox: React.Dispatch<React.SetStateAction<{ x: number; y: number; w: number; h: number }>>;
  setAspectRatio: (val: 'free' | '1:1' | '16:9' | '4:3') => void;
  handleResize?: (v: VideoItem) => void;
  startFrameStep: (action: 'stepback' | 'stepforward', videoId: string) => void;
  stopFrameStep: () => void;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addLog: (msg: string) => void;
  soloVolumeContainerRef: React.RefObject<HTMLDivElement | null>;
  toggleMasterMute: (soloId?: string) => void;
  masterMuted: boolean;
  globalVolume: number;
  setGlobalVolume: (vol: number) => void;
  setMasterMuted: (val: boolean) => void;
  setGlobalControl: (val: string | null) => void;
  showAiMenu: boolean;
  setShowAiMenu: (show: boolean) => void;
  setShowReshapeModal: (show: boolean) => void;
  setShowFrameModal: (show: boolean) => void;
  setShowPortraitBlurModal: (show: boolean) => void;
  handleUpscale: (v: VideoItem) => void;
  isStickerLoading?: boolean;
  onCreateSticker?: (video: VideoItem) => void;
  handleContext: (id: string, x: number, y: number) => void;
}

export const SoloControlBar: React.FC<SoloControlBarProps> = ({
  focusedVideo,
  isFocusedImage,
  showImmersiveUI,
  isSlideshowActive,
  setIsSlideshowActive,
  setColorAdjustId,
  setIsCropping,
  setCropBox,
  setAspectRatio,
  handleResize,
  startFrameStep,
  stopFrameStep,
  onUpdateVideo,
  setVideos,
  addLog,
  soloVolumeContainerRef,
  toggleMasterMute,
  masterMuted,
  globalVolume,
  setGlobalVolume,
  setMasterMuted,
  setGlobalControl,
  showAiMenu,
  setShowAiMenu,
  setShowReshapeModal,
  setShowFrameModal,
  setShowPortraitBlurModal,
  handleUpscale,
  isStickerLoading,
  onCreateSticker,
  handleContext,
}) => {
  const selectedIds = useStore((state) => state.selectedIds);
  const setSelectedIds = useStore((state) => state.setSelectedIds);
  const setSelectionMode = useStore((state) => state.setSelectionMode);

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
        backdropFilter: 'blur(16px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '30px',
        padding: '4px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        pointerEvents: showImmersiveUI ? 'auto' : 'none',
        opacity: showImmersiveUI ? 1 : 0,
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
        maxWidth: '96vw',
        overflow: 'visible'
      }}
    >
      {isFocusedImage ? (
        <>
          <button 
            onClick={() => setIsSlideshowActive(!isSlideshowActive)}
            style={{
              background: 'var(--accent, #00ff88)',
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
              boxShadow: '0 0 8px rgba(0, 255, 136, 0.3)'
            }}
            onMouseOver={e => {
              e.currentTarget.style.transform = 'scale(1.08)';
              e.currentTarget.style.boxShadow = '0 0 12px rgba(0, 255, 136, 0.5)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 0 8px rgba(0, 255, 136, 0.3)';
            }}
            title={isSlideshowActive ? "Pause Slideshow" : "Play Slideshow"}
          >
            {isSlideshowActive ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          </button>

          {/* Divider */}
          <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.12)' }} />

          <button 
            onClick={() => setColorAdjustId(focusedVideo.id)}
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

          <button 
            onClick={() => {
              if (focusedVideo.type === 'video') {
                useStore.getState().setTrimCropModalTarget(focusedVideo);
              } else {
                setIsCropping(true);
                setCropBox({ x: 0, y: 0, w: 100, h: 100 });
                setAspectRatio('free');
              }
            }}
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
            title={focusedVideo.type === 'video' ? "Trim, Crop & Pan Studio" : "Crop Image"}
          >
            <Crop size={14} />
          </button>

          {/* Quick Share Button */}
          <button
            onClick={() => {
              const currentFile = (focusedVideo.folderFiles && focusedVideo.currentIdx !== undefined && focusedVideo.folderFiles[focusedVideo.currentIdx])
                ? focusedVideo.folderFiles[focusedVideo.currentIdx]
                : null;
              const target = currentFile ? {
                ...focusedVideo,
                realPath: currentFile.path || currentFile.url,
                url: currentFile.url || currentFile.path,
                title: currentFile.name || focusedVideo.title
              } : focusedVideo;
              useStore.getState().setWhatsAppShareTarget(target);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent, #00ff88)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '50%',
              transition: 'background 0.2s, transform 0.1s'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(0, 255, 136, 0.15)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Share"
          >
            <Share2 size={14} />
          </button>

          {/* Single Consolidated AI Studio Button & Popover Menu */}
          <SoloAiMenu
            focusedVideo={focusedVideo}
            showAiMenu={showAiMenu}
            setShowAiMenu={setShowAiMenu}
            setShowReshapeModal={setShowReshapeModal}
            setShowFrameModal={setShowFrameModal}
            setShowPortraitBlurModal={setShowPortraitBlurModal}
            handleUpscale={handleUpscale}
            isStickerLoading={isStickerLoading}
            onCreateSticker={onCreateSticker}
          />

          <button 
            onClick={() => focusedVideo && handleResize && handleResize(focusedVideo)}
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
            title="Rescale / Resize Media"
          >
            <Minimize2 size={14} />
          </button>
        </>
      ) : (
        <>
          <button 
            onClick={(e) => e.preventDefault()}
            onMouseDown={(e) => {
              if (e.button === 0) startFrameStep('stepback', focusedVideo.id);
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              startFrameStep('stepback', focusedVideo.id);
            }}
            onMouseUp={stopFrameStep}
            onMouseLeave={stopFrameStep}
            onTouchEnd={stopFrameStep}
            onTouchCancel={stopFrameStep}
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

          <button 
            onClick={() => {
              onUpdateVideo(focusedVideo.id, { playing: !focusedVideo.playing });
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
            title={focusedVideo.playing ? "Pause" : "Play"}
          >
            {focusedVideo.playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          </button>

          <button 
            onClick={(e) => e.preventDefault()}
            onMouseDown={(e) => {
              if (e.button === 0) startFrameStep('stepforward', focusedVideo.id);
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              startFrameStep('stepforward', focusedVideo.id);
            }}
            onMouseUp={stopFrameStep}
            onMouseLeave={stopFrameStep}
            onTouchEnd={stopFrameStep}
            onTouchCancel={stopFrameStep}
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

          {/* Divider */}
          <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.12)' }} />

          {/* Repeat Loop Toggles */}
          <button 
            onClick={() => {
              const nextMode = focusedVideo.repeatMode === 'always' ? 'none' : 'always';
              useStore.getState().setGlobalRepeat(nextMode);
              setVideos(prev => prev.map(v => ({ ...v, repeatMode: nextMode })));
              addLog(`Repeat One: ${nextMode === 'always' ? 'Enabled Globals' : 'Disabled Globals'}`);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: focusedVideo.repeatMode === 'always' ? 'var(--accent, #00ff88)' : '#fff',
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

          <button 
            onClick={() => {
              const nextMode = focusedVideo.repeatMode === 'folder' ? 'none' : 'folder';
              useStore.getState().setGlobalRepeat(nextMode);
              setVideos(prev => prev.map(v => ({ ...v, repeatMode: nextMode })));
              addLog(`Repeat All: ${nextMode === 'folder' ? 'Enabled Globals' : 'Disabled Globals'}`);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: focusedVideo.repeatMode === 'folder' ? 'var(--accent, #00ff88)' : '#fff',
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

          <div 
            ref={soloVolumeContainerRef}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <button 
              onClick={() => {
                toggleMasterMute(focusedVideo.id);
              }}
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
              title={masterMuted ? "Unmute" : "Mute"}
            >
              {masterMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input 
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterMuted ? 0 : globalVolume}
              onChange={(e) => {
                setGlobalVolume(parseFloat(e.target.value));
                if (masterMuted) {
                  setMasterMuted(false);
                }
                if (focusedVideo.muted) {
                  onUpdateVideo(focusedVideo.id, { muted: false });
                }
              }}
              style={{
                width: '50px',
                height: '3px',
                borderRadius: '2px',
                background: `linear-gradient(to right, #ffffff ${(masterMuted ? 0 : globalVolume) * 100}%, rgba(255, 255, 255, 0.2) ${(masterMuted ? 0 : globalVolume) * 100}%)`,
                outline: 'none',
                cursor: 'pointer',
                WebkitAppearance: 'none',
                transition: 'all 0.2s'
              }}
              title={`Volume: ${Math.round((masterMuted ? 0 : globalVolume) * 100)}% - Scroll to adjust`}
            />
          </div>

          <button 
            onClick={(e) => {
              e.stopPropagation();
              setGlobalControl(`snapshot-${focusedVideo.id}-${Date.now()}`);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'scale(1.08)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Save Snapshot"
          >
            <Camera size={15} />
          </button>

          <button 
            onClick={async (e) => {
              e.stopPropagation();
              const path = focusedVideo.realPath || focusedVideo.url;
              await triggerPopOut(path, focusedVideo.title);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'scale(1.08)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Pop Out Player"
          >
            <ExternalLink size={15} />
          </button>

          <button 
            onClick={() => {
              useStore.getState().setTrimCropModalTarget(focusedVideo);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              color: 'var(--accent, #00ff88)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(0, 255, 136, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.3)';
              e.currentTarget.style.transform = 'scale(1.08)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Trim, Crop & Pan Studio"
          >
            <Scissors size={15} />
          </button>

          <SoloAiMenu
            focusedVideo={focusedVideo}
            showAiMenu={showAiMenu}
            setShowAiMenu={setShowAiMenu}
            setShowReshapeModal={setShowReshapeModal}
            setShowFrameModal={setShowFrameModal}
            setShowPortraitBlurModal={setShowPortraitBlurModal}
            handleUpscale={handleUpscale}
            isStickerLoading={isStickerLoading}
            onCreateSticker={onCreateSticker}
          />
        </>
      )}

      {/* Divider */}
      <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.12)' }} />

      {/* Select Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(focusedVideo.id)) {
              next.delete(focusedVideo.id);
            } else {
              next.add(focusedVideo.id);
            }
            setSelectionMode(next.size > 0);
            return next;
          });
        }}
        style={{
          background: selectedIds.has(focusedVideo.id) ? '#ffffff' : 'none',
          border: selectedIds.has(focusedVideo.id) ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.2)',
          color: selectedIds.has(focusedVideo.id) ? '#000000' : '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '10px',
          fontWeight: 'bold',
          gap: '4px',
          transition: 'all 0.2s',
          pointerEvents: 'auto'
        }}
        onMouseOver={e => {
          if (!selectedIds.has(focusedVideo.id)) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
          } else {
            e.currentTarget.style.background = '#e6e6e6';
          }
        }}
        onMouseOut={e => {
          if (!selectedIds.has(focusedVideo.id)) {
            e.currentTarget.style.background = 'none';
          } else {
            e.currentTarget.style.background = '#ffffff';
          }
        }}
        title={selectedIds.has(focusedVideo.id) ? "Deselect video" : "Select video"}
      >
        <CheckCircle2 size={13} />
        <span>{selectedIds.has(focusedVideo.id) ? 'SELECTED' : 'SELECT'}</span>
      </button>

      {/* Divider */}
      <div style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.12)' }} />

      {/* Actions Menu (⋯) Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleContext(focusedVideo.id, e.clientX, e.clientY);
        }}
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
          transition: 'background 0.2s',
          pointerEvents: 'auto'
        }}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseOut={e => e.currentTarget.style.background = 'none'}
        title="More Actions"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
};
