import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import { ClockDisplay } from './components/ClockDisplay';
import { ContextMenu } from './components/ContextMenu';
import { SymphonyWorkshop } from './components/SymphonyWorkshop';
import { HelpModal } from './components/HelpModal';
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
import { Minimize2, CheckCircle2, Search, LayoutGrid, Zap, Trash2, RotateCcw, RefreshCw, Bookmark, Layers, Monitor, Plus, ListRestart, Gauge, Volume2, Pause, Play, VolumeX, Repeat, Repeat1, Eye, EyeOff, Settings, X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
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

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const isPopout = urlParams.get('popout') === 'true';
  const popoutUrl = urlParams.get('url');

  const [globalControl, setGlobalControl] = useState<string | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0); 
  const [speed, setSpeed] = useState(1);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [motionActive, setMotionActive] = useState(false);
  const [isFS, setIsFS] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragFile, setDragFile] = useState(false);
  const [masterPlaying, setMasterPlaying] = useState(true);
  const [masterMuted, setMasterMuted] = useState(true);
  const [masterMutedOverride, setMasterMutedOverride] = useState(false);
  const [globalVolume, setGlobalVolume] = useState(0);
  const [masterShowUI, setMasterShowUI] = useState(true);

  const [showSettings, setShowSettings] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [mediaMode, setMediaMode] = useState<'video' | 'picture'>(() => {
    const saved = localStorage.getItem('cosmo-media-mode');
    return saved === 'picture' ? 'picture' : 'video';
  });
  const [showSymphonyWorkshop, setShowSymphonyWorkshop] = useState(false);
  const [renameHistory, setRenameHistory] = useState<string[]>([]);

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
  
  useEffect(() => {
    localStorage.setItem('show_workshop', showSymphonyWorkshop.toString());
  }, [showSymphonyWorkshop]);

  useEffect(() => {
    localStorage.setItem('cosmo-media-mode', mediaMode);
  }, [mediaMode]);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showImmersiveUI, setShowImmersiveUI] = useState(true);
  const immersiveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('contain');
  const [toast, setToast] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
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
    theme, setTheme,
    globalRepeat, setGlobalRepeat,
    confirmDeletion, setConfirmDeletion,
    isInitialized, setIsInitialized
  } = useWorkspacePersistence(addLog, isPopout, masterMuted, masterPlaying);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const {
    zoom, setZoom,
    search, setSearch,
    focusedId, setFocusedId,
    immersive, setImmersive,
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

  const handleDecommission = useCallback((id: string) => {
    if (confirmDeletion) {
      if (!window.confirm("PROTOCOL: DECOMMISSION UNIT\n\nThis will remove the unit from the workstation list.\nThe physical file on your disk will NOT be affected.\n\nProceed?")) return;
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
    addLog("Unit Decommissioned (List Only)");
  }, [setVideos, addLog, confirmDeletion, focusedId, filtered, setFocusedId, setImmersive, setIsFS]);

  const handleAnnihilate = useCallback(async (id: string) => {
    const video = videos.find(v => v.id === id);
    if (!video || !video.realPath) {
      addLog("Annihilation Error: Native path missing");
      return;
    }

    if (confirmDeletion) {
      if (!window.confirm(`PROTOCOL: ANNIHILATE ASSET\n\nTarget: ${video.title}\n\nThis will physically MOVE THE FILE TO THE RECYCLE BIN.\nThis action is reversible via the OS Recycle Bin, but the file will be gone from disk.\n\nPROCEED WITH DESTRUCTION?`)) return;
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

  const handleBatchRemove = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (confirmDeletion) {
      if (!window.confirm(`PROTOCOL: BATCH DECOMMISSION\n\nThis will remove ${selectedIds.size} units from the workstation.\nFiles will remain physically on disk.\n\nProceed?`)) return;
    }
    setVideos(p => p.filter(x => !selectedIds.has(x.id)));
    addLog(`${selectedIds.size} Units Decommissioned`);
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
    if (time !== undefined) {
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

    if (video?.realPath) {
      try {
        const data = await invoke('get_video_metadata', { path: video.realPath });
        setMenuMetadata(data);
      } catch (e) {
        console.error("Failed to fetch metadata", e);
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
     if (immersive && !showImmersiveUI) {
       document.documentElement.setAttribute('data-ghost', 'true');
     } else {
       document.documentElement.removeAttribute('data-ghost');
     }
   }, [immersive, showImmersiveUI]);

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



  if (fatalError) return <ErrorFallback error={fatalError} />;

  if (isPopout) {
    const isImage = isValidPictureExtension((popoutUrl || '').split('?')[0]);
    return (
      <div className="popout-root" style={{ background: '#000', width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {isImage ? (
          <img 
            className="popout-image"
            src={popoutUrl || ''} 
            style={{ width: '100%', height: '100%', objectFit: 'contain', outline: 'none' }} 
            alt="Popped Out Still"
          />
        ) : (
          <video 
            className="popout-video"
            src={popoutUrl || ''} 
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
                    globalRepeat={globalRepeat}
                    globalSpeed={speed}
                    fitMode={fitMode}
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
                    masterPlaying={masterPlaying}
                    masterMuted={masterMuted}
                    globalVolume={globalVolume}
                    masterShowUI={showImmersiveUI}
                    onEnded={handleVideoEnded}
                    toggleMasterMute={toggleMasterMute}
                    toggleMasterPlay={toggleMasterPlay}
                    onContextMenu={handleContext}
                    onDeepFocus={(time) => handleDeepFocus(focusedId, time)}
                    isVisible={true}
                    onNavigateSibling={handleNavigateSibling}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Floating Glassmorphic Solo Control Bar */}
          {!isFocusedImage && (
            <div 
              className="solo-control-bar" 
              style={{
                position: 'absolute',
                bottom: '40px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100000,
                background: 'rgba(10, 10, 12, 0.75)',
                backdropFilter: 'blur(16px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '30px',
                padding: '6px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                pointerEvents: showImmersiveUI ? 'auto' : 'none',
                opacity: showImmersiveUI ? 1 : 0,
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                userSelect: 'none'
              }}
            >
              {/* Previous Sibling Button */}
              <button 
                onClick={() => handleNavigateSibling(-1)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  borderRadius: '50%',
                  transition: 'background 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseOut={e => e.currentTarget.style.background = 'none'}
                title="Previous Picture"
              >
                <ChevronLeft size={20} />
              </button>

              {/* Slideshow Active Toggle & Timer Speed (Wheel Scrollable) */}
              <div 
                className="slideshow-wheel-adjuster"
                onWheel={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSlideshowInterval(prev => {
                    const direction = e.deltaY < 0 ? 1 : -1;
                    const next = Math.max(1, Math.min(60, prev + direction));
                    addLog(`Slideshow interval: ${next}s`);
                    return next;
                  });
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '2px 6px',
                  borderRadius: '20px',
                  cursor: 'ns-resize'
                }}
                title="Scroll Wheel to change timer speed (1s - 60s)"
              >
                <button 
                  onClick={() => {
                    setIsSlideshowActive(!isSlideshowActive);
                    addLog(`Slideshow ${!isSlideshowActive ? 'Running' : 'Stopped'}`);
                  }}
                  style={{
                    background: isSlideshowActive ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)',
                    border: 'none',
                    color: isSlideshowActive ? '#000' : '#fff',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseOver={e => {
                    if (!isSlideshowActive) e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                  }}
                  onMouseOut={e => {
                    if (!isSlideshowActive) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  }}
                >
                  {isSlideshowActive ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', minWidth: '55px', lineHeight: 1.1 }}>
                  <span style={{ fontSize: '8px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Slideshow</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: isSlideshowActive ? 'var(--accent)' : '#fff' }}>
                    {slideshowInterval}s
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.12)' }} />

              {/* Next Sibling Button */}
              <button 
                onClick={() => handleNavigateSibling(1)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  borderRadius: '50%',
                  transition: 'background 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseOut={e => e.currentTarget.style.background = 'none'}
                title="Next Picture"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
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
          zoom={zoom}
          setZoom={setZoom}
          speed={speed}
          setSpeed={setSpeed}
          theme={theme}
          setTheme={setTheme}
          alwaysOnTop={alwaysOnTop}
          setAlwaysOnTop={setAlwaysOnTop}
          masterPlaying={masterPlaying}
          setMasterPlaying={setMasterPlaying}
          masterMuted={masterMuted}
          setMasterMuted={setMasterMuted}
          globalVolume={globalVolume}
          setGlobalVolume={setGlobalVolume}
          globalRepeat={globalRepeat}
          setGlobalRepeat={setGlobalRepeat}
          immersive={immersive}
          setImmersive={setImmersive}
          rotating={rotating}
          setRotating={setRotating}
          sessionDuration={sessionDuration}
          setSessionDuration={setSessionDuration}
          fitMode={fitMode}
          setFitMode={setFitMode}
          masterShowUI={showImmersiveUI}
          setMasterShowUI={setShowImmersiveUI}
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
          mediaMode={mediaMode}
          setMediaMode={setMediaMode}
          newCollectionName={newCollectionName}
          setNewCollectionName={setNewCollectionName}
          logs={logs}
          isFS={isFS}
          confirmDeletion={confirmDeletion}
          setConfirmDeletion={setConfirmDeletion}
          setIsFS={setIsFS}
          isPopout={isPopout}
          showHelp={showHelp}
          setShowHelp={setShowHelp}
          showSymphonyWorkshop={showSymphonyWorkshop}
          setShowSymphonyWorkshop={setShowSymphonyWorkshop}
          toggleMasterMute={toggleMasterMute}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
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
          onSelectAll={handleSelectAll}
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
          onAction={(action) => {
            const v = videos.find(x => x.id === menu.id);
            if (!v) return;
            
            switch(action) {
              case 'play': onUpdateVideo(v.id, { playing: !v.playing }); break;
              case 'mute': onUpdateVideo(v.id, { muted: !v.muted }); break;
              case 'stop': onUpdateVideo(v.id, { playing: false }); break;
              case 'decommission': handleDecommission(v.id); break;
              case 'annihilate': handleAnnihilate(v.id); break;
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
               case 'folder': 
                 if (v.realPath) {
                   invoke('open_folder', { path: v.realPath }); 
                 } else {
                   addLog("Error: Native path lost for this unit.");
                 }
                 break;
              case 'popout': invoke('pop_out', { id: v.id, url: v.url, title: v.title }); break;
              case 'rename_selected':
                setGlobalControl(`batch-rename-selected-${Date.now()}`);
                break;
              case 'rename':
                if (v.realPath) {
                  const currentName = v.title.replace(/\.[^/.]+$/, "");
                  setSingleRenameTarget(v);
                  setSingleRenameValue(currentName);
                  setShowSingleRenameDropdown(false);
                }
                break;
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
            globalRepeat={globalRepeat}
            globalSpeed={speed}
            fitMode={fitMode}
            onUpdateVideo={() => {}}
            onRemove={() => {}}
            onAnnihilate={() => {}}
            onLog={() => {}}
            onFocus={() => {}}
            isFocused={false}
            onCloseFocus={() => {}}
            globalControl={null}
            masterPlaying={false}
            masterMuted={true}
            globalVolume={0}
            masterShowUI={false}
            isVisible={false}
            toggleMasterMute={() => {}}
            toggleMasterPlay={() => {}}
            onEnded={() => {}}
            onContextMenu={() => {}}
            onDeepFocus={() => {}}
          />
        ))}
      </div>

      {showSymphonyWorkshop && <SymphonyWorkshop onClose={() => setShowSymphonyWorkshop(false)} addLog={addLog} />}
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

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
                      onChange={(e) => {
                        setSingleRenameValue(e.target.value);
                        setShowSingleRenameDropdown(true);
                      }}
                      onFocus={() => setShowSingleRenameDropdown(true)}
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
                          .filter(item => !singleRenameValue || item.toLowerCase().includes(singleRenameValue.toLowerCase()))
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
                          setRenameHistory(prev => {
                            const next = [newName, ...prev.filter(item => item !== newName)].slice(0, 50);
                            invoke('save_persistence', { key: 'rename_history', data: JSON.stringify(next) }).catch(() => {});
                            return next;
                          });
                          
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
    </main>
  );
}
