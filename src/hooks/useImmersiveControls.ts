import { useRef, useCallback, useEffect } from 'react';
import type { VideoItem } from '../types';
import { isValidPictureExtension } from '../utils/videoUtils';
import { IMMERSIVE_HIDE_DELAY } from '../constants';

interface UseImmersiveControlsParams {
  immersive: boolean;
  isFS: boolean;
  masterShowUI: boolean;
  setMasterShowUI: (show: boolean) => void;
  singleRenameTarget: VideoItem | null;
  videos: VideoItem[];
  handleNavigateSibling: (dir: 1 | -1) => void;
  setGlobalControl: (ctrl: string | null) => void;
}

export function useImmersiveControls({
  immersive,
  isFS,
  masterShowUI,
  setMasterShowUI,
  singleRenameTarget,
  videos,
  handleNavigateSibling,
  setGlobalControl,
}: UseImmersiveControlsParams) {
  const showImmersiveUI = masterShowUI;
  const setShowImmersiveUI = setMasterShowUI;
  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const frameStepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameStepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return {
    showImmersiveUI,
    startFrameStep,
    stopFrameStep,
  };
}
