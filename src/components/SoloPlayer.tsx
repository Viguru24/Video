import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, Sliders, Crop, Minimize2, Sparkles, ChevronLeft, ChevronRight, VolumeX, Volume2, Camera, FolderOpen, CheckCircle2, MoreHorizontal, Repeat, Repeat1, ExternalLink, Scissors, MessageSquare, Share2 } from 'lucide-react';
import { VideoCard } from './VideoCard';
import { CropOverlay } from './CropOverlay';
import { ReshapeStudioModal } from './ReshapeStudioModal';
import { FrameStudioModal } from './FrameStudioModal';
import { PortraitBlurStudioModal } from './PortraitBlurStudioModal';
import type { VideoItem, RepeatMode } from '../types';
import { useStore } from '../store/useStore';
import { triggerPopOut } from '../utils/videoUtils';

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
  onCancelSticker?: () => void;
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
  onCreateSticker,
  onCancelSticker
}: SoloPlayerProps) {
  const [showReshapeModal, setShowReshapeModal] = React.useState(false);
  const [showFrameModal, setShowFrameModal] = React.useState(false);
  const [showPortraitBlurModal, setShowPortraitBlurModal] = React.useState(false);
  const [showAiMenu, setShowAiMenu] = React.useState(false);
  const selectedIds = useStore((state) => state.selectedIds);
  const setSelectedIds = useStore((state) => state.setSelectedIds);
  const setSelectionMode = useStore((state) => state.setSelectionMode);
  const trimCropModalTarget = useStore((state) => state.trimCropModalTarget);

  const isEditingOrModalOpen = isCropping || !!trimCropModalTarget || showReshapeModal || showFrameModal || showPortraitBlurModal;

  const lastFocusedIdRef = useRef<string | null>(null);
  const isEntering = lastFocusedIdRef.current === null;

  useEffect(() => {
    lastFocusedIdRef.current = focusedId;
  }, [focusedId]);

  const currentFocusedVideo = videos.find(v => v.id === focusedId);

  // Completely close and reset any open manipulation mode, crop box, or studio whenever the focused media changes or scrolls
  const activeMediaKey = `${focusedId}_${currentFocusedVideo?.currentIdx ?? 0}_${currentFocusedVideo?.realPath ?? currentFocusedVideo?.url ?? ''}`;
  useEffect(() => {
    setIsCropping(false);
    setShowSaveCropOptions(false);
    setShowReshapeModal(false);
    setShowFrameModal(false);
    setShowPortraitBlurModal(false);
    setShowAiMenu(false);
    setColorAdjustId(null);
    setGlobalControl(null);
  }, [activeMediaKey, setIsCropping, setShowSaveCropOptions, setColorAdjustId, setGlobalControl]);

  return (
    <div 
      ref={soloOverlayRef}
      className="solo-mode-overlay" 
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden' }}
    >
      <div className="solo-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {currentFocusedVideo && (
            <motion.div
              key={focusedId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
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
                fitMode="contain"
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
                isCropping={isEditingOrModalOpen}
                onAddVideo={onAddVideo}
                isStickerLoading={isStickerLoading}
                onCreateSticker={onCreateSticker}
                onCancelSticker={onCancelSticker}
                isSlideshowActive={isSlideshowActive}
                setIsSlideshowActive={setIsSlideshowActive}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Glassmorphic Solo Control Bar */}
        {focusedVideo && !isEditingOrModalOpen && (
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
                  onClick={() => useStore.getState().setWhatsAppShareTarget(focusedVideo)}
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
                <div style={{ position: 'relative' }}>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAiMenu(!showAiMenu);
                    }}
                    style={{
                      background: showAiMenu ? 'rgba(255, 255, 255, 0.15)' : 'none',
                      border: 'none',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px',
                      borderRadius: '50%',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseOut={e => {
                      if (!showAiMenu) e.currentTarget.style.background = 'none';
                    }}
                    title="✨ AI & Reshape Tools"
                  >
                    <Sparkles size={14} style={{ color: '#fff' }} />
                  </button>

                  {/* Popover Menu for AI & Reshape Tools */}
                  {showAiMenu && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        bottom: '40px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(10, 10, 14, 0.95)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '14px',
                        padding: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)',
                        zIndex: 250000,
                        minWidth: '200px'
                      }}
                    >
                      {focusedVideo.type === 'video' && (
                        <button
                          onClick={() => {
                            setShowAiMenu(false);
                            useStore.getState().setTrimCropModalTarget(focusedVideo);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent, #00ff88)',
                            padding: '5px 10px',
                            borderRadius: '8px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            whiteSpace: 'nowrap'
                          }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.12)'}
                          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span>✂️ Trim, Crop & Pan Studio</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setShowAiMenu(false);
                          useStore.getState().setWhatsAppShareTarget(focusedVideo);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--accent, #00ff88)',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.12)'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Share2 size={12} />
                        <span>🚀 Share...</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowAiMenu(false);
                          setShowReshapeModal(true);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#fff',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span>✨ Reshape & Sculpt Studio</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowAiMenu(false);
                          setShowFrameModal(true);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#fff',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span>🖼️ Photo Frames & Corners</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowAiMenu(false);
                          setShowPortraitBlurModal(true);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#fff',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span>✨ AI Portrait Blur (Bokeh)</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowAiMenu(false);
                          handleUpscale(focusedVideo);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#fff',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span>⚡ AI Upscale (4x Enhance)</span>
                      </button>

                      {onCreateSticker && (
                        <button
                          onClick={() => {
                            setShowAiMenu(false);
                            onCreateSticker(focusedVideo);
                          }}
                          disabled={isStickerLoading}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: isStickerLoading ? '#666' : '#fff',
                            padding: '5px 10px',
                            borderRadius: '8px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: isStickerLoading ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            whiteSpace: 'nowrap'
                          }}
                          onMouseOver={e => {
                            if (!isStickerLoading) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                          }}
                          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span>✂️ Create AI Sticker Cutout</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

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

        {showReshapeModal && focusedVideo && (
          <ReshapeStudioModal
            video={focusedVideo}
            isOpen={showReshapeModal}
            onClose={() => setShowReshapeModal(false)}
            onLog={addLog}
            setVideos={setVideos}
            onFocusMedia={setFocusedId}
            onUpdateVideo={onUpdateVideo}
          />
        )}

        {showFrameModal && focusedVideo && (
          <FrameStudioModal
            video={focusedVideo}
            isOpen={showFrameModal}
            onClose={() => setShowFrameModal(false)}
            onLog={addLog}
            setVideos={setVideos}
            onFocusMedia={setFocusedId}
            onUpdateVideo={onUpdateVideo}
          />
        )}

        {showPortraitBlurModal && focusedVideo && (
          <PortraitBlurStudioModal
            video={focusedVideo}
            isOpen={showPortraitBlurModal}
            onClose={() => setShowPortraitBlurModal(false)}
            onLog={addLog}
            setVideos={setVideos}
            onFocusMedia={setFocusedId}
            onUpdateVideo={onUpdateVideo}
          />
        )}
      </div>
    </div>
  );
}
