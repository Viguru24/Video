import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SWIPE_THRESHOLD, SNAPSHOT_TOAST_DURATION, FPS, STEP_INTERVAL, STEP_DELAY } from '../constants';
import { convertToVideoUrl, isValidPictureExtension } from '../utils/videoUtils';
import {
  Play, Pause, Square, RefreshCw, Camera, Repeat, Repeat1,
  Volume2, VolumeX, GripVertical, Maximize2, Minimize2, FolderOpen, X, AlertCircle, ChevronLeft, ChevronRight, Maximize, CheckCircle2, Trash2
} from 'lucide-react';
import type { VideoItem, RepeatMode } from '../types';


interface VideoCardProps {
  video: VideoItem;
  globalRepeat: RepeatMode;
  globalSpeed: number;
  fitMode: 'cover' | 'contain';
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  onRemove: (id: string) => void;
  onAnnihilate: (id: string) => void;
  onLog: (msg: string) => void;
  onFocus: () => void;
  isFocused: boolean;
  onCloseFocus: () => void;
  snapshotDir?: string;
  globalControl: string | null;
  dragListeners?: Record<string, any>;
  dragAttributes?: Record<string, any>;
  masterPlaying: boolean;
  masterMuted: boolean;
  globalVolume: number;
  masterShowUI: boolean;
  toggleMasterMute: (soloId?: string) => void;
  toggleMasterPlay: () => void;
  onEnded: () => void;
  onContextMenu: (x: number, y: number) => void;
  onDeepFocus: () => void;
  isVisible: boolean;
  setSnapshotDir?: (dir: string) => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  selectionMode?: boolean;
}

function VideoCardInternal({
  video, globalRepeat, globalSpeed, fitMode,
  onUpdateVideo, onRemove, onLog, onFocus, isFocused, onCloseFocus,
  snapshotDir, setSnapshotDir, globalControl, dragListeners, dragAttributes,
  masterPlaying, masterMuted, globalVolume, masterShowUI, toggleMasterMute, toggleMasterPlay, onEnded, onContextMenu, onDeepFocus,
  quality = 'high', isVisible, isSelected, onToggleSelect, selectionMode
}: VideoCardProps & { quality?: 'low' | 'high' }) {
  const unitRepeatMode = video.repeatMode || 'none';
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTime = useRef<number>(0);

  // Preserve time during hibernation
  useEffect(() => {
    if (!isVisible && videoRef.current) {
      lastTime.current = videoRef.current.currentTime;
    }
  }, [isVisible]);

  // DYNAMIC QUALITY ENGINE (v4) — Native Asset Protocol
  const displayUrl = React.useMemo(() => {
    return convertToVideoUrl(video);
  }, [video.realPath, video.url]);

  // Reset playback position when source changes (folder cycling)
  useEffect(() => {
    lastTime.current = 0;
  }, [displayUrl]);


  const isImage = React.useMemo(() => {
    return isValidPictureExtension(video.realPath || video.url);
  }, [video.realPath, video.url]);

  useEffect(() => {
    if (!isImage && videoRef.current) videoRef.current.volume = globalVolume;
  }, [globalVolume, isImage]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(masterPlaying);
  const [recovering, setRecovering] = useState(false);

  const [snapshotToast, setSnapshotToast] = useState<number | null>(null);
  const [isLocalFS, setIsLocalFS] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    if (isHovered || isInteracting || isFocused) {
      setShowControls(true);
    } else {
      setShowControls(false);
    }
  }, [isHovered, isInteracting, isFocused]);

  const [duration, setDuration] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);


  const handleTimeUpdate = () => {
    if (videoRef.current) {
      // Direct DOM manipulation to bypass React render cycle for 60FPS smoothness
      const duration = videoRef.current.duration;
      const currentTime = videoRef.current.currentTime;
      if (duration > 0) {
        const p = (currentTime / duration) * 100;
        const val = isNaN(p) ? 0 : p;
        if (progressRef.current) progressRef.current.style.width = `${val}%`;
        if (handleRef.current) handleRef.current.style.left = `${val}%`;
        if (textRef.current) textRef.current.textContent = `${Math.round(val)}%`;
      }
    }
  };


  const isScrubbing = useRef(false);
  const stepInterval = useRef<NodeJS.Timeout | null>(null);

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
  }, [video.id]);


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
  }, [handleScrub]);


  const stepFrame = (dir: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += dir * (1 / FPS);
      onUpdateVideo(video.id, { playing: false });
    }
  };

  const startStep = (dir: number) => {
    setIsInteracting(true);
    stepFrame(dir);

    if (stepInterval.current) clearInterval(stepInterval.current);
    stepInterval.current = setTimeout(() => {
      stepInterval.current = setInterval(() => {
        stepFrame(dir);
      }, STEP_INTERVAL);

    }, STEP_DELAY);
  };

  const stopStep = () => {
    setIsInteracting(false);

    if (stepInterval.current) {
      clearTimeout(stepInterval.current);
      clearInterval(stepInterval.current);
      stepInterval.current = null;
    }
  };

  useEffect(() => {
    const handleFS = () => setIsLocalFS(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFS);
    return () => document.removeEventListener('fullscreenchange', handleFS);
  }, []);

  const handleMuteToggle = () => {
    // If master is overriding, turn it off first but solo this video
    if (masterMuted) {
      toggleMasterMute(video.id);
    } else {
      // Then toggle individual video
      onUpdateVideo(video.id, { muted: !video.muted });
    }
  };
  
  // Determine effective mute state: master override takes precedence
  const effectiveMuted = masterMuted || video.muted;
  
  useEffect(() => {
    if (isImage || !videoRef.current) return;
    videoRef.current.muted = effectiveMuted;
  }, [effectiveMuted, isImage]);

   useEffect(() => {
     if (isImage || !videoRef.current) return;
     if (video.playing) videoRef.current.play().catch(() => {});
     else videoRef.current.pause();
   }, [video.playing, isImage]);

  useEffect(() => {
    if (isImage) return;
    const v = videoRef.current;
    if (v) v.playbackRate = globalSpeed;
  }, [globalSpeed, isImage]);

  // RECOVERY MONITOR: Only for video elements
  useEffect(() => {
    if (isImage) return;
    const v = videoRef.current;
    if (!v) return;
    const monitor = setInterval(() => {
      if (video.playing && v.paused && !v.ended && v.readyState < 2 && !recovering) {
        setRecovering(true);
        setError("RECOVERING...");
        setTimeout(() => {
          v.load();
          setError(null);
          setRecovering(false);
        }, 3000);
      }
    }, 5000);
    return () => clearInterval(monitor);
  }, [video.playing, video.url, recovering, isImage]);

  // IMAGE FOLDER NAVIGATION: Cycle through folder files for image units
  const navigateImageFolder = useCallback((dir: number) => {
    if (!video.folderFiles || video.folderFiles.length <= 1) return;
    const currentIdx = video.currentIdx || 0;
    const nextIdx = (currentIdx + dir + video.folderFiles.length) % video.folderFiles.length;
    const nextFile = video.folderFiles[nextIdx];
    if (nextFile) {
      onUpdateVideo(video.id, {
        currentIdx: nextIdx,
        url: nextFile.url,
        realPath: (nextFile as any).path || nextFile.url,
        title: nextFile.name
      });
      onLog(`Image Navigate [${video.title}] → ${nextFile.name}`);
    }
  }, [video.id, video.folderFiles, video.currentIdx, video.title, onUpdateVideo, onLog]);

  const takeSnapshot = useCallback(async () => {
    try {
      // For images, snapshot = copy the source file
      if (isImage) {
        if (video.realPath) {
          let dirToUse = snapshotDir;
          if (!dirToUse || dirToUse.trim() === "") {
            onLog("SYSTEM: No snapshot directory set. Please select a destination.");
            const newDir = await invoke<string | null>('select_folder_cmd');
            if (newDir) {
              dirToUse = newDir;
              if (setSnapshotDir) setSnapshotDir(newDir);
              await invoke('save_persistence', { key: 'cosmo-snap-dir', data: newDir });
              onLog(`SNAPSHOT DESTINATION SET: ${newDir}`);
            } else {
              onLog("ERROR: Snapshot aborted (No directory selected)");
              return;
            }
          }
          // Use the image element to capture
          const imgEl = document.querySelector(`[data-id="${video.id}"] img`) as HTMLImageElement;
          if (imgEl) {
            const c = document.createElement('canvas');
            c.width = imgEl.naturalWidth;
            c.height = imgEl.naturalHeight;
            const ctx = c.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(imgEl, 0, 0, c.width, c.height);
            const base64 = c.toDataURL('image/png');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `Cosmo_${video.title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;
            const path = await invoke<string>('save_snapshot', { base64Data: base64, fileName, customDir: dirToUse });
            onLog(`SUCCESS: Snapshot saved to ${path.split(/[\\/]/).pop()}`);
            const toastId = Date.now();
            setSnapshotToast(toastId);
            setTimeout(() => setSnapshotToast(current => current === toastId ? null : current), SNAPSHOT_TOAST_DURATION);
          }
        }
        return;
      }

      const v = videoRef.current;
      if (!v || v.videoWidth === 0) return;

      let dirToUse = snapshotDir;
      // ENFORCEMENT: Force directory selection if not already set
      if (!dirToUse || dirToUse.trim() === "") {
         onLog("SYSTEM: No snapshot directory set. Please select a destination.");
         const newDir = await invoke<string | null>('select_folder_cmd');
         if (newDir) {
            dirToUse = newDir;
            if (setSnapshotDir) setSnapshotDir(newDir);
            // Save immediately for persistence robustness
            await invoke('save_persistence', { key: 'cosmo-snap-dir', data: newDir });
            onLog(`SNAPSHOT DESTINATION SET: ${newDir}`);
         } else {
            onLog("ERROR: Snapshot aborted (No directory selected)");
            return;
         }
      }

      const c = document.createElement('canvas');
      c.width = v.videoWidth; 
      c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const base64 = c.toDataURL('image/png');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Cosmo_${video.title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;

      const path = await invoke<string>('save_snapshot', {
        base64Data: base64,
        fileName: fileName,
        customDir: dirToUse
      });

      onLog(`SUCCESS: Snapshot saved to ${path.split(/[\\/]/).pop()}`);
      
       // TRIGGER NOTIFICATION
       const toastId = Date.now();
       setSnapshotToast(toastId);
       setTimeout(() => {
         setSnapshotToast(current => current === toastId ? null : current);
       }, SNAPSHOT_TOAST_DURATION);

    } catch (err) { 
      onLog(`CRITICAL ERROR: Snapshot failed - ${err}`); 
    }
  }, [video.title, video.id, video.realPath, snapshotDir, setSnapshotDir, onLog, isImage]);

  useEffect(() => {
    if (!globalControl) return;
    const [type, id] = globalControl.split('-');
    if (id !== video.id) return;

    if (type === 'snapshot') takeSnapshot();
    if (type === 'stop') {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [globalControl, video.id, takeSnapshot]);

  const touchStart = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const touchEnd = e.changedTouches[0].clientY;
    const deltaY = touchStart.current - touchEnd;
    
    // Threshold of 50px for a swipe
    if (Math.abs(deltaY) > SWIPE_THRESHOLD) {
      if (deltaY > 0 && !isFocused) {
        // Swipe Up -> Expand
        onDeepFocus();
      } else if (deltaY < 0 && isFocused) {
        // Swipe Down -> Collapse
        onDeepFocus();
      }
    }
    touchStart.current = null;
  };


  return (
    <div
      className={`video-card ${recovering ? 'recovering' : ''} ${isFocused ? 'focused' : ''} ${showControls ? 'ui-visible' : 'ui-hidden'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={onDeepFocus}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
      data-id={video.id}
      style={{
        border: (selectionMode && isSelected) ? '2px solid var(--accent)' : undefined,
        boxShadow: (selectionMode && isSelected) ? '0 0 20px rgba(0,255,136,0.3)' : undefined
      }}
    >
      {isVisible ? (
        isImage ? (
          <img
            src={displayUrl}
            alt={video.title}
            style={{ width: '100%', height: '100%', objectFit: fitMode, backgroundColor: '#000' }}
          />
        ) : (
          <video
            ref={videoRef}
            src={displayUrl}
            crossOrigin="anonymous"
            playsInline
            loop={true}
            muted={effectiveMuted}
            onEnded={onEnded}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              setDuration(videoRef.current?.duration || 0);
              if (lastTime.current > 0 && videoRef.current) {
                videoRef.current.currentTime = lastTime.current;
              }
              setError(null);
              
              if (video.playing && videoRef.current) {
                videoRef.current.play().catch(e => console.warn("Autoplay failed:", e));
              }
            }}
            onError={(e) => {
              const friendlyError = "LOAD ERROR";
              setError(friendlyError);
              onLog(`Unit [${video.title}] Error: ${friendlyError}`);
            }}
            style={{ width: '100%', height: '100%', objectFit: fitMode, backgroundColor: '#000' }}
          />
        )
      ) : (
        <div className="video-hibernate">
          <div className="hibernate-shimmer" />
          <div className="hibernate-label">HIBERNATING...</div>
        </div>
      )}

      {error && (
        <div className="unit-error-overlay">
          <AlertCircle size={20} color="var(--danger)" />
          <p>{error}</p>
          <button className="retry-btn" onClick={() => { videoRef.current?.load(); setError("RETRYING..."); }}>
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      {snapshotToast && (
        <div key={snapshotToast} className="snapshot-toast">SNAPSHOT SAVED</div>
      )}

      <div className={`video-overlay ${(selectionMode || (showControls && !isFocused)) && masterShowUI ? 'visible' : 'hidden'}`}>
        {selectionMode && (
          <div 
            className={`selection-indicator ${isSelected ? 'selected' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          >
            {isSelected ? <CheckCircle2 size={18} fill="var(--accent)" color="black" /> : <div className="indicator-empty" />}
          </div>
        )}
        {isFocused && (
          <div className="focused-exit-overlay">
            <button 
              className="exit-focus-btn" 
              onClick={() => onDeepFocus(video.id)} 
              data-tooltip="Exit Solo Mode"
            >
              <Minimize2 size={18} />
            </button>
          </div>
        )}

        {!isFocused && (
          <div className="overlay-header">
            <div className="drag-handle-mini" {...dragListeners} {...dragAttributes}>
              <GripVertical size={14} />
            </div>
            <div className="header-meta">
              <span className="unit-id">{String(video.id).slice(0, 4)}</span>
              <span className="unit-title" title={video.title}>{video.title}</span>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); onRemove(video.id); }} 
              className="premium-close-btn"
              data-tooltip="DECOMMISSION UNIT"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Centre: click to toggle play or select */}
        <div className="overlay-center" onClick={() => {
          if (selectionMode && onToggleSelect) {
            onToggleSelect();
          } else if (!isImage) {
            onUpdateVideo(video.id, { playing: !video.playing });
          }
        }}>
          
          <motion.div 
            initial={false}
            animate={{ opacity: showControls ? 1 : 0, scale: showControls ? 1 : 0.8 }}
            className="play-indicator-subtle"
          >
             {!selectionMode && !isImage && (video.playing ? <Pause size={24} fill="rgba(255,255,255,0.4)" color="transparent" /> : <Play size={24} fill="rgba(255,255,255,0.4)" color="transparent" />)}
          </motion.div>
        </div>

        {!isFocused && (
          <div className="overlay-footer">
            {/* SCRUB BAR: Video only */}
            {!isImage && (
              <div 
                className="scrub-container" 
                onMouseDown={(e) => { isScrubbing.current = true; handleScrub(e); }}
              >
                <div className="scrub-bar-bg">
                  <div ref={progressRef} className="scrub-progress" style={{ width: '0%' }} />
                </div>
                <div ref={handleRef} className="scrub-handle" style={{ left: '0%' }} />
                <div ref={textRef} className="progress-text">0%</div>
              </div>
            )}

            {/* IMAGE FOLDER COUNTER */}
            {isImage && video.folderFiles && video.folderFiles.length > 1 && (
              <div className="image-counter" style={{ fontSize: '10px', opacity: 0.6, textAlign: 'center', padding: '2px 0', letterSpacing: '1px' }}>
                {(video.currentIdx || 0) + 1} / {video.folderFiles.length}
              </div>
            )}

            <div className="mini-controls">
              {isImage ? (
                /* IMAGE CONTROLS */
                <>
                  <button 
                    className="mini-btn" 
                    onClick={() => navigateImageFolder(-1)}
                    data-tooltip="Previous Image"
                    disabled={!video.folderFiles || video.folderFiles.length <= 1}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  
                  <button 
                    className="mini-btn" 
                    onClick={() => navigateImageFolder(1)}
                    data-tooltip="Next Image"
                    disabled={!video.folderFiles || video.folderFiles.length <= 1}
                  >
                    <ChevronRight size={14} />
                  </button>

                  <div className="mini-divider" />

                  <button className="mini-btn" onClick={takeSnapshot} data-tooltip="Save Copy"><Camera size={14} /></button>
                  <button className="mini-btn" onClick={onDeepFocus} data-tooltip="Solo Mode"><Maximize2 size={14} /></button>
                  
                  <div className="mini-divider" />
                  
                  <button 
                    className="mini-btn danger-hover" 
                    onClick={(e) => { e.stopPropagation(); onAnnihilate(video.id); }}
                    title="Move to Recycle Bin"
                    data-tooltip="Recycle Bin"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                /* VIDEO CONTROLS */
                <>
                  <button 
                    className="mini-btn" 
                    onMouseDown={() => startStep(-1)} 
                    onMouseUp={stopStep} 
                    onMouseLeave={stopStep} 
                  >
                    <ChevronLeft size={14} />
                  </button>
                  
                  <button 
                    className="mini-btn highlight" 
                    onClick={() => onUpdateVideo(video.id, { playing: !video.playing })}
                  >
                    {video.playing ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
                  </button>
                  
                  <button 
                    className="mini-btn" 
                    onMouseDown={() => startStep(1)} 
                    onMouseUp={stopStep} 
                    onMouseLeave={stopStep} 
                  >
                    <ChevronRight size={14} />
                  </button>

                  <div className="mini-divider" />

                  <button className="mini-btn" onClick={takeSnapshot}><Camera size={14} /></button>
                  <button className="mini-btn" onClick={handleMuteToggle}>
                    {effectiveMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  
                  <button 
                    className={`mini-btn ${unitRepeatMode === 'always' ? 'active-accent' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onUpdateVideo(video.id, { repeatMode: unitRepeatMode === 'always' ? 'none' : 'always' }); }}
                  >
                    <Repeat1 size={14} />
                  </button>
                  
                  <button className="mini-btn" onClick={onDeepFocus}><Maximize2 size={14} /></button>
                  
                  <div className="mini-divider" />
                  
                  <button 
                    className="mini-btn danger-hover" 
                    onClick={(e) => { e.stopPropagation(); onAnnihilate(video.id); }}
                    title="Move to Recycle Bin"
                    data-tooltip="Recycle Bin"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
    </div>
  </div>
  );
}
class UnitErrorBoundary extends React.Component<{ children: React.ReactNode, id: string }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode, id: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="video-card ui-visible" style={{ border: '2px solid var(--danger)', padding: 10, background: '#000000' }}>
          <div className="unit-error-overlay" style={{ position: 'relative', height: '100%' }}>
            <AlertCircle size={24} color="var(--danger)" />
            <p style={{ margin: '10px 0', fontSize: 12, wordBreak: 'break-all' }}>UNIT CRASH: {this.state.error?.message}</p>
            <button className="retry-btn" onClick={() => this.setState({ hasError: false, error: null })}>
              <RefreshCw size={14} /> RECOVER
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const VideoCard = React.memo((props: any) => (
  <UnitErrorBoundary id={props.video.id}>
    <VideoCardInternal {...props} />
  </UnitErrorBoundary>
));
