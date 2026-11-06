import React from 'react';
import { CommandPalette } from './CommandPalette';
import { useStore } from '../store/useStore';
import type { VideoItem } from '../types';

interface AppCommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  videos: VideoItem[];
  selectedIds: Set<string>;
  focusedId: string | null;
  handleTriggerWifiShare: () => void;
  setColorAdjustId: (id: string | null) => void;
  setShowResizeModal: (val: boolean) => void;
  setShowSaveCropOptions: (val: boolean) => void;
  handlePurgeWorkspace: () => void;
  setVolumeRepeatOpen: (val: boolean) => void;
  setShowHelp: (val: boolean) => void;
}

export const AppCommandPaletteModal: React.FC<AppCommandPaletteModalProps> = ({
  isOpen,
  onClose,
  videos,
  selectedIds,
  focusedId,
  handleTriggerWifiShare,
  setColorAdjustId,
  setShowResizeModal,
  setShowSaveCropOptions,
  handlePurgeWorkspace,
  setVolumeRepeatOpen,
  setShowHelp,
}) => {
  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={onClose}
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
          case 'frame_studio':
            setShowResizeModal(true);
            break;
          case 'export_video':
            setShowSaveCropOptions(true);
            break;
          case 'purge_workspace':
            handlePurgeWorkspace();
            break;
          case 'music_player':
            setVolumeRepeatOpen(true);
            break;
          case 'help':
            setShowHelp(true);
            break;
        }
      }}
    />
  );
};
