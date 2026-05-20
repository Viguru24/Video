import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { isTauri } from '../utils/videoUtils';

interface SessionControlProps {
  sessionDuration: number;
  rotationInterval: number;
  rotating: boolean;
  setRotating: (val: boolean) => void;
  collections: Record<string, VideoItem[]>;
  rowOffsets: number[];
  rotIdx: number;
  setRotIdx: (updater: number | ((curr: number) => number)) => void;
  addLog: (msg: string) => void;
  isPopout?: boolean;
}

/**
 * Custom hook to manage session duration, rotation timers, and pre-heating logic.
 */
export function useSessionControl({
  sessionDuration,
  rotationInterval,
  rotating,
  setRotating,
  collections,
  rowOffsets,
  rotIdx,
  setRotIdx,
  addLog,
  isPopout = false
}: SessionControlProps) {
  const [timeLeft, setTimeLeft] = useState(rotationInterval);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(0);
  const [nextSetVideos, setNextSetVideos] = useState<VideoItem[]>([]);

  // 1. Session Countdown Logic
  useEffect(() => {
    if (sessionDuration <= 0) {
      setSessionTimeLeft(0);
      return;
    }
    
    setSessionTimeLeft(prev => prev > 0 ? prev : sessionDuration * 60);

    const interval = setInterval(() => {
      setSessionTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setRotating(false);
          addLog("Session Limit Reached: Terminating System...");
          if (isTauri()) {
            invoke('exit_app').catch(console.error);
          } else {
            addLog("Session Limit Reached: Please close this window.");
            alert("Session Limit Reached: Please close this window.");
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionDuration, addLog, setRotating]);

  // 2. Rotation Timer Logic
  useEffect(() => {
    if (isPopout) return;
    if (!rotating) {
      setTimeLeft(rotationInterval);
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setRotIdx(curr => (curr + 1) % Math.max(1, rowOffsets.length > 0 ? rowOffsets.length : Object.keys(collections).length));
          return rotationInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [rotating, rotationInterval, rowOffsets.length, collections, isPopout, setRotIdx]);

  // Reset rotation timer when rotation is toggled
  useEffect(() => {
    if (rotating) {
      setTimeLeft(rotationInterval);
    }
  }, [rotating, rotationInterval]);

  // 3. Pre-Heating Logic (Buffers next set 3s before rotation)
  useEffect(() => {
    if (!rotating || Object.keys(collections).length <= 1) return;
    
    if (timeLeft === 3) {
      const keys = Object.keys(collections);
      const nextIdx = (rotIdx + 1) % keys.length;
      const nextSet = collections[keys[nextIdx]];
      if (nextSet) {
        setNextSetVideos(nextSet.slice(0, 4));
        addLog(`Pre-Heating Set (Partial): ${keys[nextIdx]}...`);
      }
    }
  }, [timeLeft, rotating, collections, rotIdx, addLog]);

  return {
    timeLeft,
    sessionTimeLeft,
    nextSetVideos,
    setTimeLeft,
    setSessionTimeLeft
  };
}
