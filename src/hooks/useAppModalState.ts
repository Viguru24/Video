import { useState } from 'react';
import type { VideoItem } from '../types';

export function useAppModalState() {
  const [fileManageOpen, setFileManageOpen] = useState(false);
  const [fileManageItems, setFileManageItems] = useState<VideoItem[]>([]);
  const [fileManageMode, setFileManageMode] = useState<'move' | 'copy'>('move');
  const [wifiShareOpen, setWifiShareOpen] = useState(false);
  const [volumeRepeatOpen, setVolumeRepeatOpen] = useState(false);
  const [wifiShareItems, setWifiShareItems] = useState<any[]>([]);
  const [customConfirm, setCustomConfirm] = useState<any | null>(null);
  const [customPrompt, setCustomPrompt] = useState<any | null>(null);
  const [reshapeTarget, setReshapeTarget] = useState<VideoItem | null>(null);
  const [portraitBlurTarget, setPortraitBlurTarget] = useState<VideoItem | null>(null);

  return {
    fileManageOpen,
    setFileManageOpen,
    fileManageItems,
    setFileManageItems,
    fileManageMode,
    setFileManageMode,
    wifiShareOpen,
    setWifiShareOpen,
    volumeRepeatOpen,
    setVolumeRepeatOpen,
    wifiShareItems,
    setWifiShareItems,
    customConfirm,
    setCustomConfirm,
    customPrompt,
    setCustomPrompt,
    reshapeTarget,
    setReshapeTarget,
    portraitBlurTarget,
    setPortraitBlurTarget
  };
}
