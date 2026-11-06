import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ZoomIn, RotateCcw } from 'lucide-react';
import type { VideoItem } from '../types';
import { DEFAULT_COLOR_FILTERS } from '../types';
import { useStore } from '../store/useStore';
import { 
  toCosmoUrl, 
  isValidPictureExtension, 
  getFileNameFromPath, 
  pathsEqual,
  isTauri,
  safeSetLocalStorage,
  toRealPath
} from '../utils/videoUtils';
import { ColorFilterDefs } from './ColorFilterDefs';
import { CropOverlay } from './CropOverlay';
import { ColorAdjustmentPanel } from './ColorAdjustmentPanel';
import { SaveUpscaleModal } from './modals/SaveUpscaleModal';

import { PopoutTitleBar } from './popout/PopoutTitleBar';
import { PopoutScrubber } from './popout/PopoutScrubber';
import { PopoutControlBar } from './popout/PopoutControlBar';
import { PopoutCropModal } from './popout/PopoutCropModal';
import { PopoutUpscaleOverlay } from './popout/PopoutUpscaleOverlay';
import { usePopoutZoomPan } from './popout/usePopoutZoomPan';
import { usePopoutMediaOps } from './popout/usePopoutMediaOps';
import { usePopoutShortcuts } from './popout/usePopoutShortcuts';

interface PopoutPlayerProps {
  url: string;
}

export function PopoutPlayer({ url }: PopoutPlayerProps) {
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Safe media URL & type checks (guaranteed before any hooks)
  const resolvedTarget = activeVideo?.realPath || activeVideo?.url || url || '';
  const displayUrl = toCosmoUrl(resolvedTarget);
  const cleanActiveUrl = toRealPath(resolvedTarget) || resolvedTarget.split('?')[0];
  const isImage = isValidPictureExtension(cleanActiveUrl);
  
  // Custom video states
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const isScrubbing = useRef(false);
  const scrubTrackRef = useRef<HTMLDivElement>(null);
  const popoutVolumeContainerRef = useRef<HTMLDivElement>(null);

  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('cosmo-volume');
    return saved ? parseFloat(saved) : 0.8;
  });
  const [muted, setMuted] = useState(() => {
    const saved = localStorage.getItem('cosmo-muted');
    return saved === 'true';
  });

  const { slideshowInterval, setSlideshowInterval } = useStore();

  // Slideshow state
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);

  // Panel / modal states
  const [colorAdjustId, setColorAdjustId] = useState<string | null>(null);

  // UI elements auto-hide states
  const [showUI, setShowUI] = useState(true);
  const uiTimeoutRef = useRef<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Speed and HUD states
  const [speed, setSpeed] = useState(1.0);
  const [hudData, setHudData] = useState<{ title: string; value: string } | null>(null);
  const hudTimerRef = useRef<number | null>(null);

  const showHudNotification = useCallback((title: string, value: string) => {
    setHudData({ title, value });
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = window.setTimeout(() => {
      setHudData(null);
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, []);

  // Video Item Updates
  const onUpdateVideo = useCallback((id: string, updates: Partial<VideoItem>) => {
    setPlaylist(prev => {
      const updated = prev.map(v => v.id === id ? { ...v, ...updates } : v);
      safeSetLocalStorage('cosmo-v2', JSON.stringify(updated));
      return updated;
    });
    setActiveVideo(current => {
      if (current && current.id === id) {
        return { ...current, ...updates };
      }
      return current;
    });
  }, []);

  const mockSetVideos = useCallback((setter: any) => {
    setPlaylist(prev => {
      const next = typeof setter === 'function' ? setter(prev) : setter;
      safeSetLocalStorage('cosmo-v2', JSON.stringify(next));
      return next;
    });
  }, []);

  // Notifications logger
  const addLog = useCallback((m: string) => {
    console.log("[Popout Logger]:", m);
    if (m.toLowerCase().includes("success") || m.toLowerCase().includes("failed") || m.toLowerCase().includes("saved") || m.toLowerCase().includes("enhanced")) {
      setToast(m);
      setTimeout(() => setToast(null), 3500);
    }
  }, []);

  // Media Ops Hook (Crop & Upscale)
  const {
    isCropping,
    setIsCropping,
    cropBox,
    setCropBox,
    aspectRatio,
    setAspectRatio,
    showSaveCropOptions,
    setShowSaveCropOptions,
    upscaleTarget,
    showSaveUpscaleOptions,
    setShowSaveUpscaleOptions,
    upscaleStatus,
    upscaleProgressPercent,
    upscaleStage,
    lastEnhancedTitle,
    handleSaveCrop,
    handleUpscale,
    executeUpscale,
    cancelEnhancement,
  } = usePopoutMediaOps({
    activeVideo,
    setActiveVideo,
    playlist,
    setPlaylist,
    onUpdateVideo,
    addLog,
    setToast,
  });

  // Loader for playlist
  useEffect(() => {
    let active = true;
    const initPlaylist = async () => {
      let raw: string | null = null;
      if (isTauri()) {
        try {
          raw = await invoke<string | null>('load_persistence', { key: 'cosmo-v2' });
        } catch (e) {
          console.error("Failed to load workspace persistence in popout:", e);
        }
      }
      if (!raw) {
        raw = localStorage.getItem('cosmo-v2');
      }

      if (!active) return;

      let initialized = false;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPlaylist(parsed);
            const targetRealPath = toRealPath(url) || url;
            const found = parsed.find(v => {
              const vReal = toRealPath(v.realPath || v.url);
              return (
                pathsEqual(vReal, targetRealPath) || 
                pathsEqual(v.url, url) || 
                pathsEqual(v.realPath, url)
              );
            });
            if (found && (found.realPath || found.url)) {
              setActiveVideo(found);
              initialized = true;
            }
          }
        } catch (e) {
          console.error("Failed to parse playlist in popout load:", e);
        }
      }

      if (!initialized && active) {
        const real = toRealPath(url) || url;
        const tempVid: VideoItem = {
          id: 'temp-popout',
          title: getFileNameFromPath(real) || 'Popped Out Media',
          url: toCosmoUrl(real),
          realPath: real,
          currentTime: 0,
          playing: true,
          muted: false,
          repeatMode: 'none',
          repeatCount: 0,
          cols: 1
        };
        setActiveVideo(tempVid);
      }
    };

    initPlaylist();
    return () => {
      active = false;
    };
  }, [url]);

  // Auto-focus container and auto-unminimize/maximize window when loading media or folder
  useEffect(() => {
    rootRef.current?.focus();
    if (isTauri()) {
      const win = getCurrentWindow();
      win.unminimize()
        .then(() => win.show())
        .then(() => win.setFocus())
        .then(() => win.maximize())
        .catch(err => console.warn("Auto-maximize popout window error:", err));
    }
  }, [activeVideo?.id, url]);

  // Listen to external workspace changes (both localstorage and Tauri event bus)
  useEffect(() => {
    const updatePlaylist = (parsed: any[]) => {
      setPlaylist(parsed);
      if (activeVideo) {
        const currentId = activeVideo.id;
        const fresh = parsed.find(x => x.id === currentId);
        if (fresh) {
          setActiveVideo(fresh);
        }
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cosmo-v2' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            updatePlaylist(parsed);
          }
        } catch (err) {
          console.error(err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      listen<any>('workspace-changed', (event) => {
        const { key, data } = event.payload;
        if (key === 'cosmo-v2' && data) {
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
              updatePlaylist(parsed);
            }
          } catch (err) {
            console.error("Failed to parse workspace-changed event payload:", err);
          }
        }
      }).then(fn => { unlisten = fn; });
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (unlisten) unlisten();
    };
  }, [activeVideo]);

  // Sync video playing status
  useEffect(() => {
    const activeClean = toCosmoUrl(activeVideo?.url || '');
    const activeIsImage = isValidPictureExtension((activeClean || '').split('?')[0]);
    if (activeVideo && !activeIsImage && videoRef.current) {
      videoRef.current.playbackRate = speed;
      if (videoPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [videoPlaying, activeVideo, speed]);

  // Sync volume and muted
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = muted;
    }
    localStorage.setItem('cosmo-volume', volume.toString());
    localStorage.setItem('cosmo-muted', muted.toString());
  }, [volume, muted, activeVideo]);

  // Handle wheel events on volume container
  useEffect(() => {
    const el = popoutVolumeContainerRef.current;
    if (!el) return;

    const handleContainerWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const change = e.deltaY < 0 ? 0.05 : -0.05;
      setVolume(prev => Math.max(0, Math.min(1, prev + change)));
      setMuted(false);
    };

    el.addEventListener('wheel', handleContainerWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleContainerWheel);
    };
  }, []);

  // Navigation Logic
  const navigate = useCallback((direction: 1 | -1) => {
    if (!activeVideo) return;
    
    // 1. If the popped out unit is a Folder Unit with multiple files inside
    if (activeVideo.folderFiles && activeVideo.folderFiles.length > 1) {
      const currentIdx = activeVideo.currentIdx || 0;
      const nextIdx = (currentIdx + direction + activeVideo.folderFiles.length) % activeVideo.folderFiles.length;
      const nextFile = activeVideo.folderFiles[nextIdx];
      if (nextFile) {
        const nextPath = nextFile.path || nextFile.url;
        onUpdateVideo(activeVideo.id, {
          currentIdx: nextIdx,
          url: toCosmoUrl(nextPath),
          realPath: nextFile.path || nextPath,
          title: nextFile.name
        });
        showHudNotification("FILE", `${nextIdx + 1} / ${activeVideo.folderFiles.length}: ${nextFile.name}`);
        return;
      }
    }

    // 2. Otherwise navigate to the next/prev item in the workspace playlist
    if (playlist.length <= 1) return;

    const currentIdx = playlist.findIndex(v => v.id === activeVideo.id);
    if (currentIdx === -1) return;
    
    const nextIdx = (currentIdx + direction + playlist.length) % playlist.length;
    const nextVideo = playlist[nextIdx];
    if (nextVideo) {
      setActiveVideo(nextVideo);
      showHudNotification("MEDIA", nextVideo.title);
      
      const nextClean = toCosmoUrl(nextVideo.url || '');
      const nextIsImage = isValidPictureExtension((nextClean || '').split('?')[0]);
      if (nextIsImage) {
        setVideoPlaying(false);
      } else {
        setVideoPlaying(true);
        setIsSlideshowActive(false);
      }
      
      // Close panels and reset zoom during navigation
      setIsCropping(false);
      setColorAdjustId(null);
    }
  }, [playlist, activeVideo, onUpdateVideo, showHudNotification, setIsCropping]);

  // Slideshow Logic - uses configured slideshowInterval
  useEffect(() => {
    if (!isSlideshowActive || playlist.length <= 1) return;
    const intervalSec = Math.max(1, slideshowInterval || 5);
    const timer = setInterval(() => {
      navigate(1);
    }, intervalSec * 1000);
    return () => clearInterval(timer);
  }, [isSlideshowActive, playlist, navigate, slideshowInterval]);

  // High-Fidelity Pan & Zoom Hook
  const {
    zoomScale,
    panOffset,
    isPanning,
    viewportRef,
    setZoomScale,
    setPanOffset,
    handleViewportMouseDown,
    handleDoubleClickViewport,
    handleWheel,
  } = usePopoutZoomPan({
    activeVideoId: activeVideo?.id,
    url,
    isCropping,
    colorAdjustId,
    showSaveCropOptions,
    showSaveUpscaleOptions,
    isImage,
    navigate,
    setSpeed,
    showHudNotification,
  });

  // UI Visibility Auto-Hide
  const triggerUIVisibility = useCallback(() => {
    setShowUI(true);
    if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    uiTimeoutRef.current = window.setTimeout(() => {
      if (!isCropping && !colorAdjustId && !showSaveCropOptions && !showSaveUpscaleOptions) {
        setShowUI(false);
      }
    }, 3000);
  }, [isCropping, colorAdjustId, showSaveCropOptions, showSaveUpscaleOptions]);

  useEffect(() => {
    window.addEventListener('mousemove', triggerUIVisibility);
    triggerUIVisibility();
    return () => {
      window.removeEventListener('mousemove', triggerUIVisibility);
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    };
  }, [triggerUIVisibility]);

  // Keyboard Shortcuts Hook
  usePopoutShortcuts({
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
  });

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

  const handleTitlebarMouseDown = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    if (e.button === 0) {
      try {
        const win = getCurrentWindow();
        await win.startDragging();
      } catch (err) {
        console.error("Failed to start dragging:", err);
      }
    }
  };

  // Custom Video Scrubber
  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !scrubTrackRef.current) return;
    const rect = scrubTrackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * videoRef.current.duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleScrubMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isScrubbing.current = true;
    handleScrub(e);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isScrubbing.current || !videoRef.current || !scrubTrackRef.current) return;
      const rect = scrubTrackRef.current.getBoundingClientRect();
      const clickX = moveEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      const newTime = percentage * videoRef.current.duration;
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    };

    const handleMouseUp = () => {
      isScrubbing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Frame Stepping Logic
  const frameStepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameStepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startFrameStep = (action: 'stepforward' | 'stepback') => {
    if (!videoRef.current) return;
    setVideoPlaying(false);
    videoRef.current.pause();

    const stepTime = 1 / 30;
    if (action === 'stepforward') {
      videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + stepTime);
    } else {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - stepTime);
    }
    setCurrentTime(videoRef.current.currentTime);

    frameStepTimeoutRef.current = setTimeout(() => {
      frameStepIntervalRef.current = setInterval(() => {
        if (!videoRef.current) return;
        if (action === 'stepforward') {
          videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + stepTime);
        } else {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - stepTime);
        }
        setCurrentTime(videoRef.current.currentTime);
      }, 50);
    }, 400);
  };

  const stopFrameStep = () => {
    if (frameStepTimeoutRef.current) clearTimeout(frameStepTimeoutRef.current);
    if (frameStepIntervalRef.current) clearInterval(frameStepIntervalRef.current);
    frameStepTimeoutRef.current = null;
    frameStepIntervalRef.current = null;
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !isScrubbing.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setDuration(e.currentTarget.duration);
    e.currentTarget.playbackRate = speed;
  };

  // Color filters calculation
  const filters = (activeVideo && activeVideo.colorFilters) || DEFAULT_COLOR_FILTERS;
  const rTemp = filters.temp > 0 ? 1.0 + (filters.temp / 100) * 0.3 : 1.0 + (filters.temp / 100) * 0.15;
  const bTemp = filters.temp < 0 ? 1.0 - (filters.temp / 100) * 0.3 : 1.0 - (filters.temp / 100) * 0.15;
  const gTint = 1.0 + (filters.tint / 250);
  const rTint = 1.0 - (filters.tint / 500);
  const bTint = 1.0 - (filters.tint / 500);

  const finalR = (filters.red * rTemp * rTint).toFixed(4);
  const finalG = (filters.green * gTint).toFixed(4);
  const finalB = (filters.blue * bTemp * bTint).toFixed(4);

  const filterId = activeVideo ? `${activeVideo.id}-popout` : 'none';

  return (
    <div 
      ref={rootRef}
      tabIndex={0}
      autoFocus
      className="popout-root" 
      onWheel={handleWheel}
      onDoubleClick={toggleMaximize}
      onClick={() => {
        rootRef.current?.focus();
      }}
      style={{ 
        background: '#000', 
        width: '100vw', 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        position: 'relative',
        overflow: 'hidden',
        outline: 'none',
        cursor: showUI ? 'default' : 'none'
      }}
    >
      <PopoutTitleBar
        showUI={showUI}
        activeVideo={activeVideo}
        toggleMaximize={toggleMaximize}
        handleTitlebarMouseDown={handleTitlebarMouseDown}
      />

      {activeVideo && activeVideo.colorFilters && (
        <ColorFilterDefs
          videoId={filterId}
          finalR={finalR}
          finalG={finalG}
          finalB={finalB}
          alpha={filters.alpha.toString()}
          gamma={filters.gamma}
          negative={filters.negative}
        />
      )}

      {/* Main viewport */}
      <div 
        ref={viewportRef}
        onMouseDown={handleViewportMouseDown}
        onDoubleClick={handleDoubleClickViewport}
        style={{ 
          position: 'relative', 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: zoomScale > 1 ? (isPanning ? 'grabbing' : 'grab') : (isImage ? 'zoom-in' : 'default'),
          userSelect: 'none'
        }}
      >
        {isImage ? (
          <img 
            className="popout-image"
            src={displayUrl} 
            crossOrigin="anonymous"
            draggable="false"
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain', 
              outline: 'none',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale}) ${activeVideo?.flipped ? 'scaleX(-1) ' : ''}rotate(${activeVideo?.rotation || 0}deg)`,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
              filter: activeVideo && activeVideo.colorFilters 
                ? `url(#filter-${filterId}) brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) hue-rotate(${filters.hue}deg)` 
                : undefined
            }} 
            alt="Popped Out Still"
          />
        ) : (
          <video 
            ref={videoRef}
            className="popout-video"
            src={displayUrl} 
            autoPlay 
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => {
              const globalRepeat = localStorage.getItem('cosmo-repeat') || 'folder';
              let currentMode = (activeVideo && activeVideo.repeatMode && activeVideo.repeatMode !== 'none')
                ? activeVideo.repeatMode
                : globalRepeat;
              
              if ((currentMode as any) === 'all') {
                currentMode = 'folder';
              }

              if (currentMode === 'always' || (currentMode === 'folder' && playlist.length <= 1)) {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.play().catch(() => {});
                }
              } else if (currentMode === 'once') {
                if (videoRef.current) {
                  videoRef.current.pause();
                }
              } else if (currentMode === 'none') {
                if (videoRef.current) {
                  videoRef.current.pause();
                }
              } else {
                navigate(1);
              }
            }}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain', 
              outline: 'none',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale}) ${activeVideo?.flipped ? 'scaleX(-1) ' : ''}rotate(${activeVideo?.rotation || 0}deg)`,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
              filter: activeVideo && activeVideo.colorFilters 
                ? `url(#filter-${filterId}) brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) hue-rotate(${filters.hue}deg)` 
                : undefined
            }} 
          />
        )}

        {/* Floating Zoom HUD Badge & Quick Reset */}
        {zoomScale > 1 && !isCropping && (
          <div 
            style={{
              position: 'absolute',
              top: '60px',
              right: '24px',
              zIndex: 90,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(10, 15, 29, 0.85)',
              border: '1px solid var(--accent, #00ff88)',
              borderRadius: '20px',
              padding: '4px 10px',
              boxShadow: '0 4px 15px rgba(0, 255, 136, 0.25)',
              backdropFilter: 'blur(10px)',
              pointerEvents: 'auto'
            }}
          >
            <ZoomIn size={12} style={{ color: 'var(--accent, #00ff88)' }} />
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoomScale(1);
                setPanOffset({ x: 0, y: 0 });
                showHudNotification('ZOOM', '100%');
              }}
              title="Reset Zoom to 100%"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                cursor: 'pointer',
                marginLeft: '2px'
              }}
            >
              <RotateCcw size={10} />
            </button>
          </div>
        )}

        {/* Cropping overlay */}
        {isCropping && activeVideo && (
          <CropOverlay 
            video={activeVideo}
            cropBox={cropBox}
            setCropBox={setCropBox}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            onSave={() => setShowSaveCropOptions(true)}
            onCancel={() => setIsCropping(false)}
          />
        )}
      </div>

      {/* Custom float scrub bar (for video only) */}
      {!isImage && activeVideo && (
        <PopoutScrubber
          currentTime={currentTime}
          duration={duration}
          showUI={showUI}
          scrubTrackRef={scrubTrackRef}
          handleScrubMouseDown={handleScrubMouseDown}
        />
      )}

      {/* Floating Glassmorphic Solo Control Bar */}
      {activeVideo && !isCropping && (
        <PopoutControlBar
          activeVideo={activeVideo}
          isImage={isImage}
          showUI={showUI}
          videoPlaying={videoPlaying}
          setVideoPlaying={setVideoPlaying}
          isSlideshowActive={isSlideshowActive}
          setIsSlideshowActive={setIsSlideshowActive}
          slideshowInterval={slideshowInterval}
          setSlideshowInterval={setSlideshowInterval}
          showHudNotification={showHudNotification}
          startFrameStep={startFrameStep}
          stopFrameStep={stopFrameStep}
          onUpdateVideo={onUpdateVideo}
          volume={volume}
          setVolume={setVolume}
          muted={muted}
          setMuted={setMuted}
          popoutVolumeContainerRef={popoutVolumeContainerRef}
          setColorAdjustId={setColorAdjustId}
          setIsCropping={setIsCropping}
          setCropBox={setCropBox}
          setAspectRatio={setAspectRatio}
          onUpscale={handleUpscale}
          onCloseWindow={() => getCurrentWindow().close()}
        />
      )}

      {/* Floating Notifications Toast */}
      {toast && (
        <div 
          style={{
            position: 'absolute',
            top: '60px',
            background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 255, 136, 0.4)',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '11px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            padding: '10px 20px',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 15px rgba(0, 255, 136, 0.2)',
            zIndex: 500000,
            pointerEvents: 'none',
            textAlign: 'center',
            maxWidth: '80%'
          }}
        >
          {toast}
        </div>
      )}

      {/* Floating HUD notification */}
      {hudData && (
        <div
          style={{
            position: 'absolute',
            bottom: '90px',
            background: 'rgba(22, 17, 12, 0.85)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(0, 255, 136, 0.25)',
            borderRadius: '24px',
            padding: '8px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 999999,
            boxShadow: '0 10px 30px rgba(0,0,0,0.6), 0 0 15px rgba(0,255,136,0.15)',
            letterSpacing: '0.5px',
            pointerEvents: 'none'
          }}
        >
          <span style={{ fontSize: '9px', fontWeight: '900', color: '#00ff88', textTransform: 'uppercase' }}>{hudData.title}</span>
          <div style={{ width: '1px', height: '12px', background: 'rgba(255, 255, 255, 0.15)' }} />
          <span style={{ fontSize: '11px', fontWeight: '800', color: '#fff', textTransform: 'uppercase' }}>{hudData.value}</span>
        </div>
      )}

      {/* Popups and Panels */}
      {colorAdjustId && activeVideo && (
        <ColorAdjustmentPanel
          video={activeVideo}
          onUpdateVideo={onUpdateVideo}
          onClose={() => setColorAdjustId(null)}
          setVideos={mockSetVideos}
          addLog={addLog}
        />
      )}

      <PopoutCropModal
        isOpen={showSaveCropOptions}
        onSaveCrop={handleSaveCrop}
        onClose={() => setShowSaveCropOptions(false)}
      />

      {showSaveUpscaleOptions && upscaleTarget && (
        <SaveUpscaleModal
          isOpen={true}
          target={upscaleTarget}
          onClose={() => setShowSaveUpscaleOptions(false)}
          onExecute={executeUpscale}
        />
      )}

      <PopoutUpscaleOverlay
        upscaleStatus={upscaleStatus}
        lastEnhancedTitle={lastEnhancedTitle}
        upscaleProgressPercent={upscaleProgressPercent}
        upscaleStage={upscaleStage}
        onCancelEnhancement={cancelEnhancement}
      />
    </div>
  );
}
