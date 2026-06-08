import React, { useRef, useCallback, useEffect } from 'react';
import { FPS, STEP_INTERVAL, STEP_DELAY } from '../constants';
import type { VideoItem } from '../types';

interface UseVideoScrubberProps {
  video: VideoItem;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  progressRef: React.RefObject<HTMLDivElement | null>;
  handleRef: React.RefObject<HTMLDivElement | null>;
  textRef: React.RefObject<HTMLDivElement | null>;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  setIsInteracting: (interacting: boolean) => void;
}

export function useVideoScrubber({
  video,
  videoRef,
  progressRef,
  handleRef,
  textRef,
  onUpdateVideo,
  setIsInteracting,
}: UseVideoScrubberProps) {
  const isScrubbing = useRef(false);
  const stepInterval = useRef<any>(null);

  const handleScrub = useCallback((e: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent) => {
    if (!videoRef.current) return;
    const scrubEl = document.querySelector(`[data-id="${video.id}"] .scrub-container`);
    if (!scrubEl) return;
    const rect = scrubEl.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const x = clientX - rect.left;
    const p = Math.max(0, Math.min(1, x / rect.width));
    videoRef.current.currentTime = p * videoRef.current.duration;
    if (progressRef.current) progressRef.current.style.width = `${p * 100}%`;
    if (handleRef.current) handleRef.current.style.left = `${p * 100}%`;
    if (textRef.current) textRef.current.textContent = `${Math.round(p * 100)}%`;
  }, [video.id, videoRef, progressRef, handleRef, textRef]);

  const stepFrame = useCallback((dir: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += dir * (1 / FPS);
      onUpdateVideo(video.id, { playing: false });
    }
  }, [video.id, videoRef, onUpdateVideo]);

  const stopStep = useCallback(() => {
    setIsInteracting(false);

    if (stepInterval.current) {
      clearTimeout(stepInterval.current);
      clearInterval(stepInterval.current);
      stepInterval.current = null;
    }
  }, [setIsInteracting]);

  const startStep = useCallback((dir: number) => {
    setIsInteracting(true);
    stepFrame(dir);

    if (stepInterval.current) clearInterval(stepInterval.current);
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
        handleScrub(e);
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
  }, [handleScrub, stopStep, setIsInteracting]);

  const handleScrubMouseDown = useCallback((e: React.MouseEvent) => {
    isScrubbing.current = true;
    handleScrub(e);
  }, [handleScrub]);

  return {
    isScrubbing,
    handleScrub,
    handleScrubMouseDown,
    stepFrame,
    startStep,
    stopStep,
  };
}
