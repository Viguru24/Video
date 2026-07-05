import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, Sliders, Crop, Minimize2, Sparkles, ChevronLeft, ChevronRight, VolumeX, Volume2, Camera, FolderOpen, CheckCircle2, MoreHorizontal, Repeat, Repeat1 } from 'lucide-react';
import { VideoCard } from './VideoCard';
import { CropOverlay } from './CropOverlay';
import type { VideoItem, RepeatMode } from '../types';
import { useStore } from '../store/useStore';

interface SoloPlayerProps {
  focusedId: string;
  setFocusedId: (id: string | null) => void;
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  globalRepeat: RepeatMode;
  speed: number;
  fitMode: 'contain' | 'cover' | 'fill';
  handleDecommission: (id: string) => void;
  handleAnnihilate: (id: string) => void;
  addLog: (msg: string) => void;
  handleSelectAll: () => void;
  snapshotDir: string;
  setSnapshotDir: (dir: string) => void;
  globalControl: string | null;
  masterPlaying: boolean;
  masterMuted: boolean;
  globalVolume: number;
  setGlobalVolume: (vol: number) => void;
  masterShowUI: boolean;
  handleVideoEnded: (id: string) => void;
  toggleMasterMute: (soloId?: string) => void;
  toggleMasterPlay: () => void;
  handleContext: (id: string, x: number, y: number) => void;
  handleDeepFocus: (id: string, time?: number) => void;
  handleNavigateSibling: (direction: 1 | -1) => void;
  handleUpscale: (v: VideoItem) => void;
  handleResize?: (v: VideoItem) => void;
  enhancingVideoId: string | null;
  isCropping: boolean;
  setIsCropping: (val: boolean) => void;
  cropBox: { x: number; y: number; w: number; h: number };
  setCropBox: React.Dispatch<React.SetStateAction<{ x: number; y: number; w: number; h: number }>>;
  aspectRatio: 'free' | '1:1' | '16:9' | '4:3';
  setAspectRatio: (val: 'free' | '1:1' | '16:9' | '4:3') => void;
  onAddVideo: (path: string) => void;
  soloOverlayRef: React.RefObject<HTMLDivElement | null>;
  soloVolumeContainerRef: React.RefObject<HTMLDivElement | null>;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (val: boolean) => void;
  setColorAdjustId: (id: string | null) => void;
  setGlobalControl: (val: string | null) => void;
  showImmersiveUI: boolean;
  isFocusedImage: boolean;
  focusedVideo: VideoItem | null;
  navDirection: 1 | -1;
  startFrameStep: (action: 'stepback' | 'stepforward', videoId: string) => void;
  stopFrameStep: () => void;
  setShowSaveCropOptions: (val: boolean) => void;
  setMasterMuted: (val: boolean) => void;
  isStickerLoading?: boolean;
  onCreateSticker?: (video: VideoItem) => void;
}

export function SoloPlayer({
  focusedId,
  setFocusedId,
  videos,
  setVideos,
  onUpdateVideo,
  globalRepeat,
  speed,
  fitMode,
  handleDecommission,
  handleAnnihilate,
  addLog,
  handleSelectAll,
  snapshotDir,
  setSnapshotDir,
  globalControl,
  masterPlaying,
  masterMuted,
  globalVolume,
  setGlobalVolume,
  masterShowUI,
  handleVideoEnded,
  toggleMasterMute,
  toggleMasterPlay,
  handleContext,
  handleDeepFocus,
  handleNavigateSibling,
  handleUpscale,
  handleResize,
  enhancingVideoId,
  isCropping,
  setIsCropping,
  cropBox,
  setCropBox,
  aspectRatio,
  setAspectRatio,
  onAddVideo,
  soloOverlayRef,
  soloVolumeContainerRef,
  isSlideshowActive,
  setIsSlideshowActive,
  setColorAdjustId,
  setGlobalControl,
  showImmersiveUI,
  isFocusedImage,
  focusedVideo,
  navDirection,
  startFrameStep,
  stopFrameStep,
  setShowSaveCropOptions,
  setMasterMuted,
  isStickerLoading = false,
  onCreateSticker
}: SoloPlayerProps) {
  const selectedIds = useStore((state) => state.selectedIds);
  const setSelectedIds = useStore((state) => state.setSelectedIds);
  const setSelectionMode = useStore((state) => state.setSelectionMode);

  const lastFocusedIdRef = useRef<string | null>(null);
  const isEntering = lastFocusedIdRef.current === null;

  useEffect(() => {
    lastFocusedIdRef.current = focusedId;
  }, [focusedId]);

  const currentFocusedVideo = videos.find(v => v.id === focusedId);

  return (
    <div 
      ref={soloOverlayRef}
      className="solo-mode-overlay" 
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden' }}
    >
      <div className="solo-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <AnimatePresence mode="popLayout">
          {currentFocusedVideo && (
            <motion.div
              key={focusedId}
              initial={isEntering ? { opacity: 0 } : { opacity: 0, x: navDirection * 300, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={isEntering ? { opacity: 0 } : { opacity: 0, x: -navDirection * 300, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#000'
              }}
            >
              <VideoCard 
                video={currentFocusedVideo}
                globalRepeat={globalRepeat}
                globalSpeed={speed}
                fitMode={fitMode}
                onUpdateVideo={onUpdateVideo}
                onRemove={handleDecommission}
                onAnnihilate={handleAnnihilate}
                onLog={addLog}
                onFocus={() => {}}
                isFocused={true}
                onSelectAll={handleSelectAll}
                focusedId={focusedId}
                inSoloMode={true}
                onCloseFocus={() => setFocusedId(null)}
                snapshotDir={snapshotDir}
                setSnapshotDir={setSnapshotDir}
                globalControl={globalControl}
                masterPlaying={masterPlaying}
                masterMuted={masterMuted}
                globalVolume={globalVolume}
                masterShowUI={masterShowUI}
                onEnded={() => handleVideoEnded(focusedId)}
                toggleMasterMute={toggleMasterMute}
                toggleMasterPlay={toggleMasterPlay}
                onContextMenu={(x: number, y: number) => handleContext(focusedId, x, y)}
                onDeepFocus={(time?: number) => handleDeepFocus(focusedId, time)}
                isVisible={true}
                onNavigateSibling={handleNavigateSibling}
                onUpscale={handleUpscale}
                isAiEnhancing={enhancingVideoId === focusedId}
                isCropping={isCropping}
                onAddVideo={onAddVideo}
                isStickerLoading={isStickerLoading}
                onCreateSticker={onCreateSticker}
                isSlideshowActive={isSlideshowActive}
                setIsSlideshowActive={setIsSlideshowActive}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Glassmorphic Solo Control Bar */}
        {focusedVideo && !isCropping && (
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
              userSelect: 'none'
            }}
          >
            {/* Previous Sibling Button */}
            <button 
              onClick={() => handleNavigateSibling(-1)}
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
              title="Previous Media"
            >
              <ChevronLeft size={14} />
            </button>

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

                {/* Next Sibling Button (for images) */}
                <button 
                  onClick={() => handleNavigateSibling(1)}
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
                  title="Next Media"
                >
                  <ChevronRight size={14} />
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
                  title="Crop Image"
                >
                  <Crop size={14} />
                </button>

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

                <button 
                  onClick={() => handleUpscale(focusedVideo)}
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
                  title="✨ AI Upscale (4x Enhance)"
                >
                  <Sparkles size={14} />
                </button>

                <button 
                  onClick={() => onCreateSticker && onCreateSticker(focusedVideo)}
                  disabled={isStickerLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isStickerLoading ? '#555' : 'var(--accent, #00ff88)',
                    cursor: isStickerLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    borderRadius: '50%',
                    transition: 'background 0.2s, transform 0.1s',
                    opacity: isStickerLoading ? 0.5 : 1
                  }}
                  onMouseOver={e => {
                    if (!isStickerLoading) {
                      e.currentTarget.style.background = 'rgba(0, 255, 136, 0.1)';
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  title="Create Sticker (Cutout)"
                >
                  <Sparkles size={14} style={{ color: isStickerLoading ? '#555' : 'var(--accent, #00ff88)' }} />
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

                {/* Next Sibling Button (for videos) */}
                <button 
                  onClick={() => handleNavigateSibling(1)}
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
                  title="Next Media"
                >
                  <ChevronRight size={14} />
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
                      background: `linear-gradient(to right, var(--accent, #00ff88) ${(masterMuted ? 0 : globalVolume) * 100}%, rgba(255, 255, 255, 0.2) ${(masterMuted ? 0 : globalVolume) * 100}%)`,
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
                    e.currentTarget.style.background = 'rgba(0, 255, 136, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.2)';
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
                background: selectedIds.has(focusedVideo.id) ? 'var(--accent, #00ff88)' : 'none',
                border: selectedIds.has(focusedVideo.id) ? '1px solid var(--accent, #00ff88)' : '1px solid rgba(255, 255, 255, 0.2)',
                color: selectedIds.has(focusedVideo.id) ? '#000' : '#fff',
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
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                } else {
                  e.currentTarget.style.background = 'var(--accent-hover, #00dd77)';
                }
              }}
              onMouseOut={e => {
                if (!selectedIds.has(focusedVideo.id)) {
                  e.currentTarget.style.background = 'none';
                } else {
                  e.currentTarget.style.background = 'var(--accent, #00ff88)';
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
        )}

        {isCropping && focusedVideo && (
          <CropOverlay 
            video={focusedVideo}
            cropBox={cropBox}
            setCropBox={setCropBox}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            onSave={() => setShowSaveCropOptions(true)}
            onCancel={() => setIsCropping(false)}
          />
        )}
      </div>
    </div>
  );
}
