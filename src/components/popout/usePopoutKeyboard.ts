import React, { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { toCosmoUrl, isValidPictureExtension } from '../../utils/videoUtils';
import type { VideoItem } from '../../types';

interface UsePopoutKeyboardProps {
  activeVideo: VideoItem | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  isCropping: boolean;
  setIsCropping: React.Dispatch<React.SetStateAction<boolean>>;
  setCropBox: (b: any) => void;
  setAspectRatio: (a: any) => void;
  colorAdjustId: string | null;
  setColorAdjustId: React.Dispatch<React.SetStateAction<string | null>>;
  navigate: (direction: 1 | -1) => void;
  onUpdateVideo: (id: any, updates: any) => void;
  showHudNotification: (label: string, val: string) => void;
  setVideoPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSlideshowActive: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  zoomScaleRef: React.MutableRefObject<number>;
  panOffsetRef: React.MutableRefObject<{ x: number; y: number }>;
  startPanRef: React.MutableRefObject<{ x: number; y: number }>;
  setZoomScale: React.Dispatch<React.SetStateAction<number>>;
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  isPanning: boolean;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
}

export function usePopoutKeyboard({
  activeVideo,
  videoRef,
  viewportRef,
  isCropping,
  setIsCropping,
  setCropBox,
  setAspectRatio,
  colorAdjustId,
  setColorAdjustId,
  navigate,
  onUpdateVideo,
  showHudNotification,
  setVideoPlaying,
  setIsSlideshowActive,
  setCurrentTime,
  setMuted,
  zoomScaleRef,
  panOffsetRef,
  startPanRef,
  setZoomScale,
  setPanOffset,
  isPanning,
  setIsPanning,
}: UsePopoutKeyboardProps) {
  // Global mouse panning tracker
  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (zoomScaleRef.current > 1) {
        const nextPan = {
          x: e.clientX - startPanRef.current.x,
          y: e.clientY - startPanRef.current.y
        };
        setPanOffset(nextPan);
        panOffsetRef.current = nextPan;
      }
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, panOffsetRef, setPanOffset, startPanRef, zoomScaleRef]);

  const handleViewportMouseDown = (e: React.MouseEvent) => {
    if (isCropping) return;

    // Alt + Click to toggle 2.5x Zoom
    if (e.altKey && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - (rect.left + rect.width / 2);
      const mouseY = e.clientY - (rect.top + rect.height / 2);
      if (zoomScaleRef.current > 1) {
        setZoomScale(1);
        setPanOffset({ x: 0, y: 0 });
        zoomScaleRef.current = 1;
        panOffsetRef.current = { x: 0, y: 0 };
        showHudNotification('ZOOM', '100%');
      } else {
        const nextScale = 2.5;
        const ratio = nextScale / 1;
        const nextPan = { x: mouseX - mouseX * ratio, y: mouseY - mouseY * ratio };
        setPanOffset(nextPan);
        setZoomScale(nextScale);
        zoomScaleRef.current = nextScale;
        panOffsetRef.current = nextPan;
        showHudNotification('ZOOM', '250%');
      }
      return;
    }

    // Drag to pan when zoomed
    if (zoomScaleRef.current > 1 && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      startPanRef.current = { x: e.clientX - panOffsetRef.current.x, y: e.clientY - panOffsetRef.current.y };
    }
  };

  const handleDoubleClickViewport = (e: React.MouseEvent) => {
    if (isCropping) return;
    e.preventDefault();
    e.stopPropagation();
    if (zoomScaleRef.current > 1) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      zoomScaleRef.current = 1;
      panOffsetRef.current = { x: 0, y: 0 };
      showHudNotification('ZOOM', '100%');
    } else {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - (rect.left + rect.width / 2);
      const mouseY = e.clientY - (rect.top + rect.height / 2);
      const nextScale = 2.5;
      const ratio = nextScale / 1;
      const nextPan = { x: mouseX - mouseX * ratio, y: mouseY - mouseY * ratio };
      setPanOffset(nextPan);
      setZoomScale(nextScale);
      zoomScaleRef.current = nextScale;
      panOffsetRef.current = nextPan;
      showHudNotification('ZOOM', '250%');
    }
  };

  // Keyboard shortcut listener
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
      // ArrowRight / ArrowDown / PageDown / MediaTrackNext -> Next File
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
      // ArrowLeft / ArrowUp / PageUp / MediaTrackPrevious -> Previous File
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
    isCropping,
    colorAdjustId,
    navigate,
    onUpdateVideo,
    showHudNotification,
    setVideoPlaying,
    setIsSlideshowActive,
    setCurrentTime,
    setMuted,
    setIsCropping,
    setCropBox,
    setAspectRatio,
    setColorAdjustId,
    videoRef
  ]);

  const toggleMaximize = async () => {
    try {
      const win = getCurrentWindow();
      const isMax = await win.isMaximized();
      if (isMax) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    } catch (err) {
      console.error("Failed to toggle maximize:", err);
    }
  };

  return {
    handleViewportMouseDown,
    handleDoubleClickViewport,
    toggleMaximize,
  };
}
