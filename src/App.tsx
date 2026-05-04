import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ResizeHandles } from './components/ResizeHandles';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion, AnimatePresence } from 'framer-motion';
import type { VideoItem, RepeatMode, TelemetryData } from './types';
import { VideoCard } from './components/VideoCard';
import { SortableVideoCard } from './components/SortableVideoCard';
import { VideoGrid } from './components/VideoGrid';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ClockDisplay } from './components/ClockDisplay';
import { ControlBar } from './components/ControlBar';
import { ContextMenu } from './components/ContextMenu';
import { ShareModal } from './components/ShareModal';
import { SymphonyWorkshop } from './components/SymphonyWorkshop';
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
import { Minimize2, CheckCircle2, Search, LayoutGrid, Zap, Trash2, RotateCcw, RefreshCw, Bookmark, Layers, Monitor, Plus, ListRestart, Gauge, Volume2, Pause, Play, VolumeX, Repeat, Repeat1, Eye, EyeOff, Settings, X } from 'lucide-react';
import { useWorkspacePersistence } from './hooks/useWorkspacePersistence';
import { useWorkspaceControls } from './hooks/useWorkspaceControls';
import { TELEMETRY_INTERVAL, ROW_THRESHOLD_PX, ROW_MATCH_THRESHOLD, LAYOUT_CALC_DELAY, MIN_ZOOM, MAX_ZOOM, SWIPE_THRESHOLD, DRAG_ACTIVATION_DISTANCE, PERSISTENCE_DEBOUNCE, FPS, STEP_INTERVAL, STEP_DELAY, SNAPSHOT_TOAST_DURATION, SNAPSHOT_THUMBNAIL_DURATION, IMMERSIVE_HIDE_DELAY } from './constants';
import { convertToVideoUrl, isValidVideoExtension, getFileNameFromPath } from './utils/videoUtils';
import { handleError, isAbortError } from './utils/errorHandler';

function ClockDisplayWrapper() {
  return <ClockDisplay />;
}

// TELEMETRY SYSTEM (Isolated) - with AbortController to prevent request pileup
function TelemetrySystem({ videosCount }: { videosCount: number }) {
  const [telemetry, setTelemetry] = useState<TelemetryData>({ cpu: '0%', mem: '0/0GB', gpu: 'RTX 5080' });
  
  useEffect(() => {
    let mounted = true;
    const abortController = new AbortController();
    
    const poll = async () => {
      if (!mounted || abortController.signal.aborted) return;
      
        try {
        const data = await invoke<TelemetryData>('get_telemetry');
          if (data && mounted && !abortController.signal.aborted) {
            setTelemetry(data);
          }
        } catch (err) {
          if (!isAbortError(err) && mounted && !abortController.signal.aborted) {
            handleError(err, 'telemetry', { logToConsole: true });
          }
        }
    };
    
      const interval = setInterval(poll, TELEMETRY_INTERVAL);
    poll();
    
    return () => {
      mounted = false;
      abortController.abort();
      clearInterval(interval);
    };
  }, []);

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
  const [timeLeft, setTimeLeft] = useState(10);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [motionActive, setMotionActive] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragFile, setDragFile] = useState(false);
  const [masterPlaying, setMasterPlaying] = useState(true);
  const [masterMuted, setMasterMuted] = useState(true);
  const [masterMutedOverride, setMasterMutedOverride] = useState(false);
  const [globalVolume, setGlobalVolume] = useState(0);
  const [preMuteVolume, setPreMuteVolume] = useState(1);
  const [masterShowUI, setMasterShowUI] = useState(true);

  const [showSettings, setShowSettings] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showSymphonyWorkshop, setShowSymphonyWorkshop] = useState(false);
  
  useEffect(() => {
    localStorage.setItem('show_workshop', showSymphonyWorkshop.toString());
  }, [showSymphonyWorkshop]);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showImmersiveUI, setShowImmersiveUI] = useState(true);
  const immersiveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('contain');
  const [isFS, setIsFS] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

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
  const [sharingVideo, setSharingVideo] = useState<VideoItem | null>(null);
  const [logs, setLogs] = useState<{ t: string, m: string }[]>([]);
  const addLog = useCallback((m: string) => {
    setLogs(p => [{ t: new Date().toLocaleTimeString(), m }, ...p].slice(0, 50));
    if (m.toLowerCase().includes("snapshot")) {
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
    idToRow, setIdToRow,
    rowOffsets, setRowOffsets,
    rotIdx, setRotIdx,
    onToggleFocus,
    jumpToUnit
  } = useWorkspaceControls(addLog);

  const [nextSetVideos, setNextSetVideos] = useState<VideoItem[]>([]);

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

  const toggleMasterMute = () => {
    const newState = !masterMuted;
    setMasterMuted(newState);
    setMasterMutedOverride(true);
    
    if (newState) {
      setPreMuteVolume(globalVolume);
      setGlobalVolume(0);
    } else {
      setGlobalVolume(preMuteVolume > 0 ? preMuteVolume : 1);
    }
    
    addLog(`System Volume: ${newState ? 'OFF' : 'ON'}`);
  };

  const toggleMasterPlay = () => {
    const newState = !masterPlaying;
    setMasterPlaying(newState);
    setVideos(p => p.map(v => ({ ...v, playing: newState })));
  };

  const handleRemove = useCallback((id: string) => {
    if (confirmDeletion) {
      if (!window.confirm("ARE YOU SURE?\nThis will remove the unit from the workstation.")) return;
    }
    setVideos(p => p.filter(x => x.id !== id));
    addLog("Unit Decommissioned");
  }, [setVideos, addLog, confirmDeletion]);

  const handleFocus = useCallback((id: string) => {
    setFocusedId(id);
  }, [setFocusedId]);

  const handleDeepFocus = useCallback((id: string) => {
    if (focusedId === id && immersive) {
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
  }, [focusedId, immersive, setFocusedId, setImmersive, setIsFS, rotating, setRotating, addLog]);

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

  const onUpdateVideo = handleUpdate;
  const onRemoveVideo = handleRemove;

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
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const filtered = useMemo(() => {
    if (!Array.isArray(videos)) return [];
    return videos.filter(v => {
      const t = v.title || 'Untitled Unit';
      const s = search || '';
      return t.toLowerCase().includes(s.toLowerCase());
    });
  }, [videos, search]);

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
          realPath: undefined, 
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
      const next = [...prev];
      const [moved] = next.splice(f, 1);
      next.splice(t, 0, moved);
      return next;
    });
    setDragId(null);
  }, [setVideos]);

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
          invoke('exit_app').catch(console.error);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionDuration, addLog, setRotating]);

  useEffect(() => {
    if (isPopout) return;
    if (!rotating) {
      setTimeLeft(rotationInterval);
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setRotIdx(curr => (curr + 1) % Math.max(1, rowOffsets.length));
          return rotationInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [rotating, rotationInterval, rowOffsets.length, isPopout, setRotIdx]);

  useEffect(() => {
    if (rotating) {
      setTimeLeft(rotationInterval);
    }
  }, [rotating, rotationInterval]);

  useEffect(() => {
    if (isPopout) return;
    
    const calculateRows = () => {
      try {
        const items = document.querySelectorAll('.grid-item-wrap');
        if (items.length === 0) {
          setRowOffsets([]);
          return;
        }

        const rawOffsets: number[] = [];
        items.forEach(el => rawOffsets.push((el as HTMLElement).offsetTop));
        
        const sortedRaw = [...rawOffsets].sort((a, b) => a - b);
        const distinctRows: number[] = [];
        sortedRaw.forEach(top => {
          if (distinctRows.length === 0 || Math.abs(top - distinctRows[distinctRows.length - 1]) > ROW_THRESHOLD_PX) {
            distinctRows.push(top);
          }
        });

        const tempIdToRow: Record<string, number> = {};
        items.forEach(el => {
          const id = (el as HTMLElement).getAttribute('data-id');
          const top = (el as HTMLElement).offsetTop;
          if (id) {
            const rowIdx = distinctRows.findIndex(r => Math.abs(r - top) < ROW_MATCH_THRESHOLD);
            tempIdToRow[id] = rowIdx;
          }
        });

        setIdToRow(tempIdToRow);
        setRowOffsets(distinctRows);
      } catch (err) { 
        console.error("Layout Calc Error:", err); 
      }
    };

    const timer = setTimeout(calculateRows, LAYOUT_CALC_DELAY);
    const observer = new ResizeObserver(() => calculateRows());
    const grid = document.querySelector('.video-grid');
    if (grid) observer.observe(grid);
    
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [videos.length, zoom, immersive, filtered.length, isPopout, setIdToRow, setRowOffsets]);

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

   // GLOBAL KEYBOARD MASTERY - MODAL PERSISTENCE (v3.2.5)
   useEffect(() => {
     const handleKeys = (e: KeyboardEvent) => {
       if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
       const key = e.key.toLowerCase();
       
       if (key >= '1' && key <= '8') { 
         setZoom(parseInt(key) * 2); 
         addLog(`Grid Density: ${key} mode`); 
         return; 
       }
       
       switch(key) {
         case 's':
           e.preventDefault();
           const tId = focusedId || (filtered.length > 0 ? filtered[0].id : null);
           if (tId) setGlobalControl(`snapshot-${tId}-${Date.now()}`);
           break;
         case ' ':
           e.preventDefault();
           if (focusedId) {
             const v = videos.find(x => x.id === focusedId);
             if (v) onUpdateVideo(v.id, { playing: !v.playing });
           } else {
             toggleMasterPlay();
           }
           break;
         case 'f':
           if (filtered.length > 0) onToggleFocus(focusedId ? null : filtered[0].id);
           break;

  useEffect(() => {
    if (isPopout) return;

    const stopDefaults = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', stopDefaults);
    window.addEventListener('drop', stopDefaults);
    
    let unlistenDrop: any;
    let unlistenEnter: any;
    let unlistenLeave: any;

    const setupListeners = async () => {
      try {
        const win = getCurrentWindow();
        
        unlistenDrop = await win.listen('tauri://drag-drop', async (event: any) => {
          setDragFile(false);
          const paths = event.payload.paths;
          if (!paths || paths.length === 0) return;
          
          addLog(`System: Intercepting ${paths.length} drop assets...`);
          
           const newVids: VideoItem[] = [];
           for (const path of paths) {
             try {
                const folderVids = await invoke<{ name: string, url: string }[]>('get_folder_videos', { path });
                if (folderVids && folderVids.length > 0) {
                  addLog(`Ingesting Set: ${path} (${folderVids.length} units)`);
                  const folderWithUrls = folderVids.map(v => ({ ...v, url: convertFileSrc(v.url) }));
                  newVids.push({ 
                    id: crypto.randomUUID(), 
                    url: folderWithUrls[0].url, 
                    realPath: path, 
                    title: getFileNameFromPath(path) || 'Set', 
                    repeatMode: 'folder', 
                    repeatCount: 0, 
                    cols: 1, 
                    folderFiles: folderWithUrls, 
                    currentIdx: 0, 
                    playing: masterPlayingRef.current, 
                    muted: masterMutedRef.current 
                  });
                  continue;
                }
                
                 if (isValidVideoExtension(path)) {
                   const lastSep = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
                   const parentPath = lastSep !== -1 ? path.substring(0, lastSep) : '.';
                   let folderFiles: { name: string, url: string }[] = [];
                   
                   try {
                     const siblings = await invoke<{ name: string, url: string }[]>('get_folder_videos', { path: parentPath });
                     if (siblings && siblings.length > 1) {
                        folderFiles = siblings.map(v => ({ ...v, url: convertFileSrc(v.url) }));
                     }
                   } catch (e) {
                     console.warn("Could not fetch siblings:", e);
                   }

                   const filename = getFileNameFromPath(path);
                   const currentIdx = folderFiles.findIndex(f => f.name === filename);

                   newVids.push({ 
                     id: crypto.randomUUID(), 
                     url: convertFileSrc(path), 
                     realPath: path, 
                     title: filename, 
                     repeatMode: folderFiles.length > 0 ? 'folder' : 'none', 
                     repeatCount: 0, 
                     cols: 1, 
                     folderFiles: folderFiles.length > 0 ? folderFiles : undefined,
                     currentIdx: currentIdx !== -1 ? currentIdx : 0,
                     playing: masterPlayingRef.current, 
                     muted: masterMutedRef.current 
                   });
                 }
             } catch (err) { 
               console.error("Ingestion Error:", err); 
             }
           }
          
           if (newVids.length > 0) {
             setVideos(prev => [...prev, ...newVids]);
             addLog(`System: Successfully ingested ${newVids.length} units.`);
           }
        });

        unlistenEnter = await win.listen('tauri://drag-enter', () => setDragFile(true));
        unlistenLeave = await win.listen('tauri://drag-leave', () => setDragFile(false));
      } catch (err) { console.error("Listener Setup Error:", err); }
    };

    setupListeners();

     return () => {
       window.removeEventListener('dragover', stopDefaults);
       window.removeEventListener('drop', stopDefaults);
       safeUnlisten(unlistenDrop);
       safeUnlisten(unlistenEnter);
       safeUnlisten(unlistenLeave);
    };
  }, [isPopout, setVideos, addLog]);

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

  useEffect(() => {
    if (!rotating || !scrollRef.current || rowOffsets.length === 0) return;
    scrollRef.current.scrollTo({ top: rowOffsets[rotIdx] || 0, behavior: 'smooth' });
  }, [rotIdx, rotating, rowOffsets]);

  if (fatalError) return <ErrorFallback error={fatalError} />;

  if (isPopout) {
    return (
      <div className="popout-root" style={{ background: '#000', width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <video 
          className="popout-video"
          src={popoutUrl || ''} 
          autoPlay 
          controls 
          style={{ width: '100%', height: '100%', objectFit: 'contain', outline: 'none' }} 
        />
        <button 
          onClick={() => getCurrentWindow().close()}
          style={{ position: 'absolute', top: '20px', right: '20px', background: '#222', border: '1px solid #444', color: '#fff', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', zIndex: 100 }}
        >
          Stop Stream
        </button>
      </div>
    );
  }

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
          <motion.div initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }} className="toast-notification">
            <CheckCircle2 size={16} /> <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {dragFile && <div className="drag-overlay"><img src="/logo.png" className="empty-logo-img" /><p>Drop to Add Videos</p></div>}
      
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
          onRemoveVideo={handleRemove}
          onToggleFocus={onToggleFocus}
          onLog={addLog}
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
          isFS={isFS}
          confirmDeletion={confirmDeletion}
          setConfirmDeletion={setConfirmDeletion}
          setIsFS={setIsFS}
          isPopout={isPopout}
          showHelp={showHelp}
          setShowHelp={setShowHelp}
          showShare={showShare}
          setShowShare={setShowShare}
          showSymphonyWorkshop={showSymphonyWorkshop}
          setShowSymphonyWorkshop={setShowSymphonyWorkshop}
          toggleMasterMute={toggleMasterMute}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
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
          onRemoveVideo={handleRemove}
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
        />

       {!immersive && (
         <footer className="app-footer">
           <TelemetrySystem videosCount={videos.length} />
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
              case 'remove': onRemoveVideo(v.id); break;
              case 'focus': onToggleFocus(v.id); break;
              case 'snapshot': invoke('save_snapshot', { id: v.id, path: v.realPath }); break;
              case 'folder': invoke('open_folder', { path: v.realPath }); break;
              case 'popout': invoke('pop_out', { id: v.id, url: v.url, title: v.title }); break;
              case 'share': setSharingVideo(v); break;
              case 'rename_selected':
                setGlobalControl(`batch-rename-selected-${Date.now()}`);
                break;
              case 'rename':
                if (v.realPath) {
                  const currentName = v.title.replace(/\.[^/.]+$/, "");
                  const newName = window.prompt("RENAME UNIT\nEnter new name (extension preserved):", currentName);
                  if (newName && newName !== currentName) {
                    invoke<string>('rename_video', { oldPath: v.realPath, newName })
                      .then((newPath) => {
                        const extension = v.title.substring(v.title.lastIndexOf('.'));
                        onUpdateVideo(v.id, { 
                          realPath: newPath, 
                          url: convertFileSrc(newPath),
                          title: `${newName}${extension}` 
                        });
                        addLog(`Unit renamed: ${newName}${extension}`);
                      })
                      .catch(err => {
                        console.error("Rename failed:", err);
                        alert(`Rename failed: ${err}`);
                      });
                  }
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
            onLog={() => {}}
            onFocus={() => {}}
            isFocused={false}
            onCloseFocus={() => {}}
            globalControl={null}
            masterPlaying={false}
            masterMuted={true}
            globalVolume={0}
            masterShowUI={false}
            toggleMasterMute={() => {}}
            toggleMasterPlay={() => {}}
            onEnded={() => {}}
            onContextMenu={() => {}}
            onDeepFocus={() => {}}
          />
        ))}
      </div>

      <ShareModal 
        isOpen={!!sharingVideo} 
        onClose={() => setSharingVideo(null)} 
        title={sharingVideo?.title || 'COSMO SYMPHONY'}
        description={`Video Source: ${sharingVideo?.realPath || 'Symphony Asset'}`}
      />
      {showSymphonyWorkshop && <SymphonyWorkshop onClose={() => setShowSymphonyWorkshop(false)} addLog={addLog} />}
    </main>
  );
}
