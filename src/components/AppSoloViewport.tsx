import React from 'react';
import type { VideoItem, RepeatMode } from '../types';
import type { UseVideoOperationsReturn } from '../hooks/useVideoOperations';
import { SoloPlayer } from './SoloPlayer';

interface AppSoloViewportProps {
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  exitSoloMode: () => Promise<void>;
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  onUpdateVideo: (idOrIds: string | string[], updates: any) => void;
  globalRepeat: RepeatMode;
  speed: number;
  fitMode: any;
  handleDecommission: (idOrIds: string | string[], skipConfirm?: boolean) => Promise<void>;
  handleAnnihilate: (idOrIds: string | string[]) => Promise<void>;
  addLog: (m: string) => void;
  handleSelectAll: () => void;
  snapshotDir: string;
  setSnapshotDir: (dir: string) => void;
  globalControl: string | null;
  masterPlaying: boolean;
  masterMuted: boolean;
  globalVolume: number;
  setGlobalVolume: (vol: number) => void;
  masterShowUI: boolean;
  handleVideoEnded: (endedId: string) => void;
  toggleMasterMute: () => void;
  toggleMasterPlay: () => void;
  handleContext: (id: string, x: number, y: number) => void;
  handleDeepFocus: (id: string, time?: number) => void;
  handleNavigateSibling: (dir: 1 | -1) => void;
  videoOps: UseVideoOperationsReturn;
  onAddVideo: (vid: VideoItem) => void;
  soloOverlayRef: React.RefObject<HTMLDivElement | null>;
  soloVolumeContainerRef: React.RefObject<HTMLDivElement | null>;
  isSlideshowActive: boolean;
  setIsSlideshowActive: React.Dispatch<React.SetStateAction<boolean>>;
  setColorAdjustId: (id: string | null) => void;
  setGlobalControl: (ctrl: string | null) => void;
  showImmersiveUI: boolean;
  isFocusedImage: boolean;
  focusedVideo: VideoItem | null;
  navDirection: 1 | -1;
  startFrameStep: (dir: 1 | -1) => void;
  stopFrameStep: () => void;
  setMasterMuted: (val: boolean) => void;
  stickerLoadingId: string | null;
  handleCreateSticker: (v: VideoItem) => void;
  handleCancelSticker: (id: string) => void;
  cachedAssetUrls: string[];
}

export const AppSoloViewport: React.FC<AppSoloViewportProps> = ({
  focusedId,
  setFocusedId,
  exitSoloMode,
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
  videoOps,
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
  setMasterMuted,
  stickerLoadingId,
  handleCreateSticker,
  handleCancelSticker,
  cachedAssetUrls,
}) => {
  return (
    <>
      {focusedId && (
        <SoloPlayer
          focusedId={focusedId}
          setFocusedId={setFocusedId}
          onExit={exitSoloMode}
          videos={videos}
          setVideos={setVideos}
          onUpdateVideo={onUpdateVideo}
          globalRepeat={globalRepeat}
          speed={speed}
          fitMode={fitMode}
          handleDecommission={handleDecommission}
          handleAnnihilate={handleAnnihilate}
          addLog={addLog}
          handleSelectAll={handleSelectAll}
          snapshotDir={snapshotDir}
          setSnapshotDir={setSnapshotDir}
          globalControl={globalControl}
          masterPlaying={masterPlaying}
          masterMuted={masterMuted}
          globalVolume={globalVolume}
          setGlobalVolume={setGlobalVolume}
          masterShowUI={masterShowUI}
          handleVideoEnded={handleVideoEnded}
          toggleMasterMute={toggleMasterMute}
          toggleMasterPlay={toggleMasterPlay}
          handleContext={handleContext}
          handleDeepFocus={handleDeepFocus}
          handleNavigateSibling={handleNavigateSibling}
          handleUpscale={videoOps.handleUpscale}
          handleResize={videoOps.handleResize}
          enhancingVideoId={videoOps.enhancingVideoId}
          isCropping={videoOps.isCropping}
          setIsCropping={videoOps.setIsCropping}
          cropBox={videoOps.cropBox}
          setCropBox={videoOps.setCropBox}
          aspectRatio={videoOps.aspectRatio}
          setAspectRatio={videoOps.setAspectRatio}
          onAddVideo={onAddVideo}
          soloOverlayRef={soloOverlayRef}
          soloVolumeContainerRef={soloVolumeContainerRef}
          isSlideshowActive={isSlideshowActive}
          setIsSlideshowActive={setIsSlideshowActive}
          setColorAdjustId={setColorAdjustId}
          setGlobalControl={setGlobalControl}
          showImmersiveUI={showImmersiveUI}
          isFocusedImage={isFocusedImage}
          focusedVideo={focusedVideo}
          navDirection={navDirection}
          startFrameStep={startFrameStep}
          stopFrameStep={stopFrameStep}
          setShowSaveCropOptions={videoOps.setShowSaveCropOptions}
          setMasterMuted={setMasterMuted}
          isStickerLoading={stickerLoadingId === focusedId}
          onCreateSticker={handleCreateSticker}
          onCancelSticker={handleCancelSticker}
        />
      )}

      {/* Hidden Image Memory Pre-Cache Engine */}
      <div
        className="hidden-precache-engine"
        style={{ display: 'none', width: 0, height: 0, visibility: 'hidden' }}
        aria-hidden="true"
      >
        {cachedAssetUrls.map((url) => (
          <img key={url} src={url} alt="pre-cache" />
        ))}
      </div>
    </>
  );
};
