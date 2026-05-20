import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { ResizeHandles } from './components/ResizeHandles';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion, AnimatePresence } from 'framer-motion';
import type { VideoItem, RepeatMode, TelemetryData } from './types';
import { VideoCard } from './components/VideoCard';
import { SortableVideoCard } from './components/SortableVideoCard';
import { VideoGrid } from './components/VideoGrid';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ControlBar } from './components/ControlBar';
import { useStore } from './store/useStore';
import { ClockDisplay } from './components/ClockDisplay';
import { ContextMenu } from './components/ContextMenu';
const SymphonyWorkshop = lazy(() => import('./components/SymphonyWorkshop').then(m => ({ default: m.SymphonyWorkshop })));
const HelpModal = lazy(() => import('./components/HelpModal').then(m => ({ default: m.HelpModal })));
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy
} from '@dnd-kit/sortable';
import { Minimize2, CheckCircle2, Search, LayoutGrid, Zap, Trash2, RotateCcw, RefreshCw, Bookmark, Layers, Monitor, Plus, ListRestart, Gauge, Volume2, Pause, Play, VolumeX, Repeat, Repeat1, Eye, EyeOff, Settings, X, ChevronLeft, ChevronRight, ChevronDown, Camera, AlertCircle } from 'lucide-react';
import { useWorkspacePersistence } from './hooks/useWorkspacePersistence';
import { useWorkspaceControls } from './hooks/useWorkspaceControls';
import { useIngestion } from './hooks/useIngestion';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTelemetry } from './hooks/useTelemetry';
import { useSessionControl } from './hooks/useSessionControl';
import { useLayoutOrchestration } from './hooks/useLayoutOrchestration';
import { usePlaybackSync } from './hooks/usePlaybackSync';
import { TELEMETRY_INTERVAL, ROW_THRESHOLD_PX, ROW_MATCH_THRESHOLD, LAYOUT_CALC_DELAY, MIN_ZOOM, MAX_ZOOM, SWIPE_THRESHOLD, DRAG_ACTIVATION_DISTANCE, PERSISTENCE_DEBOUNCE, FPS, STEP_INTERVAL, STEP_DELAY, SNAPSHOT_TOAST_DURATION, SNAPSHOT_THUMBNAIL_DURATION, IMMERSIVE_HIDE_DELAY } from './constants';
import { 
  convertToVideoUrl, 
  toRealPath,
  isValidVideoExtension, 
  isValidPictureExtension,
  isValidMediaExtension,
  getFileNameFromPath,
  toCosmoUrl
} from './utils/videoUtils';
import { handleError, isAbortError } from './utils/errorHandler';

function ClockDisplayWrapper() {
  return <ClockDisplay />;
}

// TELEMETRY SYSTEM (Isolated) - with AbortController to prevent request pileup
function TelemetrySystem({ videosCount, isPopout }: { videosCount: number, isPopout: boolean }) {
  // TELEMETRY ENGINE (v4) — Modular Hook
  const telemetry = useTelemetry(isPopout);

  return <TelemetryPanel videosCount={videosCount} telemetry={telemetry} />;
}

// DIAGNOSTIC ERROR BOUNDARY
function ErrorFallback({ error }: { error: Error }) {
  return (
    <div style={{ background: '#7f1d1d', color: '#fef2f2', padding: 40, height: '100vh', fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>CRITICAL SYSTEM ERROR</h1>
      <pre style={{ background: '#000', padding: 20, borderRadius: 8, overflow: 'auto' }}>
        {error.message}
      </pre>
      <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: '10px 20px', background: '#fff', color: '#7f1d1d', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
        RETRY SYSTEM BOOT
      </button>
    </div>
  );
}

function CropOverlay({
  video,
  cropBox,
  setCropBox,
  aspectRatio,
  setAspectRatio,
  onSave,
  onCancel
}: {
  video: VideoItem;
  cropBox: { x: number; y: number; w: number; h: number };
  setCropBox: React.Dispatch<React.SetStateAction<{ x: number; y: number; w: number; h: number }>>;
  aspectRatio: 'free' | '1:1' | '16:9' | '4:3';
  setAspectRatio: (val: 'free' | '1:1' | '16:9' | '4:3') => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const img = new Image();
    img.src = convertToVideoUrl(video);
    img.onload = () => {
      setImgSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    };
  }, [video]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          w: containerRef.current.clientWidth || 800,
          h: containerRef.current.clientHeight || 600
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const imgRatio = imgSize.w / imgSize.h;
  const containerRatio = containerSize.w / containerSize.h;

  let visibleW = containerSize.w;
  let visibleH = containerSize.h;
  let offsetX = 0;
  let offsetY = 0;

  if (imgRatio > containerRatio) {
    visibleW = containerSize.w;
    visibleH = containerSize.w / imgRatio;
    offsetY = (containerSize.h - visibleH) / 2;
  } else {
    visibleH = containerSize.h;
    visibleW = containerSize.h * imgRatio;
    offsetX = (containerSize.w - visibleW) / 2;
  }

  const [isDragging, setIsDragging] = useState(false);
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 });

  const handlePointerDown = (e: React.PointerEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragHandle(handle);
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: cropBox.x,
      boxY: cropBox.y,
      boxW: cropBox.w,
      boxH: cropBox.h
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragHandle) return;
    e.preventDefault();
    e.stopPropagation();

    const deltaX = ((e.clientX - dragStart.current.mouseX) / visibleW) * 100;
    const deltaY = ((e.clientY - dragStart.current.mouseY) / visibleH) * 100;

    let newX = dragStart.current.boxX;
    let newY = dragStart.current.boxY;
    let newW = dragStart.current.boxW;
    let newH = dragStart.current.boxH;

    const targetRatio = aspectRatio === '1:1' ? 1 : aspectRatio === '16:9' ? 16 / 9 : aspectRatio === '4:3' ? 4 / 3 : null;

    if (dragHandle === 'move') {
      newX = Math.max(0, Math.min(100 - newW, dragStart.current.boxX + deltaX));
      newY = Math.max(0, Math.min(100 - newH, dragStart.current.boxY + deltaY));
    } else {
      if (dragHandle.includes('left')) {
        const maxX = dragStart.current.boxX + dragStart.current.boxW - 10;
        newX = Math.max(0, Math.min(maxX, dragStart.current.boxX + deltaX));
        newW = dragStart.current.boxX + dragStart.current.boxW - newX;
      }
      if (dragHandle.includes('right')) {
        newW = Math.max(10, Math.min(100 - dragStart.current.boxX, dragStart.current.boxW + deltaX));
      }
      if (dragHandle.includes('top')) {
        const maxY = dragStart.current.boxY + dragStart.current.boxH - 10;
        newY = Math.max(0, Math.min(maxY, dragStart.current.boxY + deltaY));
        newH = dragStart.current.boxY + dragStart.current.boxH - newY;
      }
      if (dragHandle.includes('bottom')) {
        newH = Math.max(10, Math.min(100 - dragStart.current.boxY, dragStart.current.boxH + deltaY));
      }

      if (targetRatio) {
        if (dragHandle.includes('left') || dragHandle.includes('right')) {
          newH = newW / targetRatio;
          if (dragHandle.includes('top')) {
            newY = dragStart.current.boxY + dragStart.current.boxH - newH;
          }
        } else {
          newW = newH * targetRatio;
          if (dragHandle.includes('left')) {
            newX = dragStart.current.boxX + dragStart.current.boxW - newW;
          }
        }

        if (newX < 0) {
          newX = 0;
          newW = dragStart.current.boxX + dragStart.current.boxW;
          newH = newW / targetRatio;
          if (dragHandle.includes('top')) {
            newY = dragStart.current.boxY + dragStart.current.boxH - newH;
          }
        }
        if (newY < 0) {
          newY = 0;
          newH = dragStart.current.boxY + dragStart.current.boxH;
          newW = newH * targetRatio;
          if (dragHandle.includes('left')) {
            newX = dragStart.current.boxX + dragStart.current.boxW - newW;
          }
        }
        if (newX + newW > 100) {
          newW = 100 - newX;
          newH = newW / targetRatio;
        }
        if (newY + newH > 100) {
          newH = 100 - newY;
          newW = newH * targetRatio;
        }
      }
    }

    setCropBox({
      x: Math.round(newX * 10) / 10,
      y: Math.round(newY * 10) / 10,
      w: Math.round(newW * 10) / 10,
      h: Math.round(newH * 10) / 10
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setIsDragging(false);
      setDragHandle(null);
    }
  };

  return (
    <div 
      ref={containerRef}
      onWheel={e => { e.preventDefault(); e.stopPropagation(); }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        zIndex: 200000
      }}
    >
      <div
        id="crop-visible-container"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'absolute',
          left: `${offsetX}px`,
          top: `${offsetY}px`,
          width: `${visibleW}px`,
          height: `${visibleH}px`,
          touchAction: 'none',
          userSelect: 'none'
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${cropBox.y}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: `${100 - (cropBox.y + cropBox.h)}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: `${cropBox.y}%`, left: 0, width: `${cropBox.x}%`, height: `${cropBox.h}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: `${cropBox.y}%`, right: 0, width: `${100 - (cropBox.x + cropBox.w)}%`, height: `${cropBox.h}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />

        <div
          style={{
            position: 'absolute',
            left: `${cropBox.x}%`,
            top: `${cropBox.y}%`,
            width: `${cropBox.w}%`,
            height: `${cropBox.h}%`,
            border: '2px solid var(--accent)',
            boxShadow: '0 0 20px rgba(0, 255, 136, 0.3)',
            cursor: 'grab'
          }}
          onPointerDown={(e) => handlePointerDown(e, 'move')}
        >
          <div style={{ position: 'absolute', left: '33.33%', top: 0, width: 0, height: '100%', borderLeft: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: '66.66%', top: 0, width: 0, height: '100%', borderLeft: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '33.33%', left: 0, height: 0, width: '100%', borderTop: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '66.66%', left: 0, height: 0, width: '100%', borderTop: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />

          <div
            onPointerDown={(e) => handlePointerDown(e, 'top-left')}
            style={{ position: 'absolute', top: '-6px', left: '-6px', width: '12px', height: '12px', background: 'var(--accent)', border: '2px solid #000', borderRadius: '50%', cursor: 'nwse-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'top-right')}
            style={{ position: 'absolute', top: '-6px', right: '-6px', width: '12px', height: '12px', background: 'var(--accent)', border: '2px solid #000', borderRadius: '50%', cursor: 'nesw-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'bottom-left')}
            style={{ position: 'absolute', bottom: '-6px', left: '-6px', width: '12px', height: '12px', background: 'var(--accent)', border: '2px solid #000', borderRadius: '50%', cursor: 'nesw-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'bottom-right')}
            style={{ position: 'absolute', bottom: '-6px', right: '-6px', width: '12px', height: '12px', background: 'var(--accent)', border: '2px solid #000', borderRadius: '50%', cursor: 'nwse-resize', zIndex: 10 }}
          />

          <div
            onPointerDown={(e) => handlePointerDown(e, 'top')}
            style={{ position: 'absolute', top: '-6px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '8px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '4px', cursor: 'ns-resize', zIndex: 9 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'bottom')}
            style={{ position: 'absolute', bottom: '-6px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '8px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '4px', cursor: 'ns-resize', zIndex: 9 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'left')}
            style={{ position: 'absolute', left: '-6px', top: '50%', transform: 'translateY(-50%)', height: '20px', width: '8px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '4px', cursor: 'ew-resize', zIndex: 9 }}
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'right')}
            style={{ position: 'absolute', right: '-6px', top: '50%', transform: 'translateY(-50%)', height: '20px', width: '8px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: '4px', cursor: 'ew-resize', zIndex: 9 }}
          />
        </div>
      </div>

      <div
        className="presets-hud"
        style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 10, 12, 0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '30px',
          padding: '8px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
          zIndex: 200001,
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Aspect Ratio:</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['free', '1:1', '16:9', '4:3'] as const).map(ratio => (
            <button
              key={ratio}
              onClick={() => {
                setAspectRatio(ratio);
                const targetRatio = ratio === '1:1' ? 1 : ratio === '16:9' ? 16/9 : ratio === '4:3' ? 4/3 : null;
                if (targetRatio) {
                  const newH = cropBox.w / targetRatio;
                  if (cropBox.y + newH <= 100) {
                    setCropBox(p => ({ ...p, h: newH }));
                  } else {
                    const newW = cropBox.h * targetRatio;
                    if (cropBox.x + newW <= 100) {
                      setCropBox(p => ({ ...p, w: newW }));
                    } else {
                      const fitW = 60;
                      const fitH = fitW / targetRatio;
                      setCropBox({
                        x: (100 - fitW) / 2,
                        y: (100 - fitH) / 2,
                        w: fitW,
                        h: fitH
                      });
                    }
                  }
                }
              }}
              style={{
                background: aspectRatio === ratio ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: aspectRatio === ratio ? '#000' : '#fff',
                padding: '4px 12px',
                borderRadius: '15px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {ratio.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255, 255, 255, 0.15)' }} />

        <button
          onClick={onSave}
          style={{
            background: 'var(--accent)',
            border: 'none',
            color: '#000',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 0 15px rgba(0, 255, 136, 0.3)',
            transition: 'all 0.2s'
          }}
        >
          SAVE CROP
        </button>

        <button
          onClick={onCancel}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}

function PopoutPlayer({ url }: { url: string }) {
  const isImage = isValidPictureExtension((url || '').split('?')[0]);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Automatic fullscreen on mount
  useEffect(() => {
    const startFullscreen = async () => {
      try {
        await getCurrentWindow().setFullscreen(true);
      } catch (err) {
        console.error("Failed to enter fullscreen:", err);
      }
    };
    startFullscreen();
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      
      if (key === ' ') {
        // Stop and start the video
        e.preventDefault();
        e.stopPropagation();
        if (!isImage && videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play().catch(err => console.error("Playback failed:", err));
          } else {
            videoRef.current.pause();
          }
        }
      } else if (key === 'escape') {
        // Escape button takes it back to a slightly smaller version (exits fullscreen)
        e.preventDefault();
        e.stopPropagation();
        try {
          await getCurrentWindow().setFullscreen(false);
        } catch (err) {
          console.error("Failed to exit fullscreen:", err);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isImage]);

  return (
    <div className="popout-root" style={{ background: '#000', width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {isImage ? (
        <img 
          className="popout-image"
          src={url} 
          style={{ width: '100%', height: '100%', objectFit: 'contain', outline: 'none' }} 
          alt="Popped Out Still"
        />
      ) : (
        <video 
          ref={videoRef}
          className="popout-video"
          src={url} 
          autoPlay 
          controls 
          style={{ width: '100%', height: '100%', objectFit: 'contain', outline: 'none' }} 
        />
      )}
      <button 
        onClick={() => getCurrentWindow().close()}
        style={{ position: 'absolute', top: '20px', right: '20px', background: '#222', border: '1px solid #444', color: '#fff', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', zIndex: 100 }}
      >
        {isImage ? 'Close Window' : 'Stop Stream'}
      </button>
    </div>
  );
}

export default function App() {
  const { mediaMode, setMediaMode, theme, setTheme, alwaysOnTop, setAlwaysOnTop, isFS, setIsFS, masterPlaying, setMasterPlaying, masterMuted, setMasterMuted, globalVolume, setGlobalVolume, speed, setSpeed, globalRepeat, setGlobalRepeat, fitMode, setFitMode, zoom, setZoom, immersive, setImmersive, masterShowUI, setMasterShowUI, selectedIds, setSelectedIds, selectionMode, setSelectionMode, renameHistory, setRenameHistory, addToRenameHistory, aiHardwareStatus, setAiHardwareStatus } = useStore();
  
  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      try {
        const res = await invoke<string>('get_ai_hardware_status');
        if (active) {
          setAiHardwareStatus(res);
          if (res === 'Detecting...') {
            setTimeout(checkStatus, 1000);
          }
        }
      } catch (e) {
        console.error("Failed to query hardware status:", e);
      }
    };
    checkStatus();
    return () => {
      active = false;
    };
  }, [setAiHardwareStatus]);

  const urlParams = new URLSearchParams(window.location.search);
  const isPopout = urlParams.get('popout') === 'true';
  const popoutUrl = urlParams.get('url');

  const [globalControl, setGlobalControl] = useState<string | null>(null);

  // IMMERSIVE CROPPING SYSTEM
  const [isCropping, setIsCropping] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 15, y: 15, w: 70, h: 70 });
  const [aspectRatio, setAspectRatio] = useState<'free' | '1:1' | '16:9' | '4:3'>('free');
  const [showSaveCropOptions, setShowSaveCropOptions] = useState(false);
  const [showSaveUpscaleOptions, setShowSaveUpscaleOptions] = useState(false);
  const [upscaleTarget, setUpscaleTarget] = useState<VideoItem | null>(null);
  const [isAiEnhancing, setIsAiEnhancing] = useState(false);
  const [aiServerOffline, setAiServerOffline] = useState(false);
  const [upscaleStatus, setUpscaleStatus] = useState<'idle' | 'enhancing' | 'success' | 'failed'>('idle');
  const [lastEnhancedTitle, setLastEnhancedTitle] = useState('');
  const [sessionDuration, setSessionDuration] = useState(0); 
  
  
  const [motionActive, setMotionActive] = useState(false);
  
  const [showLogs, setShowLogs] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragFile, setDragFile] = useState(false);
  
  
  const [masterMutedOverride, setMasterMutedOverride] = useState(false);
  
  

  const [showSettings, setShowSettings] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  
  const [showSymphonyWorkshop, setShowSymphonyWorkshop] = useState(false);

  // Load rename history from Tauri persistent storage on mount
  useEffect(() => {
    invoke<string | null>('load_persistence', { key: 'rename_history' }).then(saved => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setRenameHistory(parsed);
        } catch { /* ignore corrupt data */ }
      }
    }).catch(() => {});
  }, []);
  const [singleRenameTarget, setSingleRenameTarget] = useState<VideoItem | null>(null);
  const [singleRenameValue, setSingleRenameValue] = useState('');
  const [showSingleRenameDropdown, setShowSingleRenameDropdown] = useState(false);
  const [singleRenameFiltering, setSingleRenameFiltering] = useState(false);
  
  useEffect(() => {
    localStorage.setItem('show_workshop', showSymphonyWorkshop.toString());
  }, [showSymphonyWorkshop]);

  useEffect(() => {
    localStorage.setItem('cosmo-media-mode', mediaMode);
  }, [mediaMode]);
  const [newCollectionName, setNewCollectionName] = useState('');
  const showImmersiveUI = masterShowUI;
  const setShowImmersiveUI = setMasterShowUI;
  const immersiveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [toast, setToast] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  
  
  const [navDirection, setNavDirection] = useState<1 | -1>(1);
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(5);

  const masterPlayingRef = useRef(masterPlaying);
  const masterMutedRef = useRef(masterMuted);

  useEffect(() => {
    masterPlayingRef.current = masterPlaying;
  }, [masterPlaying]);

  useEffect(() => {
    masterMutedRef.current = masterMuted;
  }, [masterMuted]);

  const [menu, setMenu] = useState<{ x: number, y: number, id: string } | null>(null);
  const [menuMetadata, setMenuMetadata] = useState<any>(null);
  const [logs, setLogs] = useState<{ t: string, m: string }[]>([]);
  const addLog = useCallback((m: string) => {
    setLogs(p => [{ t: new Date().toLocaleTimeString(), m }, ...p].slice(0, 50));
    const lower = m.toLowerCase();
    if (lower.includes("snapshot") || lower.includes("decommission") || lower.includes("annihilate") || lower.includes("deleted")) {
      setToast(m);
      setTimeout(() => setToast(null), SNAPSHOT_THUMBNAIL_DURATION);
    }
  }, []);

  const {
    videos, setVideos,
    collections, setCollections,
    rotationInterval, setRotationInterval,
    snapshotDir, setSnapshotDir,
    confirmDeletion, setConfirmDeletion,
    isInitialized, setIsInitialized
  } = useWorkspacePersistence(addLog, isPopout, masterMuted, masterPlaying);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const {
    search, setSearch,
    focusedId, setFocusedId,
    rotating, setRotating,
    menu: workspaceMenu, setMenu: setWorkspaceMenu,
    rotIdx, setRotIdx,
    setIdToRow: setWorkspaceIdToRow,
    setRowOffsets: setWorkspaceRowOffsets,
    onToggleFocus,
    jumpToUnit
  } = useWorkspaceControls(addLog);

  const filtered = useMemo(() => {
    if (!Array.isArray(videos)) return [];
    const isValid = (v: VideoItem) => v.realPath ? isValidMediaExtension(v.realPath, mediaMode) : true;
    return videos.filter(v => {
      const t = v.title || 'Untitled Unit';
      const s = search || '';
      return t.toLowerCase().includes(s.toLowerCase()) && isValid(v);
    });
  }, [videos, search, mediaMode]);

  const handleDecommission = useCallback(async (id: string) => {
    if (confirmDeletion) {
      const { confirm } = await import('@tauri-apps/plugin-dialog');
      const yes = await confirm("Remove this item from your grid?\n\nThis removes the view shortcut, but the physical file on your hard drive will NOT be affected.\n\nProceed?", { title: 'Remove from Grid', kind: 'warning' });
      if (!yes) return;
    }
    
    // Auto-advance to the next sibling in Solo/Full Screen Mode
    if (focusedId === id) {
      const currentIdx = filtered.findIndex(v => v.id === id);
      if (currentIdx !== -1 && filtered.length > 1) {
        const nextIdx = (currentIdx + 1) % filtered.length;
        const nextVideo = filtered[nextIdx];
        if (nextVideo && nextVideo.id !== id) {
          setFocusedId(nextVideo.id);
        } else {
          setFocusedId(null);
          setImmersive(false);
          getCurrentWindow().setFullscreen(false);
          setIsFS(false);
        }
      } else {
        setFocusedId(null);
        setImmersive(false);
        getCurrentWindow().setFullscreen(false);
        setIsFS(false);
      }
    }

    setVideos(p => p.filter(x => x.id !== id));
    addLog("Removed item from grid");
  }, [setVideos, addLog, confirmDeletion, focusedId, filtered, setFocusedId, setImmersive, setIsFS]);

  const handleAnnihilate = useCallback(async (id: string) => {
    const video = videos.find(v => v.id === id);
    if (!video || !video.realPath) {
      addLog("Annihilation Error: Native path missing");
      return;
    }

    if (confirmDeletion) {
      const { confirm } = await import('@tauri-apps/plugin-dialog');
      const yes = await confirm(`PROTOCOL: ANNIHILATE ASSET\n\nTarget: ${video.title}\n\nThis will physically MOVE THE FILE TO THE RECYCLE BIN.\nThis action is reversible via the OS Recycle Bin, but the file will be gone from disk.\n\nPROCEED WITH DESTRUCTION?`, { title: 'Recycle Bin', kind: 'error' });
      if (!yes) return;
    }

    // Auto-advance to the next sibling in Solo/Full Screen Mode
    if (focusedId === id) {
      const currentIdx = filtered.findIndex(v => v.id === id);
      if (currentIdx !== -1 && filtered.length > 1) {
        const nextIdx = (currentIdx + 1) % filtered.length;
        const nextVideo = filtered[nextIdx];
        if (nextVideo && nextVideo.id !== id) {
          setFocusedId(nextVideo.id);
        } else {
          setFocusedId(null);
          setImmersive(false);
          getCurrentWindow().setFullscreen(false);
          setIsFS(false);
        }
      } else {
        setFocusedId(null);
        setImmersive(false);
        getCurrentWindow().setFullscreen(false);
        setIsFS(false);
      }
    }

    try {
      await invoke('recycle_unit', { path: video.realPath });
      setVideos(p => p.filter(x => x.id !== id));
      addLog("Unit Annihilated (Recycle Bin)");
    } catch (e) {
      console.error(e);
      addLog("Annihilation Failed: " + e);
    }
  }, [videos, setVideos, addLog, confirmDeletion, focusedId, filtered, setFocusedId, setImmersive, setIsFS]);

  const handleBatchRemove = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (confirmDeletion) {
      const { confirm } = await import('@tauri-apps/plugin-dialog');
      const yes = await confirm(`Remove ${selectedIds.size} items from your grid?\n\nThis removes the view shortcuts, but the physical files on your hard drive will NOT be affected.\n\nProceed?`, { title: 'Remove Selection', kind: 'warning' });
      if (!yes) return;
    }
    setVideos(p => p.filter(x => !selectedIds.has(x.id)));
    addLog(`Removed ${selectedIds.size} items from grid`);
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [selectedIds, confirmDeletion, setVideos, addLog, setSelectedIds, setSelectionMode]);

  const handleBatchMute = useCallback((muteState: boolean) => {
    if (selectedIds.size === 0) return;
    setVideos(p => p.map(v => selectedIds.has(v.id) ? { ...v, muted: muteState } : v));
    addLog(`Batch ${muteState ? 'Mute' : 'Unmute'}: ${selectedIds.size} units`);
  }, [selectedIds, setVideos, addLog]);

  const handleBatchPlay = useCallback((playState: boolean) => {
    if (selectedIds.size === 0) return;
    setVideos(p => p.map(v => selectedIds.has(v.id) ? { ...v, playing: playState } : v));
    addLog(`Batch ${playState ? 'Play' : 'Stop'}: ${selectedIds.size} units`);
  }, [selectedIds, setVideos, addLog]);

  const handleFocus = useCallback((id: string) => {
    setFocusedId(id);
  }, [setFocusedId]);

  const handleDeepFocus = useCallback((id: string, time?: number) => {
    if (time !== undefined && typeof time === 'number') {
      setVideos(prev => prev.map(v => v.id === id ? { ...v, currentTime: time } : v));
    }
    
    if (focusedId === id && immersive) {
      // Exiting Solo Mode via UI button!
      jumpToUnit(id);

      setImmersive(false);
      setFocusedId(null);
      getCurrentWindow().setFullscreen(false);
      setIsFS(false);
      addLog(`Exited Solo Mode`);
    } else {
      setFocusedId(id);
      setImmersive(true);
      if (rotating) setRotating(false);
      getCurrentWindow().setFullscreen(true);
      setIsFS(true);
      addLog(`Deep Focus: Unit ${id.split('-')[0]}`);
    }
  }, [focusedId, immersive, setVideos, setFocusedId, setImmersive, setIsFS, rotating, setRotating, addLog, jumpToUnit]);

  const handleNavigateSibling = useCallback((direction: 1 | -1) => {
    if (filtered.length <= 1 || !focusedId) return;
    const currentIdx = filtered.findIndex(v => v.id === focusedId);
    if (currentIdx === -1) return;
    const nextIdx = (currentIdx + direction + filtered.length) % filtered.length;
    const nextVideo = filtered[nextIdx];
    if (nextVideo) {
      setNavDirection(direction);
      setFocusedId(nextVideo.id);
      addLog(`Folder Navigate [${filtered[currentIdx].title}] → ${nextVideo.title}`);
    }
  }, [filtered, focusedId, setFocusedId, addLog]);

  // Reset slideshow if exiting Solo mode
  useEffect(() => {
    if (!focusedId) {
      setIsSlideshowActive(false);
    }
  }, [focusedId]);

  // Slideshow Timer Effect
  useEffect(() => {
    if (!isSlideshowActive || !focusedId) return;

    const timer = setInterval(() => {
      handleNavigateSibling(1);
    }, slideshowInterval * 1000);

    return () => clearInterval(timer);
  }, [isSlideshowActive, focusedId, slideshowInterval, handleNavigateSibling]);

  // Pre-Cache Engine: Retrieves URLs for the next 2 and previous 2 images to pre-load them in the browser's memory buffer
  const cachedAssetUrls = useMemo(() => {
    if (!focusedId || filtered.length <= 1) return [];

    const currentIdx = filtered.findIndex(v => v.id === focusedId);
    if (currentIdx === -1) return [];

    const indicesToCache = [
      (currentIdx - 2 + filtered.length) % filtered.length,
      (currentIdx - 1 + filtered.length) % filtered.length,
      (currentIdx + 1) % filtered.length,
      (currentIdx + 2) % filtered.length,
    ];

    const urls = indicesToCache
      .map(idx => filtered[idx])
      .filter(Boolean)
      .map(video => {
        const path = video.realPath || video.url;
        if (!isValidPictureExtension(path)) return null;
        return convertToVideoUrl(video);
      })
      .filter((url): url is string => !!url);

    return Array.from(new Set(urls));
  }, [focusedId, filtered]);

  const handleContext = useCallback(async (id: string, x: number, y: number) => {
    const video = videos.find(v => v.id === id);
    setMenu({ x, y, id });
    setMenuMetadata(null);

    if (video) {
      // For folder-browsing units, realPath stays as the first file loaded.
      // Use the currently-displayed file's path instead.
      const effectivePath = (video.folderFiles && video.currentIdx !== undefined)
        ? video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url
        : video.realPath;

      if (effectivePath) {
        try {
          const data = await invoke('get_video_metadata', { path: effectivePath });
          setMenuMetadata(data);
        } catch (e) {
          console.error("Failed to fetch metadata", e);
        }
      }
    }
  }, [videos]);

  const handleUpdate = useCallback((id: string, updates: Partial<VideoItem>) => {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
  }, [setVideos]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      // Check if all filtered items are already in selectedIds
      const allSelected = filtered.every(v => prev.has(v.id));
      if (allSelected && filtered.length > 0) {
        // Clear all filtered from selected
        const next = new Set(prev);
        filtered.forEach(v => next.delete(v.id));
        if (next.size === 0) setSelectionMode(false);
        addLog(`SYSTEM: Deselected all ${filtered.length} visible items.`);
        return next;
      } else {
        // Select all filtered items
        const next = new Set(prev);
        filtered.forEach(v => next.add(v.id));
        setSelectionMode(true);
        addLog(`SYSTEM: Selected all ${filtered.length} visible items.`);
        return next;
      }
    });
  }, [filtered, addLog]);

  const onUpdateVideo = handleUpdate;
  const onRemoveVideo = handleDecommission;

  const handleSaveCrop = async (overwrite: boolean, useAi: boolean) => {
    try {
      if (!focusedId || !focusedVideo) return;

      // First try to reuse the already-rendered <img> from the DOM.
      // The image is already visible on screen, so it's already decoded — no re-fetch needed.
      // Loading a fresh Image() with crossOrigin="anonymous" hangs against the Tauri asset protocol.
      let img: HTMLImageElement | null = document.querySelector(
        `[data-id="${focusedId}"] img`
      ) as HTMLImageElement | null;

      if (!img || !img.complete || img.naturalWidth === 0) {
        // Fall back: load fresh, but without crossOrigin to avoid CORS hang, with a timeout
        const freshImg = new Image();
        const loadPromise = new Promise<void>((resolve, reject) => {
          freshImg.onload = () => resolve();
          freshImg.onerror = () => reject(new Error('Image failed to load'));
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Image load timed out (10s). Try again.')), 10000)
        );
        freshImg.src = convertToVideoUrl(focusedVideo);
        await Promise.race([loadPromise, timeoutPromise]);
        img = freshImg;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get 2d context");

      const cropX = (cropBox.x / 100) * img.naturalWidth;
      const cropY = (cropBox.y / 100) * img.naturalHeight;
      const cropW = (cropBox.w / 100) * img.naturalWidth;
      const cropH = (cropBox.h / 100) * img.naturalHeight;

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(
        img,
        cropX, cropY, cropW, cropH,
        0, 0, cropW, cropH
      );


      let base64 = canvas.toDataURL('image/png');

      if (useAi) {
        setIsAiEnhancing(true);
        setAiServerOffline(false);
        setUpscaleStatus('enhancing');
        setLastEnhancedTitle('Image Crop');
        try {
          // Remove prefix like "data:image/png;base64," if present
          const rawBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
          
          // Invoke the Tauri command to request upscaling from the backend
          const enhancedBase64 = await invoke<string>('enhance_image_crop', { base64Data: rawBase64 });
          
          base64 = `data:image/png;base64,${enhancedBase64}`;
          addLog("AI Enhancement successful (4x Resolution)!");
          setUpscaleStatus('success');
        } catch (err) {
          console.error("AI Server error:", err);
          setAiServerOffline(true);
          setIsAiEnhancing(false);
          setUpscaleStatus('failed');
          setTimeout(() => {
            setUpscaleStatus(current => current === 'enhancing' ? 'enhancing' : 'idle');
          }, 4000);
          return;
        }
        setIsAiEnhancing(false);
        setTimeout(() => {
          setUpscaleStatus(current => current === 'enhancing' ? 'enhancing' : 'idle');
        }, 4000);
      }

      // Use toRealPath to extract a clean disk path — never let asset.localhost or local:// leak into file names
      const path = toRealPath(focusedVideo.realPath || focusedVideo.url);
      if (!path) throw new Error('Could not resolve a disk path for this image. Try re-adding the file.');

      if (overwrite) {
        const sep = path.includes('\\') ? '\\' : '/';
        const parts = path.split(sep);
        const fileName = parts.pop()!;
        const parentDir = parts.join(sep);

        const originalId = focusedId;
        setFocusedId(null);

        await new Promise(resolve => setTimeout(resolve, 120));

        const savedPath = await invoke<string>('save_snapshot', {
          base64Data: base64,
          fileName: fileName,
          customDir: parentDir
        });

        setVideos(prev => prev.map(v => v.id === originalId ? { ...v, realPath: savedPath, url: toCosmoUrl(savedPath) } : v));
        setFocusedId(originalId);
        addLog(`Unit physically overwritten: ${fileName}`);
      } else {
        const cleanedTitle = focusedVideo.title.replace(/[^a-zA-Z0-9_-]/g, '').trim() || 'Crop';
        let index = 1;
        let finalName = `${cleanedTitle}.${index}.png`;
        
        while (videos.some(v => v.realPath && v.realPath.toLowerCase().endsWith(finalName.toLowerCase()))) {
          index++;
          finalName = `${cleanedTitle}.${index}.png`;
        }

        const cleanSnapDir = (snapshotDir || '').replace(/\x00/g, '').trim() || null;
        const savedPath = await invoke<string>('save_snapshot', {
          base64Data: base64,
          fileName: finalName,
          customDir: cleanSnapDir
        });

        const newUnit: VideoItem = {
          id: `crop-${Date.now()}`,
          title: finalName.replace('.png', ''),
          url: toCosmoUrl(savedPath),
          realPath: savedPath,
          currentTime: 0
        };

        setVideos(prev => [...prev, newUnit]);
        addLog(`Crop saved as separate file: ${finalName}`);
      }

      setIsCropping(false);
      setShowSaveCropOptions(false);

    } catch (err) {
      console.error("Crop save failed:", err);
      addLog(`Crop failed: ${err}`);
      alert(`Crop failed: ${err}`);
    }
  };

  const handleUpscale = useCallback((v: any) => {
    if (!v.realPath) {
      addLog("Upscale Error: Native path missing.");
      return;
    }
    setUpscaleTarget(v);
    setShowSaveUpscaleOptions(true);
  }, [addLog]);

  const executeUpscale = async (overwrite: boolean) => {
    if (!upscaleTarget) return;
    const v = upscaleTarget;
    setShowSaveUpscaleOptions(false);
    setIsAiEnhancing(true);
    setUpscaleStatus('enhancing');
    setLastEnhancedTitle(v.title);
    addLog(`Upscaling: ${v.title} (${overwrite ? 'Overwrite' : 'Save As'}) — running local super-resolution...`);
    try {
      const result = await invoke<string>('upscale_image', { path: v.realPath, overwrite });
      addLog(`Upscale success: ${result}`);
      setUpscaleStatus('success');
      
      if (overwrite) {
        // Overwrite original asset physically: bust cache
        const cacheBustUrl = `local://${v.realPath}?t=${Date.now()}`;
        
        // Temporarily clear and restore focusedId to trigger a component refresh
        const originalId = focusedId;
        setFocusedId(null);
        await new Promise(resolve => setTimeout(resolve, 120));
        
        setVideos(prev => prev.map(vid => vid.id === v.id ? { ...vid, url: cacheBustUrl } : vid));
        setFocusedId(originalId);
      } else {
        // Save As: Add the new serial upscaled asset as a new card
        const extIdx = result.lastIndexOf('.');
        const fileNameWithExt = result.substring(result.lastIndexOf(result.includes('\\') ? '\\' : '/') + 1);
        const cleanTitle = extIdx !== -1 ? fileNameWithExt.substring(0, fileNameWithExt.lastIndexOf('.')) : fileNameWithExt;

        const newUnit: VideoItem = {
          id: `upscale-${Date.now()}`,
          title: cleanTitle,
          url: `local://${result}`,
          realPath: result,
          currentTime: v.currentTime || 0
        };
        setVideos(prev => [...prev, newUnit]);
      }
    } catch (err) {
      console.error("Upscale failed:", err);
      addLog(`Upscale failed: ${err}`);
      setUpscaleStatus('failed');
    } finally {
      setIsAiEnhancing(false);
      setUpscaleTarget(null);
      // Automatically clear success/failed state after 4 seconds
      setTimeout(() => {
        setUpscaleStatus(current => current === 'enhancing' ? 'enhancing' : 'idle');
      }, 4000);
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: DRAG_ACTIVATION_DISTANCE,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDragId(null);

    if (over && active.id !== over.id) {
      setVideos((items) => {
        const oldIndex = items.findIndex((v) => v.id === active.id);
        const newIndex = items.findIndex((v) => v.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const next = arrayMove(items, oldIndex, newIndex);
          addLog(`Reordered Units: [${items[oldIndex].title}] moved to position ${newIndex + 1}`);
          return next;
        }
        return items;
      });
    }
  };

  const handleVideoEnded = useCallback((id: string) => {
    setVideos(prev => prev.map(v => {
      if (v.id !== id) return v;
      
      const currentMode = globalRepeat === 'none' ? 'none' : (v.repeatMode !== 'none' ? v.repeatMode : globalRepeat);
      
      if (currentMode === 'folder' && v.folderFiles && v.folderFiles.length > 0) {
        const nextIdx = ((v.currentIdx || 0) + 1) % v.folderFiles.length;
        const nextFile = v.folderFiles[nextIdx];
        addLog(`Folder Cycle [${v.title}] -> ${nextFile.name}`);
        return { 
          ...v, 
          currentIdx: nextIdx, 
          url: nextFile.url, 
          realPath: nextFile.path, // Maintain path for physical actions
          title: nextFile.name 
        };
      }
      
      if (currentMode === 'always') {
        return { ...v, playing: true, repeatCount: 0 };
      }
      
       if (currentMode === 'once') {
         if (!v.repeatCount || v.repeatCount < 1) {
           return { ...v, playing: true, repeatCount: 1 };
         }
         return { ...v, playing: false, repeatCount: 0 };
       }
       
       return { ...v, playing: false, repeatCount: 0 };
    }));
  }, [globalRepeat, addLog, setVideos]);

  const onReorder = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setVideos(prev => {
      const f = prev.findIndex(x => x.id === fromId);
      const t = prev.findIndex(x => x.id === toId);
      if (f === -1 || t === -1) return prev;
      return arrayMove(prev, f, t);
    });
    setDragId(null);
  }, [setVideos]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      const scrollArea = target.closest('.video-scroll');
      if (!scrollArea) return;

      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1 : -1;
        setZoom(prev => {
          const next = prev + delta;
          if (next >= MIN_ZOOM && next <= MAX_ZOOM) {
            addLog(`Grid Density: ${next} mode`);
            return next;
          }
          return prev;
        });
       } else {
         if (scrollRef.current) {
           scrollRef.current.scrollTop += e.deltaY;
         }
       }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [addLog, setZoom]);

  const safeUnlisten = useCallback(async (unlisten: (() => Promise<void>) | undefined) => {
    if (!unlisten) return;
    try {
      await unlisten();
    } catch (err) {
      handleError(err, 'ui', { silent: true, logToConsole: false });
    }
  }, [handleError]);

  const resetImmersiveTimer = useCallback(() => {
     setShowImmersiveUI(true);
     if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current);
     immersiveTimerRef.current = setTimeout(() => setShowImmersiveUI(false), IMMERSIVE_HIDE_DELAY);
   }, []);

   useEffect(() => {
     // Never enter ghost mode while a modal dialog is open
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
   }, [immersive, isFS, resetImmersiveTimer]);

   // Keep UI visible while rename dialog is open so it's never hidden in fullscreen
   useEffect(() => {
     if (singleRenameTarget) {
       setShowImmersiveUI(true);
       if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current);
     }
   }, [singleRenameTarget]);



  if (fatalError) return <ErrorFallback error={fatalError} />;

  if (isPopout) {
    return <PopoutPlayer url={popoutUrl || ''} />;
  }
  
  const {
    rowOffsets,
    idToRow,
    setRowOffsets,
    setIdToRow
  } = useLayoutOrchestration({
    videos,
    zoom,
    immersive,
    filteredCount: filtered.length,
    isPopout
  });

  // Sync calculated layout values back to the workspace control hook so that jumpToUnit functions perfectly!
  useEffect(() => {
    setWorkspaceIdToRow(idToRow);
    setWorkspaceRowOffsets(rowOffsets);
  }, [idToRow, rowOffsets, setWorkspaceIdToRow, setWorkspaceRowOffsets]);

  const {
    timeLeft,
    sessionTimeLeft,
    nextSetVideos,
    setTimeLeft
  } = useSessionControl({
    sessionDuration,
    rotationInterval,
    rotating,
    setRotating,
    collections,
    rowOffsets,
    rotIdx,
    setRotIdx,
    addLog,
    isPopout
  });

  const {
    toggleMasterMute,
    toggleMasterPlay,
    preMuteVolume,
    setPreMuteVolume
  } = usePlaybackSync({
    masterPlaying,
    setMasterPlaying,
    masterMuted,
    setMasterMuted,
    setMasterMutedOverride,
    globalVolume,
    setGlobalVolume,
    setVideos,
    addLog
  });

  // KEYBOARD ORCHESTRATION (v4) — Modular Hook
  useKeyboardShortcuts({
    focusedId,
    filtered,
    videos,
    selectedIds,
    confirmDeletion,
    immersive,
    menu,
    showSettings,
    showCollections,
    showLogs,
    showSymphonyWorkshop,
    showHelp,
    isPopout,
    onUpdateVideo,
    onToggleFocus,
    toggleMasterPlay,
    toggleMasterMute,
    setGlobalRepeat,
    setGlobalControl,
    setZoom,
    setMenu,
    setImmersive,
    setShowSettings,
    setShowCollections,
    setShowLogs,
    setShowSymphonyWorkshop,
    setShowHelp,
    setSelectedIds,
    setSelectionMode,
    handleDecommission,
    handleAnnihilate,
    handleBatchRemove,
    addLog,
    onNavigateSibling: handleNavigateSibling,
    jumpToUnit: jumpToUnit,
    onDeepFocus: handleDeepFocus
  });

  // INGESTION ENGINE (v4) — Modular Hook
  useIngestion({
    mediaMode,
    setVideos,
    addLog,
    masterPlayingRef,
    masterMutedRef,
    setDragFile,
    isPopout
  });

  useEffect(() => {
    if (!rotating || !scrollRef.current || rowOffsets.length === 0) return;
    scrollRef.current.scrollTo({ top: rowOffsets[rotIdx] || 0, behavior: 'smooth' });
  }, [rotIdx, rotating, rowOffsets]);

  if (!isInitialized) {
    return (
      <div className="cosmo-boot">
        <div className="boot-nebula" />
        <div className="boot-content">
          <img src="/logo.png" className="boot-logo" alt="Cosmo Elite" />
          <div className="boot-text">
            <h2>COSMO SYMPHONY</h2>
            <p>Initializing Symphony Orchestrator...</p>
            <button 
              onClick={() => setIsInitialized(true)} 
              style={{ marginTop: '24px', padding: '8px 16px', background: '#222222', border: '1px solid #444444', color: '#666', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', transition: 'all 0.3s' }}
              onMouseOver={e => e.currentTarget.style.background = '#333333'}
              onMouseOut={e => e.currentTarget.style.background = '#222222'}
            >
              EMERGENCY BYPASS
            </button>
          </div>
        </div>
      </div>
    );
  }

  const focusedVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
  const isFocusedImage = focusedVideo ? isValidPictureExtension(focusedVideo.realPath || focusedVideo.url) : false;

  return (
    <main 
      className={`app-root app-container ${immersive ? 'immersive-mode' : ''} ${!showImmersiveUI && immersive ? 'ghost-mode' : ''}`} 
      onClick={() => setMenu(null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <ResizeHandles />
      <div className="nebula-bg" />
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ x: 100, opacity: 0 }} 
            animate={{ x: 0, opacity: 1 }} 
            exit={{ x: 100, opacity: 0 }} 
            className="toast-notification"
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              background: 'rgba(0,0,0,0.85)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              padding: '12px 20px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              zIndex: 60000,
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              fontWeight: 'bold',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              fontSize: '11px'
            }}
          >
            <CheckCircle2 size={16} /> <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {dragFile && <div className="drag-overlay"><img src="/logo.png" className="empty-logo-img" /><p>Drop to Add Media</p></div>}
      
      {focusedId && (
        <div className="solo-mode-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden' }}>
          <div className="solo-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <AnimatePresence initial={false} mode="popLayout">
              {videos.find(v => v.id === focusedId) && (
                <motion.div
                  key={focusedId}
                  initial={{ opacity: 0, x: navDirection * 300, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -navDirection * 300, scale: 0.98 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 220 }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#000'
                  }}
                >
                  <VideoCard 
                    video={videos.find(v => v.id === focusedId)!}
                    globalSpeed={speed}
                    onUpdateVideo={onUpdateVideo}
                    onRemove={handleDecommission}
                    onAnnihilate={handleAnnihilate}
                    onLog={addLog}
                    onFocus={() => {}}
                    isFocused={true}
                    onSelectAll={handleSelectAll}
                    focusedId={focusedId}
                    inSoloMode={true}
                    onCloseFocus={() => setFocusedId(null)}
                    snapshotDir={snapshotDir}
                    setSnapshotDir={setSnapshotDir}
                    globalControl={globalControl}
                    onEnded={handleVideoEnded}
                    toggleMasterMute={toggleMasterMute}
                    toggleMasterPlay={toggleMasterPlay}
                    onContextMenu={(x, y) => handleContext(focusedId, x, y)}
                    onDeepFocus={(time) => handleDeepFocus(focusedId, time)}
                    isVisible={true}
                    onNavigateSibling={handleNavigateSibling}
                    onUpscale={handleUpscale}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {isCropping && focusedVideo && (
              <CropOverlay 
                video={focusedVideo}
                cropBox={cropBox}
                setCropBox={setCropBox}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                onSave={() => setShowSaveCropOptions(true)}
                onCancel={() => setIsCropping(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* Hidden Image Memory Pre-Cache Engine */}
      <div className="hidden-precache-engine" style={{ display: 'none', width: 0, height: 0, visibility: 'hidden' }} aria-hidden="true">
        {cachedAssetUrls.map(url => (
          <img key={url} src={url} alt="pre-cache" />
        ))}
      </div>

      {!immersive && (
        <ControlBar
          videos={videos}
          collections={collections}
          setVideos={setVideos}
          setCollections={setCollections}
          rotationInterval={rotationInterval}
          setRotationInterval={setRotationInterval}
          snapshotDir={snapshotDir}
          setSnapshotDir={setSnapshotDir}
          search={search}
          setSearch={setSearch}
          rotating={rotating}
          setRotating={setRotating}
          sessionDuration={sessionDuration}
          setSessionDuration={setSessionDuration}
          setGlobalControl={setGlobalControl}
          addLog={addLog}
          onUpdateVideo={handleUpdate}
          onRemoveVideo={handleDecommission}
          onToggleFocus={onToggleFocus}
          onLog={addLog}
          onBatchRemove={handleBatchRemove}
          onBatchMute={handleBatchMute}
          onBatchPlay={handleBatchPlay}
          filtered={filtered}
          focusedId={focusedId}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          showCollections={showCollections}
          setShowCollections={setShowCollections}
          showLogs={showLogs}
          setShowLogs={setShowLogs}
          newCollectionName={newCollectionName}
          setNewCollectionName={setNewCollectionName}
          logs={logs}
          confirmDeletion={confirmDeletion}
          setConfirmDeletion={setConfirmDeletion}
          isPopout={isPopout}
          showHelp={showHelp}
          setShowHelp={setShowHelp}
          showSymphonyWorkshop={showSymphonyWorkshop}
          setShowSymphonyWorkshop={setShowSymphonyWorkshop}
          toggleMasterMute={toggleMasterMute}
          globalControl={globalControl}
        />
      )}

      <VideoGrid
          videos={videos}
          filtered={filtered}
          zoom={zoom}
          immersive={immersive}
          focusedId={focusedId}
          dragId={dragId}
          globalRepeat={globalRepeat}
          globalSpeed={speed}
          fitMode={fitMode}
          masterPlaying={masterPlaying}
          masterMuted={masterMuted}
          globalVolume={globalVolume}
          showImmersiveUI={showImmersiveUI}
          snapshotDir={snapshotDir}
          setSnapshotDir={setSnapshotDir}
          globalControl={globalControl}
          rowOffsets={rowOffsets}
          rotIdx={rotIdx}
          rotating={rotating}
          scrollRef={scrollRef}
          idToRow={idToRow}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onUpdateVideo={handleUpdate}
          onRemoveVideo={handleDecommission}
          onAnnihilate={handleAnnihilate}
          onLog={addLog}
          onFocus={handleFocus}
          onCloseFocus={() => setFocusedId(null)}
          onEnded={handleVideoEnded}
          toggleMasterMute={toggleMasterMute}
          toggleMasterPlay={toggleMasterPlay}
          onContextMenu={handleContext}
          onDeepFocus={handleDeepFocus}
          onReorder={onReorder}
          onToggleFocus={onToggleFocus}
          jumpToUnit={jumpToUnit}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          selectionMode={selectionMode}
          onNavigateSibling={handleNavigateSibling}
          onUpscale={handleUpscale}
        />

       {!immersive && (
         <footer className="app-footer">
           <TelemetrySystem videosCount={videos.length} isPopout={isPopout} />
         </footer>
       )}

      {menu && (
        <ContextMenu 
          x={menu.x} 
          y={menu.y} 
          onClose={() => { setMenu(null); setMenuMetadata(null); }}
          video={videos.find(x => x.id === menu.id)!}
          metadata={menuMetadata}
          selectedCount={selectedIds.size}
          isFocused={focusedId === menu.id}
          onAction={async (action) => {
            const v = videos.find(x => x.id === menu.id);
            if (!v) return;

            // For folder-browsing units, always target the currently-displayed file
            const effectivePath = (v.folderFiles && v.currentIdx !== undefined)
              ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
              : v.realPath;
            
            switch(action) {
              case 'play': onUpdateVideo(v.id, { playing: !v.playing }); break;
              case 'mute': onUpdateVideo(v.id, { muted: !v.muted }); break;
              case 'stop': onUpdateVideo(v.id, { playing: false }); break;
              case 'loop': onUpdateVideo(v.id, { repeatMode: v.repeatMode === 'always' ? 'none' : 'always' }); break;
              case 'step-back': setGlobalControl(`stepback-${v.id}-${Date.now()}`); break;
              case 'step-forward': setGlobalControl(`stepforward-${v.id}-${Date.now()}`); break;
              case 'watermark': setGlobalControl(`watermark-${v.id}-${Date.now()}`); break;
              case 'crop':
                setIsCropping(true);
                setCropBox({ x: 15, y: 15, w: 70, h: 70 });
                setAspectRatio('free');
                break;
              case 'prev-file': handleNavigateSibling(-1); break;
              case 'next-file': handleNavigateSibling(1); break;
              case 'rotate-ccw': onUpdateVideo(v.id, { rotation: (v.rotation || 0) - 90 }); break;
              case 'rotate-cw': onUpdateVideo(v.id, { rotation: (v.rotation || 0) + 90 }); break;
              case 'exit-focus': setFocusedId(null); break;
              case 'decommission': await handleDecommission(v.id); break;
              case 'annihilate': {
                if (!effectivePath) { addLog('Annihilation Error: Native path missing'); break; }
                if (confirmDeletion) {
                  const { confirm } = await import('@tauri-apps/plugin-dialog');
                  const yes = await confirm(`PROTOCOL: ANNIHILATE ASSET\n\nTarget: ${v.title}\n\nThis will physically MOVE THE FILE TO THE RECYCLE BIN.\nThis action is reversible via the OS Recycle Bin.\n\nPROCEED?`, { title: 'Recycle Bin', kind: 'error' });
                  if (!yes) break;
                }
                try {
                  await invoke('recycle_unit', { path: effectivePath });
                  // For folder units with multiple files: remove just this file
                  if (v.folderFiles && v.folderFiles.length > 1) {
                    const newFiles = v.folderFiles.filter((_, i) => i !== (v.currentIdx || 0));
                    const newIdx = Math.min(v.currentIdx || 0, newFiles.length - 1);
                    onUpdateVideo(v.id, { folderFiles: newFiles, currentIdx: newIdx, url: newFiles[newIdx]?.url, realPath: newFiles[newIdx]?.path, title: newFiles[newIdx]?.name });
                  } else {
                    setVideos(p => p.filter(x => x.id !== v.id));
                  }
                  addLog('Unit Annihilated (Recycle Bin)');
                } catch(e) {
                  addLog('Annihilation Failed: ' + e);
                }
                break;
              }
              case 'focus': onToggleFocus(v.id); break;
              case 'snapshot': invoke('save_snapshot', { id: v.id, path: v.realPath }); break;
              case 'save_rotation':
                 if (v.realPath) {
                   const isImage = isValidPictureExtension(v.realPath || v.url);
                   
                   addLog(`Saving rotation permanently to disk for: ${v.title}...`);
                   invoke<string>('rotate_media_on_disk', { 
                     path: v.realPath, 
                     rotation: v.rotation || 0, 
                     isImage: isImage 
                   })
                   .then((newPath) => {
                     const cacheBuster = `t=${Date.now()}`;
                     const cleanUrl = v.url.split('?')[0];
                     const newUrl = `${cleanUrl}?${cacheBuster}`;

                     onUpdateVideo(v.id, { 
                       rotation: 0,
                       url: newUrl
                     });
                     addLog(`Rotation permanently saved to disk for: ${v.title}`);
                   })
                   .catch((err) => {
                     console.error("Failed to save rotation:", err);
                     alert(`Rotation save failed: ${err}`);
                     addLog(`Failed to save rotation: ${err}`);
                   });
                 } else {
                   addLog("Error: Native path lost for this unit.");
                 }
                 break;
               case 'folder': {
                 // For folder units, open the currently-displayed file (not always the first)
                 const folderEffectivePath = (v.folderFiles && v.currentIdx !== undefined)
                   ? v.folderFiles[v.currentIdx]?.path
                   : v.realPath;
                 if (folderEffectivePath) {
                   invoke('open_folder', { path: folderEffectivePath });
                 } else {
                   addLog("Error: Native path lost for this unit.");
                 }
                 break;
              }
              case 'popout': invoke('pop_out', { id: v.id, url: v.url, title: v.title }); break;
              case 'upscale': handleUpscale(v); break;
              case 'rename_selected':
                setGlobalControl(`batch-rename-selected-${Date.now()}`);
                break;
              case 'rename': {
                // For folder units, rename the currently-displayed image, not the first file
                const effectiveRealPath = (v.folderFiles && v.currentIdx !== undefined)
                  ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
                  : v.realPath;
                const effectiveTitle = (v.folderFiles && v.currentIdx !== undefined)
                  ? (v.folderFiles[v.currentIdx]?.name || v.title)
                  : v.title;

                if (effectiveRealPath) {
                  const currentName = effectiveTitle.replace(/\.[^/.]+$/, "");
                  // Build a modified target so the rename dialog and executor both see the correct path
                  setSingleRenameTarget({ ...v, realPath: effectiveRealPath, title: effectiveTitle });
                  setSingleRenameValue(currentName);
                  setSingleRenameFiltering(false); // Show full history on open, not filtered
                  setShowSingleRenameDropdown(true); // Open history immediately
                }
                break;
              }
            }
            setMenu(null);
            setMenuMetadata(null);
          }}
        />
      )}

      <div className="preheat-buffer" style={{ position: 'fixed', bottom: 0, right: 0, width: 0, height: 0, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {nextSetVideos.map(v => (
          <VideoCard 
            key={`preheat-${v.id}`} 
            video={{ ...v, playing: false, muted: true }}
            globalSpeed={speed}
            onUpdateVideo={() => {}}
            onRemove={() => {}}
            onAnnihilate={() => {}}
            onLog={() => {}}
            onFocus={() => {}}
            isFocused={false}
            onCloseFocus={() => {}}
            globalControl={null}
            isVisible={false}
            toggleMasterMute={() => {}}
            toggleMasterPlay={() => {}}
            onEnded={() => {}}
            onContextMenu={() => {}}
            onDeepFocus={() => {}}
          />
        ))}
      </div>

      <Suspense fallback={null}>
        {showSymphonyWorkshop && <SymphonyWorkshop onClose={() => setShowSymphonyWorkshop(false)} addLog={addLog} />}
        {showHelp && <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />}
      </Suspense>

      {singleRenameTarget && (
        <div className="modal-overlay" onClick={() => setSingleRenameTarget(null)}>
          <div className="modal-content premium-glass" onClick={(e) => e.stopPropagation()} style={{ width: '420px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="accent-icon-box">
                  <Bookmark size={20} className="text-accent" />
                </div>
                <div>
                  <h2 style={{ fontSize: '16px', letterSpacing: '1px' }}>RENAME PROTOCOL</h2>
                  <span style={{ fontSize: '9px', opacity: 0.5, fontWeight: 800 }}>PHYSICAL ASSET MODIFICATION</span>
                </div>
              </div>
              <button onClick={() => setSingleRenameTarget(null)} className="premium-close-btn">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="settings-section">
                <div className="setting-item">
                  <label style={{ color: 'var(--accent)', fontSize: '10px', fontWeight: 900 }}>NEW ASSET NAME</label>
                  <div style={{ position: 'relative', width: '100%', marginTop: '6px' }}>
                    <input 
                      type="text" 
                      value={singleRenameValue}
                      autoFocus
                      onChange={(e) => {
                        setSingleRenameValue(e.target.value);
                        setSingleRenameFiltering(true); // User started typing — now filter
                        setShowSingleRenameDropdown(true);
                      }}
                      onFocus={() => {
                        setSingleRenameFiltering(false); // Show all history on focus
                        setShowSingleRenameDropdown(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowSingleRenameDropdown(false), 200);
                      }}
                      placeholder="Enter new name..."
                      onMouseDown={e => e.stopPropagation()}
                      className="premium-input"
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSingleRenameDropdown(!showSingleRenameDropdown)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.7,
                        transition: 'opacity 0.2s',
                      }}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                    >
                      <ChevronDown size={16} />
                    </button>
                    
                    {showSingleRenameDropdown && renameHistory.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 4px)',
                          left: 0,
                          width: '100%',
                          maxHeight: '150px',
                          overflowY: 'auto',
                          background: 'rgba(15, 15, 15, 0.95)',
                          backdropFilter: 'blur(10px)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          zIndex: 9999,
                          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
                        }}
                      >
                        {renameHistory
                          .filter(item => !singleRenameFiltering || !singleRenameValue || item.toLowerCase().includes(singleRenameValue.toLowerCase()))
                          .map((item, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                setSingleRenameValue(item);
                                setShowSingleRenameDropdown(false);
                              }}
                              style={{
                                padding: '10px 16px',
                                fontSize: '12px',
                                color: '#fff',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                borderBottom: idx < renameHistory.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                              }}
                              className="history-item-hover"
                              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.15)'}
                              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              {item}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>ORIGINAL:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{singleRenameTarget.title}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--accent)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>TARGET:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {singleRenameValue || '...'}{singleRenameTarget.title.substring(singleRenameTarget.title.lastIndexOf('.'))}
                    </span>
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    const newName = singleRenameValue.trim();
                    if (newName && newName !== singleRenameTarget.title.replace(/\.[^/.]+$/, "")) {
                      invoke<string>('rename_video', { oldPath: singleRenameTarget.realPath, newName })
                        .then((newPath) => {
                          const extension = singleRenameTarget.title.substring(singleRenameTarget.title.lastIndexOf('.'));
                          
                          // Comprehensive update across all video cards and folderFiles
                          setVideos(prev => {
                            // Filter out the card representing the overwritten file (unless it's the renamed card itself)
                            const filtered = prev.filter(vid => vid.id === singleRenameTarget.id || vid.realPath !== newPath);
                            
                            return filtered.map(vid => {
                              let updated = false;
                              let newVid = { ...vid };
                              
                              if (vid.id === singleRenameTarget.id) {
                                newVid.realPath = newPath;
                                newVid.url = toCosmoUrl(newPath);
                                newVid.title = `${newName}${extension}`;
                                updated = true;
                              } else if (vid.realPath === singleRenameTarget.realPath) {
                                newVid.realPath = newPath;
                                newVid.url = toCosmoUrl(newPath);
                                newVid.title = `${newName}${extension}`;
                                updated = true;
                              }
                              
                              if (vid.folderFiles) {
                                // Filter out the overwritten entry and update the renamed entry inside folderFiles
                                const hasOverwritten = vid.folderFiles.some(f => f.path === newPath);
                                const hasRenamed = vid.folderFiles.some(f => f.path === singleRenameTarget.realPath);
                                
                                if (hasOverwritten || hasRenamed) {
                                  let newFiles = vid.folderFiles;
                                  if (hasOverwritten) {
                                    newFiles = newFiles.filter(f => f.path !== newPath);
                                  }
                                  newVid.folderFiles = newFiles.map(f => {
                                    if (f.path === singleRenameTarget.realPath) {
                                      return {
                                        ...f,
                                        name: `${newName}${extension}`,
                                        path: newPath,
                                        url: toCosmoUrl(newPath)
                                      };
                                    }
                                    return f;
                                  });
                                  updated = true;
                                }
                              }
                              
                              return updated ? newVid : vid;
                            });
                          });
                          
                          addLog(`Unit renamed: ${newName}${extension}`);
                          
                          // Add to persistent history (Tauri AppData)
                          addToRenameHistory(newName);
                          
                          setSingleRenameTarget(null);
                        })
                        .catch(err => {
                          console.error("Rename failed:", err);
                          alert(`Rename failed: ${err}`);
                        });
                    }
                  }}
                  disabled={!singleRenameValue.trim() || singleRenameValue === singleRenameTarget.title.replace(/\.[^/.]+$/, "")}
                  className="execute-btn"
                  style={{ marginTop: '20px' }}
                >
                  <Zap size={16} />
                  <span>APPLY RENAME</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save options and status overlays */}
      {showSaveCropOptions && (
        <div
          className="save-crop-options-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(5, 5, 8, 0.85)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300000,
            userSelect: 'none'
          }}
        >
          <div
            style={{
              background: 'rgba(18, 18, 24, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>SAVE CROPPED SELECTION</h2>
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#888' }}>Select how you want to save your cropped asset.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Choice 1: Save as Separate File */}
              <button
                onClick={() => handleSaveCrop(false, false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Save as Separate File (Save As)</span>
                <span style={{ fontSize: '11px', color: '#aaa' }}>Creates a new file using serial increments (e.g. Daisy28.1.png).</span>
              </button>

              {/* Choice 2: Overwrite Original */}
              <button
                onClick={() => handleSaveCrop(true, false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Overwrite Original</span>
                <span style={{ fontSize: '11px', color: '#aaa' }}>Replaces the original file physically. Auto-bypasses caching.</span>
              </button>

              {/* Choice 3: AI Enhance & Save as Separate File */}
              <button
                onClick={() => handleSaveCrop(false, true)}
                style={{
                  background: 'rgba(0, 255, 136, 0.03)',
                  border: '1px solid rgba(0, 255, 136, 0.15)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(0, 255, 136, 0.06)';
                  e.currentTarget.style.border = '1px solid rgba(0, 255, 136, 0.3)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(0, 255, 136, 0.03)';
                  e.currentTarget.style.border = '1px solid rgba(0, 255, 136, 0.15)';
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={12} fill="currentColor" /> AI Enhance & Save as New File
                </span>
                <span style={{ fontSize: '11px', color: '#aaa' }}>Runs 4x GFPGAN/Real-ESRGAN local super-resolution over the crop and saves as a separate file.</span>
              </button>

              {/* Choice 4: AI Enhance & Overwrite Original */}
              <button
                onClick={() => handleSaveCrop(true, true)}
                style={{
                  background: 'rgba(0, 255, 136, 0.03)',
                  border: '1px solid rgba(0, 255, 136, 0.15)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(0, 255, 136, 0.06)';
                  e.currentTarget.style.border = '1px solid rgba(0, 255, 136, 0.3)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(0, 255, 136, 0.03)';
                  e.currentTarget.style.border = '1px solid rgba(0, 255, 136, 0.15)';
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={12} fill="currentColor" /> AI Enhance & Overwrite Original
                </span>
                <span style={{ fontSize: '11px', color: '#aaa' }}>Runs 4x GFPGAN/Real-ESRGAN local super-resolution over the crop and overwrites the original file physically.</span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                onClick={() => setShowSaveCropOptions(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  padding: '8px 16px',
                  transition: 'color 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.color = '#fff'}
                onMouseOut={e => e.currentTarget.style.color = '#888'}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveUpscaleOptions && upscaleTarget && (
        <div
          className="save-upscale-options-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(5, 5, 8, 0.85)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300000,
            userSelect: 'none'
          }}
        >
          <div
            style={{
              background: 'rgba(18, 18, 24, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', padding: '10px', borderRadius: '50%', background: 'rgba(0, 255, 136, 0.1)', color: 'var(--accent)', marginBottom: '12px' }}>
                <Zap size={24} fill="currentColor" />
              </div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>AI UPSCALE OPTIONS</h2>
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#888' }}>Select how you want to save your upscaled high-fidelity image.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Choice 1: Save as Separate File */}
              <button
                onClick={() => executeUpscale(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Save as Separate File (Save As)</span>
                <span style={{ fontSize: '11px', color: '#aaa' }}>Creates a new file using serial increments (e.g. daisy_upscaled.1.png).</span>
              </button>

              {/* Choice 2: Overwrite Original */}
              <button
                onClick={() => executeUpscale(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Overwrite Original File</span>
                <span style={{ fontSize: '11px', color: '#aaa' }}>Replaces the original file physically with 4x resolution. Auto-bypasses caching.</span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                onClick={() => {
                  setShowSaveUpscaleOptions(false);
                  setUpscaleTarget(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  padding: '8px 16px',
                  transition: 'color 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.color = '#fff'}
                onMouseOut={e => e.currentTarget.style.color = '#888'}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {upscaleStatus !== 'idle' && (
        <div
          style={{
            position: 'fixed',
            bottom: '25px',
            right: '25px',
            width: '350px',
            background: 'rgba(10, 10, 16, 0.85)',
            backdropFilter: 'blur(16px)',
            border: upscaleStatus === 'success' 
              ? '1px solid rgba(0, 255, 136, 0.5)' 
              : (upscaleStatus === 'failed' ? '1px solid rgba(255, 68, 68, 0.5)' : '1px solid rgba(0, 255, 136, 0.25)'),
            borderRadius: '16px',
            boxShadow: upscaleStatus === 'success'
              ? '0 8px 32px rgba(0, 255, 136, 0.15)'
              : '0 8px 32px rgba(0, 0, 0, 0.5)',
            padding: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: 350000,
            color: '#fff',
            fontFamily: 'Inter, sans-serif',
            animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {upscaleStatus === 'enhancing' ? (
            <div className="spinner" style={{ width: '28px', height: '28px', border: '3px solid rgba(0, 255, 136, 0.1)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          ) : (
            upscaleStatus === 'success' ? (
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0, 255, 136, 0.15)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: 'bounceIn 0.5s ease' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            ) : (
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255, 68, 68, 0.15)', border: '1px solid #ff4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </div>
            )
          )}
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes slideIn {
              from { transform: translateY(100px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
            @keyframes bounceIn {
              0% { transform: scale(0.3); opacity: 0; }
              50% { transform: scale(1.1); }
              70% { transform: scale(0.9); }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: upscaleStatus === 'success' ? 'var(--accent)' : (upscaleStatus === 'failed' ? '#ff4444' : '#00d2ff'), letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {upscaleStatus === 'enhancing' ? 'AI Super-Resolution Active' : (upscaleStatus === 'success' ? 'Upscale Finished!' : 'Upscale Failed')}
            </h4>
            <p style={{ margin: 0, fontSize: '11px', color: '#ccc', lineHeight: '1.4' }}>
              {upscaleStatus === 'enhancing' 
                ? (lastEnhancedTitle ? `Processing "${lastEnhancedTitle}"...` : 'Upscaling target...') 
                : (upscaleStatus === 'success' ? `Hey, your upscale for "${lastEnhancedTitle}" is finished! Enjoy your high-fidelity asset.` : 'An error occurred during upscaling.')}
            </p>
            
            {upscaleStatus === 'enhancing' && (
              <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    background: 'linear-gradient(90deg, var(--accent), #00d2ff)', 
                    width: '75%',
                    borderRadius: '2px',
                    animation: 'shimmerBar 40s linear forwards'
                  }} 
                />
                <style>{`
                  @keyframes shimmerBar {
                    0% { width: 5%; }
                    5% { width: 25%; }
                    20% { width: 45%; }
                    50% { width: 70%; }
                    80% { width: 85%; }
                    95% { width: 92%; }
                    100% { width: 95%; }
                  }
                `}</style>
              </div>
            )}
          </div>
        </div>
      )}

      {aiServerOffline && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(5, 5, 8, 0.85)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 360000
          }}
        >
          <div
            style={{
              background: 'rgba(24, 18, 18, 0.75)',
              border: '1px solid rgba(255, 78, 78, 0.15)',
              borderRadius: '20px',
              padding: '30px',
              maxWidth: '450px',
              width: '90%',
              boxShadow: '0 30px 60px rgba(0,0,0,0.8)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            <div style={{ color: '#ff4e4e', display: 'flex', justifyContent: 'center' }}>
              <AlertCircle size={48} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#ff4e4e' }}>AI ENHANCER OFFLINE</h3>
              <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#aaa', lineHeight: 1.5 }}>
                The local PyTorch/RTX upscaling server at port 12000 is not running or failed to initialize.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setAiServerOffline(false);
                  setShowSaveCropOptions(true);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
              >
                BACK
              </button>
              <button
                onClick={() => setAiServerOffline(false)}
                style={{
                  background: '#ff4e4e',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = '#ff6b6b'}
                onMouseOut={e => e.currentTarget.style.background = '#ff4e4e'}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
