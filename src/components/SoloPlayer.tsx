import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, Sliders, Crop, Sparkles, ChevronLeft, ChevronRight, VolumeX, Volume2, Camera, FolderOpen, CheckCircle2, MoreHorizontal } from 'lucide-react';
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
  setMasterMuted
}: SoloPlayerProps) {
  const selectedIds = useStore((state) => state.selectedIds);
  const setSelectedIds = useStore((state) => state.setSelectedIds);
  const setSelectionMode = useStore((state) => state.setSelectionMode);

  return (
    <div 
      ref={soloOverlayRef}
      className="solo-mode-overlay" 
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden' }}
    >
      <div className="solo-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <AnimatePresence initial={false} mode="popLayout">
          {videos.find(v => v.id === focusedId) && (
            <motion.div
              key={focusedId}
              initial={{ opacity: 0, x: navDirection * 300, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -navDirection * 300, scale: 0.98 }}
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
                video={videos.find(v => v.id === focusedId)!}
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
              padding: '6px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
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
              <ChevronLeft size={20} />
            </button>

            {isFocusedImage ? (
              <>
                <button 
                  onClick={() => setIsSlideshowActive(!isSlideshowActive)}
                  style={{
                    background: 'var(--accent, #00ff88)',
                    border: 'none',
                    color: '#000',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(0, 255, 136, 0.3)'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.transform = 'scale(1.08)';
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 255, 136, 0.5)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 136, 0.3)';
                  }}
                  title={isSlideshowActive ? "Pause Slideshow" : "Play Slideshow"}
                >
                  {isSlideshowActive ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>

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
                  title="Color adjustment"
                >
                  <Sliders size={18} />
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
                  title="✨ AI Upscale (4x Enhance)"
                >
                  <Sparkles size={18} />
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
                    padding: '6px',
                    borderRadius: '50%',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}
                  title="Step Back (1 Frame)"
                >
                  <ChevronLeft size={18} />
                </button>

                <button 
                  onClick={() => {
                    onUpdateVideo(focusedVideo.id, { playing: !focusedVideo.playing });
                  }}
                  style={{
                    background: 'var(--accent, #00ff88)',
                    border: 'none',
                    color: '#000',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(0, 255, 136, 0.3)'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.transform = 'scale(1.08)';
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 255, 136, 0.5)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 136, 0.3)';
                  }}
                  title={focusedVideo.playing ? "Pause" : "Play"}
                >
                  {focusedVideo.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
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
                    padding: '6px',
                    borderRadius: '50%',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}
                  title="Step Forward (1 Frame)"
                >
                  <ChevronRight size={18} />
                </button>

                <div 
                  ref={soloVolumeContainerRef}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <button 
                    onClick={() => {
                      const currentlyMuted = masterMuted || focusedVideo.muted;
                      if (currentlyMuted) {
                        if (masterMuted) {
                          toggleMasterMute(focusedVideo.id);
                        }
                        if (focusedVideo.muted) {
                          onUpdateVideo(focusedVideo.id, { muted: false });
                        }
                      } else {
                        toggleMasterMute(focusedVideo.id);
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
                      padding: '6px',
                      borderRadius: '50%',
                      transition: 'background 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseOut={e => e.currentTarget.style.background = 'none'}
                    title={(masterMuted || focusedVideo.muted) ? "Unmute" : "Mute"}
                  >
                    {(masterMuted || focusedVideo.muted) ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <input 
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={(masterMuted || focusedVideo.muted) ? 0 : globalVolume}
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
                      width: '60px',
                      height: '4px',
                      borderRadius: '2px',
                      background: `linear-gradient(to right, var(--accent, #00ff88) ${((masterMuted || focusedVideo.muted) ? 0 : globalVolume) * 100}%, rgba(255, 255, 255, 0.2) ${((masterMuted || focusedVideo.muted) ? 0 : globalVolume) * 100}%)`,
                      outline: 'none',
                      cursor: 'pointer',
                      WebkitAppearance: 'none',
                      transition: 'all 0.2s'
                    }}
                    title={`Volume: ${Math.round(((masterMuted || focusedVideo.muted) ? 0 : globalVolume) * 100)}% - Scroll to adjust`}
                  />
                </div>

                <button 
                  onClick={() => setGlobalControl(`snapshot-${focusedVideo.id}-${Date.now()}`)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent, #00ff88)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px',
                    borderRadius: '50%',
                    transition: 'background 0.2s, transform 0.1s'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'rgba(0,255,136,0.08)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  title="Save Snapshot"
                >
                  <Camera size={18} />
                </button>

                <button 
                  onClick={() => {
                    if (snapshotDir && snapshotDir.trim() !== '') {
                      invoke('open_folder', { path: snapshotDir });
                    } else {
                      invoke('open_folder', { path: 'default_snapshots' });
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent, #00ff88)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px',
                    borderRadius: '50%',
                    transition: 'background 0.2s, transform 0.1s'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'rgba(0,255,136,0.08)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  title="Open Snapshots Folder"
                >
                  <FolderOpen size={18} />
                </button>
              </>
            )}

            {/* Divider */}
            <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.12)' }} />

            {/* Next Sibling Button */}
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
              <ChevronRight size={20} />
            </button>

            {/* Divider */}
            <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.12)' }} />

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
                background: selectedIds.has(focusedVideo.id) ? 'rgba(0, 255, 136, 0.15)' : 'none',
                border: selectedIds.has(focusedVideo.id) ? '1px solid rgba(0, 255, 136, 0.4)' : 'none',
                color: selectedIds.has(focusedVideo.id) ? 'var(--accent, #00ff88)' : '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 'bold',
                gap: '6px',
                transition: 'all 0.2s',
                pointerEvents: 'auto'
              }}
              onMouseOver={e => {
                if (!selectedIds.has(focusedVideo.id)) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                } else {
                  e.currentTarget.style.background = 'rgba(0, 255, 136, 0.25)';
                }
              }}
              onMouseOut={e => {
                if (!selectedIds.has(focusedVideo.id)) {
                  e.currentTarget.style.background = 'none';
                } else {
                  e.currentTarget.style.background = 'rgba(0, 255, 136, 0.15)';
                }
              }}
              title={selectedIds.has(focusedVideo.id) ? "Deselect video" : "Select video"}
            >
              <CheckCircle2 size={16} />
              <span>{selectedIds.has(focusedVideo.id) ? 'SELECTED' : 'SELECT'}</span>
            </button>

            {/* Divider */}
            <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.12)' }} />

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
                padding: '6px',
                borderRadius: '50%',
                transition: 'background 0.2s',
                pointerEvents: 'auto'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              onMouseOut={e => e.currentTarget.style.background = 'none'}
              title="More Actions"
            >
              <MoreHorizontal size={18} />
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
