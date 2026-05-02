import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SWIPE_THRESHOLD, SNAPSHOT_TOAST_DURATION, FPS, STEP_INTERVAL, STEP_DELAY } from '../constants';
import { convertToVideoUrl } from '../utils/videoUtils';
import {
  Play, Pause, Square, RefreshCw, Camera, Repeat, Repeat1,
  Volume2, VolumeX, GripVertical, Maximize2, Minimize2, FolderOpen, X, AlertCircle, ChevronLeft, ChevronRight, Maximize
} from 'lucide-react';
import type { VideoItem, RepeatMode } from '../types';


interface VideoCardProps {
  video: VideoItem;
  globalRepeat: RepeatMode;
  globalSpeed: number;
  fitMode: 'cover' | 'contain';
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  onRemove: () => void;
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
  toggleMasterMute: () => void;
  toggleMasterPlay: () => void;
  onEnded: () => void;
  onContextMenu: (x: number, y: number) => void;
  onDeepFocus: () => void;
  isVisible: boolean;
  setSnapshotDir?: (dir: string) => void;
}

function VideoCardInternal({
  video, globalRepeat, globalSpeed, fitMode,
  onUpdateVideo, onRemove, onLog, onFocus, isFocused, onCloseFocus,
  snapshotDir, setSnapshotDir, globalControl, dragListeners, dragAttributes,
  masterPlaying, masterMuted, globalVolume, masterShowUI, toggleMasterMute, toggleMasterPlay, onEnded, onContextMenu, onDeepFocus,
  quality = 'high', isVisible
}: VideoCardProps & { quality?: 'low' | 'high' }) {
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


  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = globalVolume;
  }, [globalVolume]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(masterPlaying);
  const [muted, setMuted] = useState(masterMuted);
  const [localRepeat, setLocalRepeat] = useState<RepeatMode>(video.repeatMode || 'none');
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
    // If master is overriding, turn it off first
    if (masterMuted) {
      toggleMasterMute();
    }
    // Then toggle individual video
    onUpdateVideo(video.id, { muted: !effectiveMuted });
  };
  
  // Determine effective mute state: master override takes precedence
  const effectiveMuted = masterMuted || video.muted;
  
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = effectiveMuted;
  }, [effectiveMuted]);

   useEffect(() => {
     if (!videoRef.current) return;
     if (video.playing) videoRef.current.play().catch(() => {});
     else videoRef.current.pause();
   }, [video.playing]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = globalSpeed;
  }, [globalSpeed]);

  useEffect(() => {
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
  }, [video.playing, video.url, recovering]);

  const takeSnapshot = useCallback(async () => {
    try {
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
  }, [video.title, video.id, snapshotDir, setSnapshotDir, onLog]);

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
    >
      {isVisible ? (
        <video
          ref={videoRef}
          src={displayUrl}
          crossOrigin="anonymous"
          playsInline
          loop={globalRepeat !== 'none' && (localRepeat === 'always' || globalRepeat === 'always')}
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
            const target = e.target as HTMLVideoElement;
            const friendlyError = "LOAD ERROR";
            setError(friendlyError);
            onLog(`Unit [${video.title}] Error: ${friendlyError}`);
          }}
          style={{ width: '100%', height: '100%', objectFit: fitMode, backgroundColor: '#000' }}
        />
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

      <div className={`video-overlay ${(showControls && !isFocused) && masterShowUI ? 'visible' : 'hidden'}`}>
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
            <span className="unit-title">{video.title}</span>
            <button onClick={onRemove} className="mini-close-btn"><X size={14} /></button>
          </div>
        )}


        {/* Centre: click to toggle play */}
        <div className="overlay-center" onClick={() => onUpdateVideo(video.id, { playing: !video.playing })} />

        {!isFocused && (
          <div className="overlay-footer">
          <div className="scrub-container" onMouseDown={(e) => { isScrubbing.current = true; handleScrub(e); }}>
            <div className="scrub-bar-bg">
              <div ref={progressRef} className="scrub-progress" style={{ width: '0%' }} />
            </div>
            <div ref={handleRef} className="scrub-handle" style={{ left: '0%' }} />
            <div ref={textRef} className="progress-text">0%</div>
          </div>

          <div className="mini-controls">
            <button 
              className="mini-btn" 
              onMouseDown={() => startStep(-1)} 
              onMouseUp={stopStep} 
              onMouseLeave={stopStep} 
              data-tooltip="Prev Frame"
            >
              <ChevronLeft size={14} />
            </button>
            <button className="mini-btn" onClick={() => onUpdateVideo(video.id, { playing: !video.playing })}>
              {video.playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button 
              className="mini-btn" 
              onMouseDown={() => startStep(1)} 
              onMouseUp={stopStep} 
              onMouseLeave={stopStep} 
              data-tooltip="Next Frame"
            >
              <ChevronRight size={14} />
            </button>
            <button className="mini-btn" onClick={takeSnapshot} data-tooltip="Snapshot"><Camera size={14} /></button>
             <button className="mini-btn" onClick={handleMuteToggle}>
               {effectiveMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
             </button>
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
