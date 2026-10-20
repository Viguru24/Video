import React from 'react';
import { SoloPlayer } from './SoloPlayer';
import type { VideoItem, RepeatMode, FitMode } from '../types';

interface SoloPlayerWrapperProps {
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  exitSoloMode: () => void;
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  globalRepeat: RepeatMode;
  speed: number;
  fitMode: FitMode;
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
  setGlobalVolume: React.Dispatch<React.SetStateAction<number>>;
  masterShowUI: boolean;
  handleVideoEnded: (v: VideoItem) => void;
  toggleMasterMute: () => void;
  toggleMasterPlay: () => void;
  handleContext: (id: string, x: number, y: number) => void;
  handleDeepFocus: (id: string, time?: number) => void;
  handleNavigateSibling: (dir: 1 | -1) => void;
  onAddVideo: (files: File[]) => void;
  soloOverlayRef: React.RefObject<HTMLDivElement | null>;
  soloVolumeContainerRef: React.RefObject<HTMLDivElement | null>;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (active: boolean) => void;
  setColorAdjustId: (id: string | null) => void;
  setGlobalControl: (ctl: string | null) => void;
  showImmersiveUI: boolean;
  isFocusedImage: boolean;
  focusedVideo: VideoItem | null;
  navDirection: 1 | -1;
  startFrameStep: (action: 'stepback' | 'stepforward', id: string) => void;
  stopFrameStep: () => void;
  setMasterMuted: (muted: boolean) => void;
  isStickerLoading: boolean;
  onCreateSticker: (v: VideoItem) => void;
  onCancelSticker: () => void;
  videoOps: any;
}

export function SoloPlayerWrapper(props: SoloPlayerWrapperProps) {
  if (!props.focusedId) return null;

  return (
    <SoloPlayer
      focusedId={props.focusedId}
      setFocusedId={props.setFocusedId}
      onExit={props.exitSoloMode}
      videos={props.videos}
      setVideos={props.setVideos}
      onUpdateVideo={props.onUpdateVideo}
      globalRepeat={props.globalRepeat}
      speed={props.speed}
      fitMode={props.fitMode}
      handleDecommission={props.handleDecommission}
      handleAnnihilate={props.handleAnnihilate}
      addLog={props.addLog}
      handleSelectAll={props.handleSelectAll}
      snapshotDir={props.snapshotDir}
      setSnapshotDir={props.setSnapshotDir}
      globalControl={props.globalControl}
      masterPlaying={props.masterPlaying}
      masterMuted={props.masterMuted}
      globalVolume={props.globalVolume}
      setGlobalVolume={props.setGlobalVolume}
      masterShowUI={props.masterShowUI}
      handleVideoEnded={props.handleVideoEnded}
      toggleMasterMute={props.toggleMasterMute}
      toggleMasterPlay={props.toggleMasterPlay}
      handleContext={props.handleContext}
      handleDeepFocus={props.handleDeepFocus}
      handleNavigateSibling={props.handleNavigateSibling}
      handleUpscale={props.videoOps.handleUpscale}
      handleResize={props.videoOps.handleResize}
      enhancingVideoId={props.videoOps.enhancingVideoId}
      isCropping={props.videoOps.isCropping}
      setIsCropping={props.videoOps.setIsCropping}
      cropBox={props.videoOps.cropBox}
      setCropBox={props.videoOps.setCropBox}
      aspectRatio={props.videoOps.aspectRatio}
      setAspectRatio={props.videoOps.setAspectRatio}
      onAddVideo={props.onAddVideo}
      soloOverlayRef={props.soloOverlayRef}
      soloVolumeContainerRef={props.soloVolumeContainerRef}
      isSlideshowActive={props.isSlideshowActive}
      setIsSlideshowActive={props.setIsSlideshowActive}
      setColorAdjustId={props.setColorAdjustId}
      setGlobalControl={props.setGlobalControl}
      showImmersiveUI={props.showImmersiveUI}
      isFocusedImage={props.isFocusedImage}
      focusedVideo={props.focusedVideo}
      navDirection={props.navDirection}
      startFrameStep={props.startFrameStep}
      stopFrameStep={props.stopFrameStep}
      setShowSaveCropOptions={props.videoOps.setShowSaveCropOptions}
      setMasterMuted={props.setMasterMuted}
      isStickerLoading={props.isStickerLoading}
      onCreateSticker={props.onCreateSticker}
      onCancelSticker={props.onCancelSticker}
    />
  );
}
