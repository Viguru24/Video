import React, { useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { VideoItem } from '../types';
import { useStore } from '../store/useStore';
import { 
  isTauri, 
  toRealPath, 
  isValidPictureExtension, 
  isValidVideoExtension 
} from '../utils/videoUtils';

interface UseFocusNavigationParams {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  filtered: VideoItem[];
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  jumpToUnit: (id: string) => void;
  pendingScrollIdRef: React.MutableRefObject<string | null>;
  isSlideshowActive?: boolean;
  isSlideshowActiveRef?: React.MutableRefObject<boolean>;
  rotating: boolean;
  setRotating: (val: boolean) => void;
  enableOSFullscreen: boolean;
  setIsFS: (val: boolean) => void;
  setImmersive: (val: boolean) => void;
  masterMuted: boolean;
  setNavDirection: (dir: 1 | -1) => void;
  setIsCropping: (val: boolean) => void;
  setShowSaveCropOptions: (val: boolean) => void;
  setShowSaveUpscaleOptions: (val: boolean) => void;
  setShowResizeModal: (val: boolean) => void;
  setColorAdjustId: (id: string | null) => void;
  setGlobalControl: (ctrl: string | null) => void;
  addLog: (m: string) => void;
}

export function useFocusNavigation({
  videos,
  setVideos,
  filtered,
  focusedId,
  setFocusedId,
  jumpToUnit,
  pendingScrollIdRef,
  isSlideshowActive,
  isSlideshowActiveRef,
  rotating,
  setRotating,
  enableOSFullscreen,
  setIsFS,
  setImmersive,
  masterMuted,
  setNavDirection,
  setIsCropping,
  setShowSaveCropOptions,
  setShowSaveUpscaleOptions,
  setShowResizeModal,
  setColorAdjustId,
  setGlobalControl,
  addLog,
}: UseFocusNavigationParams) {
  const exitSoloMode = useCallback(async () => {
    if (!isTauri()) {
      setFocusedId(null);
      setImmersive(false);
      return;
    }

    try {
      const win = getCurrentWindow();
      const isAlreadyFS = await win.isFullscreen();
      if (isAlreadyFS) {
        await win.setFullscreen(false);
        setIsFS(false);
      }
      setFocusedId(null);
      setImmersive(false);
    } catch (err) {
      console.warn("Error exiting fullscreen/solo mode:", err);
      setFocusedId(null);
      setImmersive(false);
    }
  }, [setFocusedId, setImmersive, setIsFS]);

  useEffect(() => {
    if (focusedId) {
      window.history.pushState({ cosmoSolo: focusedId }, '');
      const handlePopState = () => {
        exitSoloMode();
      };
      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [focusedId, exitSoloMode]);

  useEffect(() => {
    (window as any).__cosmoExitSolo = () => {
      if (focusedId) {
        exitSoloMode();
        return true;
      }
      return false;
    };
    return () => {
      delete (window as any).__cosmoExitSolo;
    };
  }, [focusedId, exitSoloMode]);

  const handleFocus = useCallback((id: string) => {
    setFocusedId(id);
  }, [setFocusedId]);

  const handleDeepFocus = useCallback((id: string, time?: number) => {
    if (time !== undefined && typeof time === 'number') {
      setVideos(prev => prev.map(v => v.id === id ? { ...v, currentTime: time } : v));
    }
    
    const activeSlide = isSlideshowActiveRef ? isSlideshowActiveRef.current : (isSlideshowActive || false);
    if (focusedId === id || activeSlide) {
      pendingScrollIdRef.current = id;
      jumpToUnit(id);
      exitSoloMode();
    } else {
      setFocusedId(id);
      setImmersive(true);
      if (rotating) setRotating(false);
      if (enableOSFullscreen) {
        setIsFS(true);
      }
      addLog(`Deep Focus: Unit ${id.split('-')[0]}`);
    }
  }, [focusedId, isSlideshowActive, isSlideshowActiveRef, setVideos, setFocusedId, setImmersive, enableOSFullscreen, setIsFS, rotating, setRotating, addLog, jumpToUnit, exitSoloMode, pendingScrollIdRef]);

  // Centralized Fullscreen Mode Synchronization Effect
  useEffect(() => {
    if (!isTauri()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    if (useStore.getState().immersive && enableOSFullscreen) {
      timer = setTimeout(async () => {
        try {
          const win = getCurrentWindow();
          const isAlreadyFS = await win.isFullscreen();
          if (!isAlreadyFS && useStore.getState().immersive) {
            await win.setFullscreen(true);
            setIsFS(true);
            addLog("System Fullscreen activated via deep focus");
          }
        } catch (err) {
          console.warn("Failed to activate OS fullscreen:", err);
        }
      }, 400);
    } else if (!useStore.getState().immersive) {
      getCurrentWindow().isFullscreen().then(async (isAlreadyFS) => {
        if (isAlreadyFS) {
          try {
            await getCurrentWindow().setFullscreen(false);
            setIsFS(false);
            addLog("System Fullscreen deactivated");
          } catch (err) {
            console.warn("Failed to deactivate OS fullscreen:", err);
          }
        }
      }).catch(() => {});
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [enableOSFullscreen, setIsFS, addLog]);

  const handleNavigateSibling = useCallback((direction: 1 | -1) => {
    if (filtered.length <= 1 || !focusedId) return;
    const currentIdx = filtered.findIndex(v => v.id === focusedId);
    if (currentIdx === -1) return;
    const nextIdx = (currentIdx + direction + filtered.length) % filtered.length;
    const nextVideo = filtered[nextIdx];
    if (nextVideo) {
      setIsCropping(false);
      setShowSaveCropOptions(false);
      setShowSaveUpscaleOptions(false);
      setShowResizeModal(false);
      setColorAdjustId(null);
      setGlobalControl(null);
      setNavDirection(direction);
      setFocusedId(nextVideo.id);
      const nextPath = nextVideo.realPath || nextVideo.url || '';
      if (!isValidPictureExtension(nextPath)) {
        setVideos(prev => prev.map(v =>
          v.id === nextVideo.id ? { ...v, playing: true, muted: masterMuted, currentTime: 0 } :
          v.id === focusedId ? { ...v, playing: false, muted: true } : v
        ));
      }
      addLog(`Folder Navigate [${filtered[currentIdx].title}] → ${nextVideo.title}`);
    }
  }, [filtered, focusedId, masterMuted, setFocusedId, setVideos, addLog, setIsCropping, setShowSaveCropOptions, setShowSaveUpscaleOptions, setShowResizeModal, setColorAdjustId, setGlobalControl, setNavDirection]);

  const focusedVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
  const focusedEffectivePath = focusedVideo
    ? (focusedVideo.folderFiles && focusedVideo.currentIdx !== undefined)
      ? (focusedVideo.folderFiles[focusedVideo.currentIdx]?.path || focusedVideo.folderFiles[focusedVideo.currentIdx]?.url)
      : (focusedVideo.realPath || focusedVideo.url)
    : '';
  const resolvedFocusedPath = toRealPath(focusedEffectivePath) || focusedEffectivePath;
  const isFocusedImage = resolvedFocusedPath ? isValidPictureExtension(resolvedFocusedPath) : false;
  const isFocusedVideo = resolvedFocusedPath ? isValidVideoExtension(resolvedFocusedPath) : false;

  return {
    exitSoloMode,
    handleFocus,
    handleDeepFocus,
    handleNavigateSibling,
    focusedVideo,
    isFocusedImage,
    isFocusedVideo,
  };
}
