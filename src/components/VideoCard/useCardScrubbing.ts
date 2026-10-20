import React, { useRef, useCallback, useEffect } from 'react';
import { FPS, STEP_INTERVAL, STEP_DELAY } from '../../constants';

interface UseCardScrubbingProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoId: string;
  isFocused: boolean;
  onUpdateVideo: (id: any, updates: any) => void;
  setIsInteracting: (val: boolean) => void;
}

export function useCardScrubbing({
  videoRef,
  videoId,
  isFocused,
  onUpdateVideo,
  setIsInteracting,
}: UseCardScrubbingProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const focusedProgressRef = useRef<HTMLDivElement>(null);
  const focusedHandleRef = useRef<HTMLDivElement>(null);
  const focusedTimeTextRef = useRef<HTMLDivElement>(null);
  const focusedScrubContainerRef = useRef<HTMLDivElement>(null);
  const focusedTrackRef = useRef<HTMLDivElement>(null);

  const isScrubbing = useRef(false);
  const stepInterval = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds === Infinity) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleFocusedScrub = useCallback((e: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent) => {
    if (!videoRef.current) return;
    const trackEl = focusedTrackRef.current;
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as TouchEvent | React.TouchEvent).touches[0].clientX : (e as MouseEvent | React.MouseEvent).clientX;
    const x = clientX - rect.left;
    const p = Math.max(0, Math.min(1, x / rect.width));
    const duration = videoRef.current.duration || 0;
    const currentTime = p * duration;
    videoRef.current.currentTime = currentTime;
    
    if (focusedProgressRef.current) focusedProgressRef.current.style.width = `${p * 100}%`;
    if (focusedHandleRef.current) focusedHandleRef.current.style.left = `${p * 100}%`;
    if (focusedTimeTextRef.current) {
      focusedTimeTextRef.current.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    }
  }, [videoRef]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      const currentTime = videoRef.current.currentTime;
      if (duration > 0) {
        const p = (currentTime / duration) * 100;
        const val = isNaN(p) ? 0 : p;
        if (progressRef.current) progressRef.current.style.width = `${val}%`;
        if (handleRef.current) handleRef.current.style.left = `${val}%`;
        if (textRef.current) textRef.current.textContent = `${Math.round(val)}%`;

        if (focusedProgressRef.current) focusedProgressRef.current.style.width = `${val}%`;
        if (focusedHandleRef.current) focusedHandleRef.current.style.left = `${val}%`;
        if (focusedTimeTextRef.current) {
          focusedTimeTextRef.current.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
        }
      }
    }
  }, [videoRef]);

  const handleScrub = useCallback((e: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent) => {
    if (!videoRef.current) return;
    const scrubEl = document.querySelector(`[data-id="${videoId}"] .scrub-container`);
    if (!scrubEl) return;
    const rect = scrubEl.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as TouchEvent | React.TouchEvent).touches[0].clientX : (e as MouseEvent | React.MouseEvent).clientX;
    const x = clientX - rect.left;
    const p = Math.max(0, Math.min(1, x / rect.width));
    videoRef.current.currentTime = p * videoRef.current.duration;
    if (progressRef.current) progressRef.current.style.width = `${p * 100}%`;
    if (handleRef.current) handleRef.current.style.left = `${p * 100}%`;
    if (textRef.current) textRef.current.textContent = `${Math.round(p * 100)}%`;
  }, [videoId, videoRef]);

  const stopStep = useCallback(() => {
    setIsInteracting(false);
    if (stepInterval.current) {
      clearTimeout(stepInterval.current);
      clearInterval(stepInterval.current);
      stepInterval.current = null;
    }
  }, [setIsInteracting]);

  const stepFrame = useCallback((dir: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += dir * (1 / FPS);
      onUpdateVideo(videoId, { playing: false });
    }
  }, [videoId, videoRef, onUpdateVideo]);

  const startStep = useCallback((dir: number) => {
    setIsInteracting(true);
    stepFrame(dir);

    if (stepInterval.current) {
      clearTimeout(stepInterval.current);
      clearInterval(stepInterval.current);
    }
    stepInterval.current = setTimeout(() => {
      stepInterval.current = setInterval(() => {
        stepFrame(dir);
      }, STEP_INTERVAL);
    }, STEP_DELAY);
  }, [setIsInteracting, stepFrame]);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (isScrubbing.current) {
        setIsInteracting(true);
        if (isFocused) {
          handleFocusedScrub(e);
        } else {
          handleScrub(e);
        }
      }
    };
    const onUp = () => {
      setIsInteracting(false);
      stopStep();
      isScrubbing.current = false;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [handleScrub, handleFocusedScrub, isFocused, setIsInteracting, stopStep]);

  return {
    progressRef,
    handleRef,
    textRef,
    focusedProgressRef,
    focusedHandleRef,
    focusedTimeTextRef,
    focusedScrubContainerRef,
    focusedTrackRef,
    isScrubbing,
    formatTime,
    handleFocusedScrub,
    handleTimeUpdate,
    handleScrub,
    startStep,
    stopStep,
  };
}
