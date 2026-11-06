import React from 'react';
import { ModalOrchestrator } from './modals/ModalOrchestrator';
import type { VideoItem, RepeatMode } from '../types';
import type { UseVideoOperationsReturn } from '../hooks/useVideoOperations';
import type { UseCustomDialogsReturn } from '../hooks/useCustomDialogs';
import type { UseWifiTransferReturn } from '../hooks/useWifiTransfer';

interface AppModalsProps {
  showHelp: boolean;
  setShowHelp: (val: boolean) => void;
  fileManageOpen: boolean;
  setFileManageOpen: (val: boolean) => void;
  fileManageItems: VideoItem[];
  fileManageMode: 'move' | 'copy';
  activeGridFolders: string[];
  handleFileManagementSuccess: () => void;
  addLog: (m: string) => void;
  singleRenameTarget: VideoItem | null;
  setSingleRenameTarget: (target: VideoItem | null) => void;
  renameHistory: string[];
  addToRenameHistory: (path: string) => void;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  videoOps: UseVideoOperationsReturn;
  customDialogs: UseCustomDialogsReturn;
  wifiTransfer: UseWifiTransferReturn;
  handleIngestPaths: (paths: string[]) => Promise<void>;
  globalVolume: number;
  setGlobalVolume: (vol: number) => void;
  masterMuted: boolean;
  toggleMasterMute: () => void;
  globalRepeat: RepeatMode;
  setGlobalRepeat: (mode: RepeatMode) => void;
  videos: VideoItem[];
  handleUpdate: (idOrIds: string | string[], updates: any) => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  showHelp,
  setShowHelp,
  fileManageOpen,
  setFileManageOpen,
  fileManageItems,
  fileManageMode,
  activeGridFolders,
  handleFileManagementSuccess,
  addLog,
  singleRenameTarget,
  setSingleRenameTarget,
  renameHistory,
  addToRenameHistory,
  setVideos,
  videoOps,
  customDialogs,
  wifiTransfer,
  handleIngestPaths,
  globalVolume,
  setGlobalVolume,
  masterMuted,
  toggleMasterMute,
  globalRepeat,
  setGlobalRepeat,
  videos,
  handleUpdate,
}) => {
  return (
    <ModalOrchestrator
      showHelp={showHelp}
      setShowHelp={setShowHelp}
      fileManageOpen={fileManageOpen}
      setFileManageOpen={setFileManageOpen}
      fileManageItems={fileManageItems}
      fileManageMode={fileManageMode}
      activeGridFolders={activeGridFolders}
      handleFileManagementSuccess={handleFileManagementSuccess}
      addLog={addLog}
      singleRenameTarget={singleRenameTarget}
      setSingleRenameTarget={setSingleRenameTarget}
      renameHistory={renameHistory}
      addToRenameHistory={addToRenameHistory}
      setVideos={setVideos}
      showSaveCropOptions={videoOps.showSaveCropOptions}
      setShowSaveCropOptions={videoOps.setShowSaveCropOptions}
      handleSaveCrop={videoOps.handleSaveCrop}
      showSaveUpscaleOptions={videoOps.showSaveUpscaleOptions}
      setShowSaveUpscaleOptions={videoOps.setShowSaveUpscaleOptions}
      upscaleTarget={videoOps.upscaleTarget}
      setUpscaleTarget={videoOps.setUpscaleTarget}
      executeUpscale={videoOps.executeUpscale}
      showResizeModal={videoOps.showResizeModal}
      setShowResizeModal={videoOps.setShowResizeModal}
      resizeTarget={videoOps.resizeTarget}
      setResizeTarget={videoOps.setResizeTarget}
      handleResizeSuccess={videoOps.handleResizeSuccess}
      upscaleStatus={videoOps.upscaleStatus}
      setUpscaleStatus={videoOps.setUpscaleStatus}
      upscaleProgressPercent={videoOps.upscaleProgressPercent}
      upscaleStage={videoOps.upscaleStage}
      lastEnhancedTitle={videoOps.lastEnhancedTitle}
      cancelEnhancement={videoOps.cancelEnhancement}
      aiServerOffline={videoOps.aiServerOffline}
      setAiServerOffline={videoOps.setAiServerOffline}
      customConfirm={customDialogs.customConfirm}
      setCustomConfirm={customDialogs.setCustomConfirm}
      customPrompt={customDialogs.customPrompt}
      setCustomPrompt={customDialogs.setCustomPrompt}
      wifiShareOpen={wifiTransfer.wifiShareOpen}
      setWifiShareOpen={wifiTransfer.setWifiShareOpen}
      wifiShareItems={wifiTransfer.wifiShareItems}
      setWifiShareItems={wifiTransfer.setWifiShareItems}
      onClearSharedFiles={() => wifiTransfer.setWifiShareItems([])}
      handleIngestPaths={handleIngestPaths}
      volumeRepeatOpen={wifiTransfer.volumeRepeatOpen}
      setVolumeRepeatOpen={wifiTransfer.setVolumeRepeatOpen}
      globalVolume={globalVolume}
      setGlobalVolume={setGlobalVolume}
      masterMuted={masterMuted}
      toggleMasterMute={toggleMasterMute}
      globalRepeat={globalRepeat}
      setGlobalRepeat={setGlobalRepeat}
      videos={videos}
      handleUpdate={handleUpdate}
    />
  );
};
