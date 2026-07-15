import { lazy, Suspense } from 'react';
import type { VideoItem, RepeatMode } from '../../types';

// Modals
import { FileManagementModal } from '../FileManagementModal';
import { RenameProtocolModal } from './RenameProtocolModal';
import { SaveCropModal } from './SaveCropModal';
import { SaveUpscaleModal } from './SaveUpscaleModal';
import { ResizeModal } from './ResizeModal';
import { UpscaleStatusPanel } from './UpscaleStatusPanel';
import { AiOfflineModal } from './AiOfflineModal';
import { CustomConfirmModal } from './CustomConfirmModal';
import { CustomPromptModal } from './CustomPromptModal';
import { WifiShareModal } from '../WifiShareModal';
import { VolumeRepeatModal } from '../VolumeRepeatModal';

const HelpModal = lazy(() => import('../HelpModal').then(m => ({ default: m.HelpModal })));

interface ModalOrchestratorProps {
  // Help Modal
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;

  // File Management
  fileManageOpen: boolean;
  setFileManageOpen: (open: boolean) => void;
  fileManageItems: VideoItem[];
  fileManageMode: 'move' | 'copy';
  activeGridFolders: string[];
  handleFileManagementSuccess: (updatedItems: { originalId: string; newPath: string }[]) => void;
  addLog: (m: string) => void;

  // Rename Protocol
  singleRenameTarget: VideoItem | null;
  setSingleRenameTarget: (target: VideoItem | null) => void;
  renameHistory: string[];
  addToRenameHistory: (name: string) => void;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;

  // Crop Options
  showSaveCropOptions: boolean;
  setShowSaveCropOptions: (show: boolean) => void;
  handleSaveCrop: (choice: 'overwrite' | 'new') => void;


  // Upscale Options
  showSaveUpscaleOptions: boolean;
  setShowSaveUpscaleOptions: (show: boolean) => void;
  upscaleTarget: VideoItem | null;
  setUpscaleTarget: (target: VideoItem | null) => void;
  executeUpscale: (choice: 'replace' | 'new' | 'cancel') => void;

  // Resize Options
  showResizeModal: boolean;
  setShowResizeModal: (show: boolean) => void;
  resizeTarget: VideoItem | null;
  setResizeTarget: (target: VideoItem | null) => void;
  handleResizeSuccess: (newPath: string, overwrite: boolean) => void;

  // Upscale Status Panel
  upscaleStatus: 'idle' | 'enhancing' | 'success' | 'failed' | 'fallback';
  setUpscaleStatus: (status: 'idle' | 'enhancing' | 'success' | 'failed' | 'fallback') => void;
  upscaleProgressPercent: number | null;
  upscaleStage: string | null;
  lastEnhancedTitle: string;
  cancelEnhancement: () => void;

  // AI Server Offline
  aiServerOffline: boolean;
  setAiServerOffline: (offline: boolean) => void;

  // Custom Confirm/Prompt
  customConfirm: {
    message: string;
    title: string;
    kind?: 'info' | 'warning' | 'error';
    resolve: (value: boolean) => void;
  } | null;
  setCustomConfirm: (confirm: any) => void;
  
  customPrompt: {
    message: string;
    title: string;
    defaultValue: string;
    resolve: (value: string | null) => void;
  } | null;
  setCustomPrompt: (prompt: any) => void;

  // Wifi Share
  wifiShareOpen: boolean;
  setWifiShareOpen: (open: boolean) => void;
  wifiShareItems: any[];
  handleIngestPaths: (paths: string[]) => Promise<void>;

  // Volume Repeat Modal
  volumeRepeatOpen: boolean;
  setVolumeRepeatOpen: (open: boolean) => void;
  globalVolume: number;
  setGlobalVolume: (val: number | ((prev: number) => number)) => void;
  masterMuted: boolean;
  toggleMasterMute: () => void;
  globalRepeat: RepeatMode;
  setGlobalRepeat: (val: RepeatMode) => void;
  videos: VideoItem[];
  handleUpdate: (idOrIds: string | string[], updates: any) => void;
}

export function ModalOrchestrator({
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
  showSaveCropOptions,
  setShowSaveCropOptions,
  handleSaveCrop,
  showSaveUpscaleOptions,
  setShowSaveUpscaleOptions,
  upscaleTarget,
  setUpscaleTarget,
  executeUpscale,
  showResizeModal,
  setShowResizeModal,
  resizeTarget,
  setResizeTarget,
  handleResizeSuccess,
  upscaleStatus,
  setUpscaleStatus,
  upscaleProgressPercent,
  upscaleStage,
  lastEnhancedTitle,
  cancelEnhancement,
  aiServerOffline,
  setAiServerOffline,
  customConfirm,
  setCustomConfirm,
  customPrompt,
  setCustomPrompt,
  wifiShareOpen,
  setWifiShareOpen,
  wifiShareItems,
  handleIngestPaths,
  volumeRepeatOpen,
  setVolumeRepeatOpen,
  globalVolume,
  setGlobalVolume,
  masterMuted,
  toggleMasterMute,
  globalRepeat,
  setGlobalRepeat,
  videos,
  handleUpdate
}: ModalOrchestratorProps) {
  return (
    <>
      <Suspense fallback={null}>
        {showHelp && <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />}
      </Suspense>

      {fileManageOpen && (
        <FileManagementModal
          isOpen={fileManageOpen}
          onClose={() => setFileManageOpen(false)}
          items={fileManageItems}
          mode={fileManageMode}
          activeGridFolders={activeGridFolders}
          onSuccess={handleFileManagementSuccess}
          addLog={addLog}
        />
      )}

      {singleRenameTarget && (
        <RenameProtocolModal
          target={singleRenameTarget}
          renameHistory={renameHistory}
          addToRenameHistory={addToRenameHistory}
          onClose={() => setSingleRenameTarget(null)}
          setVideos={setVideos}
          addLog={addLog}
        />
      )}

      <SaveCropModal
        isOpen={showSaveCropOptions}
        onClose={() => setShowSaveCropOptions(false)}
        onSave={handleSaveCrop}
      />


      <SaveUpscaleModal
        isOpen={showSaveUpscaleOptions && upscaleTarget !== null}
        onClose={() => {
          setShowSaveUpscaleOptions(false);
          setUpscaleTarget(null);
        }}
        onExecute={executeUpscale}
      />

      <ResizeModal
        isOpen={showResizeModal && resizeTarget !== null}
        onClose={() => {
          setShowResizeModal(false);
          setResizeTarget(null);
        }}
        target={resizeTarget}
        onSuccess={handleResizeSuccess}
        addLog={addLog}
      />

      <UpscaleStatusPanel
        status={upscaleStatus}
        progressPercent={upscaleProgressPercent}
        stage={upscaleStage}
        title={lastEnhancedTitle}
        onCancel={cancelEnhancement}
        onDismiss={() => setUpscaleStatus('idle')}
      />

      <AiOfflineModal
        isOpen={aiServerOffline}
        onClose={() => setAiServerOffline(false)}
        onBack={() => {
          setAiServerOffline(false);
          setShowSaveCropOptions(true);
        }}
      />

      {customConfirm && (
        <CustomConfirmModal
          title={customConfirm.title}
          message={customConfirm.message}
          kind={customConfirm.kind}
          onResolve={(val) => {
            customConfirm.resolve(val);
            setCustomConfirm(null);
          }}
        />
      )}
      
      {customPrompt && (
        <CustomPromptModal
          title={customPrompt.title}
          message={customPrompt.message}
          defaultValue={customPrompt.defaultValue}
          onResolve={(val) => {
            customPrompt.resolve(val);
            setCustomPrompt(null);
          }}
        />
      )}

      <WifiShareModal
        isOpen={wifiShareOpen}
        onClose={() => setWifiShareOpen(false)}
        sharedFiles={wifiShareItems}
        onLog={addLog}
        onAddMultipleFiles={handleIngestPaths}
      />

      <VolumeRepeatModal
        isOpen={volumeRepeatOpen}
        onClose={() => setVolumeRepeatOpen(false)}
        globalVolume={globalVolume}
        setGlobalVolume={setGlobalVolume}
        masterMuted={masterMuted}
        toggleMasterMute={toggleMasterMute}
        globalRepeat={globalRepeat}
        setGlobalRepeat={setGlobalRepeat}
        videos={videos}
        onUpdateVideo={handleUpdate}
      />
    </>
  );
}
