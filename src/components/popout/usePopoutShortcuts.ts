import React, { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { VideoItem } from '../../types';
import { toCosmoUrl, isValidPictureExtension } from '../../utils/videoUtils';

interface UsePopoutShortcutsParams {
  activeVideo: VideoItem | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isCropping: boolean;
  setIsCropping: React.Dispatch<React.SetStateAction<boolean>>;
  setCropBox: React.Dispatch<React.SetStateAction<{ x: number; y: number; w: number; h: number }>>;
  setAspectRatio: React.Dispatch<React.SetStateAction<'free' | '1:1' | '16:9' | '4:3'>>;
  colorAdjustId: string | null;
  setColorAdjustId: React.Dispatch<React.SetStateAction<string | null>>;
  setVideoPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSlideshowActive: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  navigate: (direction: 1 | -1) => void;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  showHudNotification: (title: string, value: string) => void;
}

export function usePopoutShortcuts({
  activeVideo,
  videoRef,
  isCropping,
  setIsCropping,
  setCropBox,
  setAspectRatio,
  colorAdjustId,
  setColorAdjustId,
  setVideoPlaying,
  setIsSlideshowActive,
  setCurrentTime,
  setMuted,
  navigate,
  onUpdateVideo,
  showHudNotification,
}: UsePopoutShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing inside form input fields
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
        return;
      }

      const key = e.key.toLowerCase();
      
      // Space / Key K / MediaPlayPause -> Toggle Play / Pause
      if (key === ' ' || key === 'k' || key === 'mediaplaypause') {
        e.preventDefault();
        e.stopPropagation();
        const activeClean = toCosmoUrl(activeVideo?.url || '');
        const activeIsImage = isValidPictureExtension((activeClean || '').split('?')[0]);
        if (!activeIsImage) {
          setVideoPlaying(p => !p);
        } else {
          setIsSlideshowActive(p => !p);
        }
      } 
      // ArrowRight / ArrowDown / PageDown / MediaTrackNext -> Next File (or frame step forward if Shift held)
      else if (key === 'arrowright' || key === 'arrowdown' || key === 'pagedown' || key === 'mediatracknext') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey && videoRef.current) {
          const stepTime = 1 / 30;
          videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + stepTime);
          setCurrentTime(videoRef.current.currentTime);
        } else {
          navigate(1);
        }
      } 
      // ArrowLeft / ArrowUp / PageUp / MediaTrackPrevious -> Previous File (or frame step back if Shift held)
      else if (key === 'arrowleft' || key === 'arrowup' || key === 'pageup' || key === 'mediatrackprevious') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey && videoRef.current) {
          const stepTime = 1 / 30;
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - stepTime);
          setCurrentTime(videoRef.current.currentTime);
        } else {
          navigate(-1);
        }
      } 
      // Comma (,) / Less Than (<) -> Step Back 1 Frame
      else if (key === ',' || key === '<') {
        e.preventDefault();
        e.stopPropagation();
        if (videoRef.current) {
          setVideoPlaying(false);
          videoRef.current.pause();
          const stepTime = 1 / 30;
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - stepTime);
          setCurrentTime(videoRef.current.currentTime);
        }
      } 
      // Period (.) / Greater Than (>) -> Step Forward 1 Frame
      else if (key === '.' || key === '>') {
        e.preventDefault();
        e.stopPropagation();
        if (videoRef.current) {
          setVideoPlaying(false);
          videoRef.current.pause();
          const stepTime = 1 / 30;
          videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + stepTime);
          setCurrentTime(videoRef.current.currentTime);
        }
      } 
      // Mute / Unmute (Key M)
      else if (key === 'm') {
        e.preventDefault();
        e.stopPropagation();
        setMuted(prev => !prev);
      } 
      // Repeat Mode Toggle (Key R)
      else if (key === 'r') {
        e.preventDefault();
        e.stopPropagation();
        const currentMode = activeVideo?.repeatMode || (localStorage.getItem('cosmo-repeat') || 'folder');
        let nextMode: 'none' | 'always' | 'folder' = 'none';
        if (currentMode === 'none') nextMode = 'always';
        else if (currentMode === 'always') nextMode = 'folder';
        else nextMode = 'none';

        if (activeVideo) {
          onUpdateVideo(activeVideo.id, { repeatMode: nextMode });
        }
        localStorage.setItem('cosmo-repeat', nextMode);
        const label = nextMode === 'always' ? "Repeat One" : nextMode === 'folder' ? "Repeat All" : "Off";
        showHudNotification("REPEAT MODE", label);
      } 
      // Fullscreen Toggle (Key F / F11)
      else if (key === 'f' || key === 'f11') {
        e.preventDefault();
        e.stopPropagation();
        try {
          const win = getCurrentWindow();
          const isFS = await win.isFullscreen();
          await win.setFullscreen(!isFS);
        } catch (err) {
          console.error("Fullscreen toggle failed:", err);
        }
      } 
      // Crop Mode Toggle (Key C)
      else if (key === 'c') {
        const activeClean = toCosmoUrl(activeVideo?.url || '');
        const activeIsImage = isValidPictureExtension((activeClean || '').split('?')[0]);
        if (activeIsImage) {
          e.preventDefault();
          e.stopPropagation();
          setIsCropping(prev => !prev);
          if (!isCropping) {
            setCropBox({ x: 15, y: 15, w: 70, h: 70 });
            setAspectRatio('free');
          }
        }
      } 
      // Color Adjust Panel Toggle (Key S)
      else if (key === 's') {
        if (activeVideo) {
          e.preventDefault();
          e.stopPropagation();
          setColorAdjustId(prev => prev ? null : activeVideo.id);
        }
      } 
      // Escape Key
      else if (key === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isCropping) {
          setIsCropping(false);
        } else if (colorAdjustId) {
          setColorAdjustId(null);
        } else {
          try {
            const win = getCurrentWindow();
            const isFS = await win.isFullscreen();
            const isMax = await win.isMaximized();
            if (isFS) {
              await win.setFullscreen(false);
            } else if (isMax) {
              await win.unmaximize();
            } else {
              await win.close();
            }
          } catch (err) {
            console.error(err);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    activeVideo, 
    videoRef, 
    isCropping, 
    setIsCropping, 
    setCropBox, 
    setAspectRatio, 
    colorAdjustId, 
    setColorAdjustId, 
    setVideoPlaying, 
    setIsSlideshowActive, 
    setCurrentTime, 
    setMuted, 
    navigate, 
    onUpdateVideo, 
    showHudNotification
  ]);
}
