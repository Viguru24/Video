import { useCallback, useEffect, useRef } from 'react';
import type { VideoItem } from '../types';
import { isValidPictureExtension } from '../utils/videoUtils';
import { IMMERSIVE_HIDE_DELAY } from '../constants';

interface UseSoloGesturesProps {
  focusedId: string | null;
  videos: VideoItem[];
  handleUpdate: (idOrIds: string | string[], updates: any) => void;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  handleNavigateSibling: (direction: 1 | -1) => void;
  setGlobalControl: (ctl: string | null) => void;
  setGlobalVolume: React.Dispatch<React.SetStateAction<number>>;
  immersive: boolean;
  isFS: boolean;
  showImmersiveUI: boolean;
  setShowImmersiveUI: (val: boolean) => void;
  singleRenameTarget: VideoItem | null;
  soloOverlayRef: React.RefObject<HTMLDivElement | null>;
  soloVolumeContainerRef: React.RefObject<HTMLDivElement | null>;
  addLog: (msg: string) => void;
}

export function useSoloGestures({
  focusedId,
  videos,
  handleUpdate,
  onUpdateVideo,
  handleNavigateSibling,
  setGlobalControl,
  setGlobalVolume,
  immersive,
  isFS,
  showImmersiveUI,
  setShowImmersiveUI,
  singleRenameTarget,
  soloOverlayRef,
  soloVolumeContainerRef,
  addLog
}: UseSoloGesturesProps) {

  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const frameStepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameStepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSoloWheelTime = useRef(0);

  const resetImmersiveTimer = useCallback(() => {
    setShowImmersiveUI(true);
    if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current);
    if (holdActiveRef.current) return;
    immersiveTimerRef.current = setTimeout(() => setShowImmersiveUI(false), IMMERSIVE_HIDE_DELAY);
  }, [setShowImmersiveUI]);

  const triggerFrameStep = useCallback((action: 'stepback' | 'stepforward', videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    if (video && isValidPictureExtension(video.realPath || video.url)) {
      handleNavigateSibling(action === 'stepback' ? -1 : 1);
    } else {
      setGlobalControl(`${action}-${videoId}-${Date.now()}`);
    }
  }, [videos, handleNavigateSibling, setGlobalControl]);

  const startFrameStep = useCallback((action: 'stepback' | 'stepforward', videoId: string) => {
    holdActiveRef.current = true;
    resetImmersiveTimer();

    const video = videos.find(v => v.id === videoId);
    const isImg = video ? isValidPictureExtension(video.realPath || video.url) : false;

    triggerFrameStep(action, videoId);

    if (frameStepTimeoutRef.current) clearTimeout(frameStepTimeoutRef.current);
    if (frameStepIntervalRef.current) clearInterval(frameStepIntervalRef.current);

    frameStepTimeoutRef.current = setTimeout(() => {
      frameStepIntervalRef.current = setInterval(() => {
        triggerFrameStep(action, videoId);
      }, isImg ? 180 : 80);
    }, 400);
  }, [resetImmersiveTimer, triggerFrameStep, videos]);

  const stopFrameStep = useCallback(() => {
    holdActiveRef.current = false;
    if (frameStepTimeoutRef.current) {
      clearTimeout(frameStepTimeoutRef.current);
      frameStepTimeoutRef.current = null;
    }
    if (frameStepIntervalRef.current) {
      clearInterval(frameStepIntervalRef.current);
      frameStepIntervalRef.current = null;
    }
    resetImmersiveTimer();
  }, [resetImmersiveTimer]);

  useEffect(() => {
    if (immersive && !showImmersiveUI && !singleRenameTarget) {
      document.documentElement.setAttribute('data-ghost', 'true');
    } else {
      document.documentElement.removeAttribute('data-ghost');
    }
  }, [immersive, showImmersiveUI, singleRenameTarget]);

  useEffect(() => {
    if (immersive || isFS) {
      window.addEventListener('mousemove', resetImmersiveTimer);
      resetImmersiveTimer();
    } else {
      window.removeEventListener('mousemove', resetImmersiveTimer);
      setShowImmersiveUI(true);
    }
    return () => {
      window.removeEventListener('mousemove', resetImmersiveTimer);
      if (immersiveTimerRef.current) {
        clearTimeout(immersiveTimerRef.current);
      }
    };
  }, [immersive, isFS, resetImmersiveTimer, setShowImmersiveUI]);

  useEffect(() => {
    if (singleRenameTarget) {
      setShowImmersiveUI(true);
      if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current);
    }
  }, [singleRenameTarget, setShowImmersiveUI]);

  useEffect(() => {
    if (!focusedId) return;

    const handleSoloWheel = (e: WheelEvent) => {
      if (e.altKey || e.ctrlKey || e.shiftKey) return;
      const overlay = soloOverlayRef.current;
      if (!overlay || !overlay.contains(e.target as Node)) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      const now = Date.now();
      if (now - lastSoloWheelTime.current > 180) {
        lastSoloWheelTime.current = now;
        const direction = e.deltaY > 0 ? 1 : -1;
        const video = videos.find(v => v.id === focusedId);
        if (video) {
          if (video.folderFiles && video.folderFiles.length > 1) {
            const currentIdx = video.currentIdx || 0;
            const nextIdx = (currentIdx + direction + video.folderFiles.length) % video.folderFiles.length;
            const nextFile = video.folderFiles[nextIdx];
            if (nextFile) {
              handleUpdate(video.id, {
                currentIdx: nextIdx,
                url: nextFile.url,
                realPath: (nextFile as any).path || nextFile.url,
                title: nextFile.name
              });
              addLog(`Folder Sibling Navigate [${video.title}] → ${nextFile.name}`);
            }
          } else {
            handleNavigateSibling(direction);
          }
        }
      }
    };

    window.addEventListener('wheel', handleSoloWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener('wheel', handleSoloWheel, { capture: true });
    };
  }, [focusedId, videos, handleUpdate, addLog, handleNavigateSibling, soloOverlayRef]);

  useEffect(() => {
    const el = soloVolumeContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const change = e.deltaY < 0 ? 0.05 : -0.05;
      setGlobalVolume(prev => Math.max(0, Math.min(1, prev + change)));
      
      const currentFocusedVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
      if (currentFocusedVideo && currentFocusedVideo.muted) {
        onUpdateVideo(currentFocusedVideo.id, { muted: false });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [focusedId, videos, onUpdateVideo, setGlobalVolume, soloVolumeContainerRef]);

  return {
    resetImmersiveTimer,
    triggerFrameStep,
    startFrameStep,
    stopFrameStep
  };
}
