import React from 'react';
import { useStore } from '../store/useStore';
import type { VideoItem, RepeatMode } from '../types';
import { MusicPlayerWidget } from './MusicPlayerWidget';
import { CommandPalette } from './CommandPalette';
import { ModalOrchestrator } from './modals/ModalOrchestrator';

interface AppModalsContainerProps {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  selectedIds: Set<string>;
  focusedId: string | null;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  handleTriggerWifiShare: () => void;
  setColorAdjustId: (id: string | null) => void;
  togglePopout: (id: string) => void;
  handlePurgeWorkspace: () => void;
  setShowHelp: (show: boolean) => void;
  showHelp: boolean;
  activeGridFolders: string[];
  handleFileManagementSuccess: (items: any) => void;
  addLog: (msg: string) => void;
  singleRenameTarget: VideoItem | null;
  setSingleRenameTarget: (v: VideoItem | null) => void;
  renameHistory: string[];
  addToRenameHistory: (name: string) => void;
  handleIngestPaths: (paths: string[]) => Promise<void>;
  globalVolume: number;
  setGlobalVolume: React.Dispatch<React.SetStateAction<number>>;
  masterMuted: boolean;
  toggleMasterMute: () => void;
  handleUpdate: (idOrIds: string | string[], updates: any) => void;
  modalState: any;
  videoOps: any;
}

export function AppModalsContainer({
  videos,
  setVideos,
  selectedIds,
  focusedId,
  isCommandPaletteOpen,
  setIsCommandPaletteOpen,
  handleTriggerWifiShare,
  setColorAdjustId,
  togglePopout,
  handlePurgeWorkspace,
  setShowHelp,
  showHelp,
  activeGridFolders,
  handleFileManagementSuccess,
  addLog,
  singleRenameTarget,
  setSingleRenameTarget,
  renameHistory,
  addToRenameHistory,
  handleIngestPaths,
  globalVolume,
  setGlobalVolume,
  masterMuted,
  toggleMasterMute,
  handleUpdate,
  modalState,
  videoOps
}: AppModalsContainerProps) {
  const globalRepeat = useStore(state => state.globalRepeat);
  const setGlobalRepeat = useStore(state => state.setGlobalRepeat);

  return (
    <>
      <MusicPlayerWidget videos={videos} setVideos={setVideos} />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectAction={(actionId) => {
          switch (actionId) {
            case 'metadata_studio': {
              const selectedItems = videos.filter(item => selectedIds.has(item.id));
              if (selectedItems.length > 0) {
                useStore.getState().setMetadataStudioTargets(selectedItems);
              } else if (focusedId) {
                const target = videos.find(v => v.id === focusedId);
                if (target) useStore.getState().setMetadataStudioTargets([target]);
              } else if (videos.length > 0) {
                useStore.getState().setMetadataStudioTargets(videos);
              }
              break;
            }
            case 'whatsapp_share': {
              const target = (focusedId ? videos.find(v => v.id === focusedId) : null) || videos[0];
              if (target) useStore.getState().setWhatsAppShareTarget(target);
              break;
            }
            case 'wifi_share':
              handleTriggerWifiShare();
              break;
            case 'trim_crop_studio': {
              const target = (focusedId ? videos.find(v => v.id === focusedId) : null) || videos[0];
              if (target) useStore.getState().setTrimCropModalTarget(target);
              break;
            }
            case 'color_grading':
              if (videos.length > 0) setColorAdjustId(videos[0].id);
              break;
            case 'reshape_studio':
              if (videos.length > 0) modalState.setReshapeTarget(videos[0]);
              break;
            case 'portrait_blur':
              if (videos.length > 0) modalState.setPortraitBlurTarget(videos[0]);
              break;
            case 'frame_studio':
              videoOps.setShowResizeModal(true);
              break;
            case 'export_video':
              videoOps.setShowSaveCropOptions(true);
              break;
            case 'popout_player':
              if (videos.length > 0) togglePopout(videos[0].id);
              break;
            case 'purge_workspace':
              handlePurgeWorkspace();
              break;
            case 'music_player':
              modalState.setVolumeRepeatOpen(true);
              break;
            case 'help':
              setShowHelp(true);
              break;
          }
        }}
      />
      <ModalOrchestrator
        showHelp={showHelp}
        setShowHelp={setShowHelp}
        fileManageOpen={modalState.fileManageOpen}
        setFileManageOpen={modalState.setFileManageOpen}
        fileManageItems={modalState.fileManageItems}
        fileManageMode={modalState.fileManageMode}
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
        customConfirm={modalState.customConfirm}
        setCustomConfirm={modalState.setCustomConfirm}
        customPrompt={modalState.customPrompt}
        setCustomPrompt={modalState.setCustomPrompt}
        wifiShareOpen={modalState.wifiShareOpen}
        setWifiShareOpen={modalState.setWifiShareOpen}
        wifiShareItems={modalState.wifiShareItems}
        setWifiShareItems={modalState.setWifiShareItems}
        onClearSharedFiles={() => modalState.setWifiShareItems([])}
        handleIngestPaths={handleIngestPaths}
        volumeRepeatOpen={modalState.volumeRepeatOpen}
        setVolumeRepeatOpen={modalState.setVolumeRepeatOpen}
        globalVolume={globalVolume}
        setGlobalVolume={setGlobalVolume}
        masterMuted={masterMuted}
        toggleMasterMute={toggleMasterMute}
        globalRepeat={globalRepeat}
        setGlobalRepeat={setGlobalRepeat}
        videos={videos}
        handleUpdate={handleUpdate}
      />
    </>
  );
}
