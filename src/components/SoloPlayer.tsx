import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, ArrowLeft } from 'lucide-react';
import { VideoCard } from './VideoCard';
import { CropOverlay } from './CropOverlay';
import { ReshapeStudioModal } from './ReshapeStudioModal';
import { FrameStudioModal } from './FrameStudioModal';
import { PortraitBlurStudioModal } from './PortraitBlurStudioModal';
import type { VideoItem, RepeatMode } from '../types';
import { useStore } from '../store/useStore';
import { triggerPopOut } from '../utils/videoUtils';
import { SoloControlBar } from './solo/SoloControlBar';

interface SoloPlayerProps {
  focusedId: string;
  setFocusedId: (id: string | null) => void;
  onExit: () => void;
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
  onExit,
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

  // Automatically close AI menu when clicking anywhere outside
  useEffect(() => {
    if (!showAiMenu) return;
    const handleClickOutside = () => {
      setShowAiMenu(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [showAiMenu]);



  return (
    <div 
      ref={soloOverlayRef}
      className="solo-mode-overlay" 
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden' }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (focusedId) {
          handleContext(focusedId, e.clientX, e.clientY);
        }
      }}
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
                onCloseFocus={() => onExit()}
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

        {/* Top-Left Back / Close Button (Mobile & Desktop) */}
        <button
          onClick={() => onExit()}
          className="solo-back-button"
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 100001,
            background: 'rgba(10, 10, 14, 0.85)',
            backdropFilter: 'blur(16px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            borderRadius: '24px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: showImmersiveUI ? 1 : 0,
            pointerEvents: showImmersiveUI ? 'auto' : 'none',
            userSelect: 'none'
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)';
            e.currentTarget.style.transform = 'scale(1.04)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(10, 10, 14, 0.85)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Back to Gallery (Esc)"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        {/* Top-Right Pop-up Window / Pop Out Player Button (Always Accessible on Mobile) */}
        {focusedVideo && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const path = focusedVideo.realPath || focusedVideo.url;
              await triggerPopOut(path, focusedVideo.title);
            }}
            className="solo-popout-button"
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              zIndex: 100001,
              background: 'rgba(10, 10, 14, 0.85)',
              backdropFilter: 'blur(16px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              borderRadius: '24px',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: showImmersiveUI ? 1 : 0,
              pointerEvents: showImmersiveUI ? 'auto' : 'none',
              userSelect: 'none'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)';
              e.currentTarget.style.transform = 'scale(1.04)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(10, 10, 14, 0.85)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Pop Out Window"
          >
            <ExternalLink size={15} />
            <span style={{ fontSize: '12px' }}>Pop Out</span>
          </button>
        )}

        {focusedVideo && !isEditingOrModalOpen && (
          <SoloControlBar
            focusedVideo={focusedVideo}
            isFocusedImage={isFocusedImage}
            showImmersiveUI={showImmersiveUI}
            isSlideshowActive={isSlideshowActive}
            setIsSlideshowActive={setIsSlideshowActive}
            setColorAdjustId={setColorAdjustId}
            setIsCropping={setIsCropping}
            setCropBox={setCropBox}
            setAspectRatio={setAspectRatio}
            handleResize={handleResize}
            startFrameStep={startFrameStep}
            stopFrameStep={stopFrameStep}
            onUpdateVideo={onUpdateVideo}
            setVideos={setVideos}
            addLog={addLog}
            soloVolumeContainerRef={soloVolumeContainerRef}
            toggleMasterMute={toggleMasterMute}
            masterMuted={masterMuted}
            globalVolume={globalVolume}
            setGlobalVolume={setGlobalVolume}
            setMasterMuted={setMasterMuted}
            setGlobalControl={setGlobalControl}
            showAiMenu={showAiMenu}
            setShowAiMenu={setShowAiMenu}
            setShowReshapeModal={setShowReshapeModal}
            setShowFrameModal={setShowFrameModal}
            setShowPortraitBlurModal={setShowPortraitBlurModal}
            handleUpscale={handleUpscale}
            isStickerLoading={isStickerLoading}
            onCreateSticker={onCreateSticker}
            handleContext={handleContext}
          />
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
