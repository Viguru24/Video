import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { ResizeHandles } from './components/ResizeHandles';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion, AnimatePresence } from 'framer-motion';
import type { VideoItem, RepeatMode, TelemetryData, CollageItem, CollageConfig } from './types';
import { CollageWorkspace } from './components/CollageWorkspace';
import { VideoCard } from './components/VideoCard';
import { SortableVideoCard } from './components/SortableVideoCard';
import { VideoGrid } from './components/VideoGrid';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ControlBar } from './components/ControlBar';
import { useStore } from './store/useStore';
import { ClockDisplay } from './components/ClockDisplay';
import { ContextMenu } from './components/ContextMenu';
import { ColorAdjustmentPanel } from './components/ColorAdjustmentPanel';
import { ColorFilterDefs } from './components/ColorFilterDefs';
import { DEFAULT_COLOR_FILTERS } from './types';
const SymphonyWorkshop = lazy(() => import('./components/SymphonyWorkshop').then(m => ({ default: m.SymphonyWorkshop })));
const HelpModal = lazy(() => import('./components/HelpModal').then(m => ({ default: m.HelpModal })));

// Modular Component Imports
import { ErrorFallback } from './components/ErrorFallback';
import { ClockDisplayWrapper } from './components/ClockDisplayWrapper';
import { TelemetrySystem } from './components/TelemetrySystem';
import { CropOverlay } from './components/CropOverlay';
import { PopoutPlayer } from './components/PopoutPlayer';
import { SoloPlayer } from './components/SoloPlayer';
import { FileManagementModal } from './components/FileManagementModal';

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
import { Minimize2, CheckCircle2, Search, LayoutGrid, Zap, Trash2, RotateCcw, RefreshCw, Bookmark, Layers, Monitor, Plus, ListRestart, Gauge, Volume2, Pause, Play, VolumeX, Repeat, Repeat1, Eye, EyeOff, Settings, X, ChevronLeft, ChevronRight, ChevronDown, Camera, Crop, AlertCircle, Sparkles, HelpCircle, Hash, Menu, SkipBack, SkipForward, Sliders, FolderOpen } from 'lucide-react';
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
  toCosmoUrl,
  isTauri,
  showConfirm,
  pathsEqual
} from './utils/videoUtils';
import { handleError, isAbortError } from './utils/errorHandler';

export default function App() {
  const { mediaMode, setMediaMode, theme, setTheme, alwaysOnTop, setAlwaysOnTop, isFS, setIsFS, masterPlaying, setMasterPlaying, masterMuted, setMasterMuted, globalVolume, setGlobalVolume, speed, setSpeed, globalRepeat, setGlobalRepeat, fitMode, setFitMode, zoom, setZoom, immersive, setImmersive, masterShowUI, setMasterShowUI, selectedIds, setSelectedIds, selectionMode, setSelectionMode, renameHistory, setRenameHistory, addToRenameHistory, aiHardwareStatus, setAiHardwareStatus } = useStore();
  
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    
    let unlistenResize: (() => void) | undefined;
    let unlistenMaximize: (() => void) | undefined;
    let unlistenUnmaximize: (() => void) | undefined;
    const timeouts: any[] = [];

    const checkMaximized = async () => {
      try {
        const isMax = await getCurrentWindow().isMaximized();
        setIsWindowMaximized(isMax);
      } catch (e) {
        console.error("Failed to check if window is maximized:", e);
      }
    };

    // Run initial checks at various delays to prevent startup race conditions
    checkMaximized();
    timeouts.push(setTimeout(checkMaximized, 50));
    timeouts.push(setTimeout(checkMaximized, 200));
    timeouts.push(setTimeout(checkMaximized, 500));
    timeouts.push(setTimeout(checkMaximized, 1000));
    timeouts.push(setTimeout(checkMaximized, 2000));

    const setupListeners = async () => {
      try {
        const win = getCurrentWindow();
        
        unlistenResize = await win.onResized(() => {
          checkMaximized();
          timeouts.push(setTimeout(checkMaximized, 100));
          timeouts.push(setTimeout(checkMaximized, 250));
        });

        unlistenMaximize = await win.listen('tauri://maximize', () => {
          setIsWindowMaximized(true);
          timeouts.push(setTimeout(checkMaximized, 100));
        });

        unlistenUnmaximize = await win.listen('tauri://unmaximize', () => {
          setIsWindowMaximized(false);
          timeouts.push(setTimeout(checkMaximized, 100));
        });
      } catch (err) {
        console.error("Failed to set up Tauri window event listeners:", err);
      }
    };

    setupListeners();

    // Standard DOM resize fallback
    const handleResize = () => {
      checkMaximized();
      timeouts.push(setTimeout(checkMaximized, 150));
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (unlistenResize) unlistenResize();
      if (unlistenMaximize) unlistenMaximize();
      if (unlistenUnmaximize) unlistenUnmaximize();
      window.removeEventListener('resize', handleResize);
      timeouts.forEach(t => clearTimeout(t));
    };
  }, []);
  
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
  const popoutData = (window as any).__POPOUT_DATA__;
  
  // Robust check if current window is a popout
  let isPopoutWindowByLabel = false;
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined) {
      const label = getCurrentWindow().label;
      if (label && label.startsWith('pop-')) {
        isPopoutWindowByLabel = true;
      }
    }
  } catch (e) {
    console.warn("Failed to check window label:", e);
  }

  const isPopout = popoutData?.popout === true || urlParams.get('popout') === 'true' || isPopoutWindowByLabel;
  const popoutUrl = popoutData?.url || urlParams.get('url') || localStorage.getItem('cosmo-popout-active-url');

  const [globalControl, setGlobalControl] = useState<string | null>(null);

  // IMMERSIVE CROPPING SYSTEM
  const [isCropping, setIsCropping] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 15, y: 15, w: 70, h: 70 });
  const [aspectRatio, setAspectRatio] = useState<'free' | '1:1' | '16:9' | '4:3'>('free');
  const [showSaveCropOptions, setShowSaveCropOptions] = useState(false);
  const [showSaveUpscaleOptions, setShowSaveUpscaleOptions] = useState(false);
  const [upscaleTarget, setUpscaleTarget] = useState<VideoItem | null>(null);
  const [enhancingVideoId, setEnhancingVideoId] = useState<string | null>(null);
  const isAiEnhancing = enhancingVideoId !== null;
  const [aiServerOffline, setAiServerOffline] = useState(false);
  const [upscaleStatus, setUpscaleStatus] = useState<'idle' | 'enhancing' | 'success' | 'failed'>('idle');
  const [lastEnhancedTitle, setLastEnhancedTitle] = useState('');
  // Ref used to cancel an in-progress enhancement — set to true to discard result and reset UI
  const enhancementCancelled = useRef(false);
  const [sessionDuration, setSessionDuration] = useState(0); 
  
  
  const [motionActive, setMotionActive] = useState(false);
  
  const [showLogs, setShowLogs] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragFile, setDragFile] = useState(false);
  const [colorAdjustId, setColorAdjustId] = useState<string | null>(null);
  
  
  const [masterMutedOverride, setMasterMutedOverride] = useState(false);
  
  

  const [showSettings, setShowSettings] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  
  const [showSymphonyWorkshop, setShowSymphonyWorkshop] = useState(false);

  // ─── COLLAGE CANVAS STATE ───────────────────────────────────────────────────
  const [showCollageCanvas, setShowCollageCanvas] = useState(false);
  const [collageItems, setCollageItems] = useState<CollageItem[]>([]);
  const [collageConfig, setCollageConfig] = useState<CollageConfig>({
    backgroundType: 'gradient',
    backgroundValue: 'linear-gradient(135deg, #0d081b 0%, #150d2e 50%, #05020c 100%)'
  });

  // Load collage state on mount
  useEffect(() => {
    invoke<string | null>('load_persistence', { key: 'cosmo-collage' }).then(saved => {
      if (saved) {
        try { const p = JSON.parse(saved); if (Array.isArray(p)) setCollageItems(p); } catch {}
      }
    }).catch(() => {});
    invoke<string | null>('load_persistence', { key: 'cosmo-collage-cfg' }).then(saved => {
      if (saved) {
        try { const p = JSON.parse(saved); if (p?.backgroundValue) setCollageConfig(p); } catch {}
      }
    }).catch(() => {});
  }, []);

  // Auto-save collage state on change
  useEffect(() => {
    if (collageItems.length === 0) return;
    invoke('save_persistence', { key: 'cosmo-collage', value: JSON.stringify(collageItems) }).catch(() => {});
  }, [collageItems]);

  useEffect(() => {
    invoke('save_persistence', { key: 'cosmo-collage-cfg', value: JSON.stringify(collageConfig) }).catch(() => {});
  }, [collageConfig]);
  // ─────────────────────────────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', sidebarCollapsed.toString());
  }, [sidebarCollapsed]);

  // Load rename history and drag icon path from Tauri on mount
  useEffect(() => {
    invoke<string | null>('load_persistence', { key: 'rename_history' }).then(saved => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setRenameHistory(parsed);
        } catch { /* ignore corrupt data */ }
      }
    }).catch(() => {});

    if (isTauri()) {
      invoke<string>('get_drag_icon_path').then(p => {
        (window as any).__CRAB_DRAG_ICON__ = p;
      }).catch(err => console.error("Failed to get drag icon path:", err));
    }
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
  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSoloWheelTime = useRef(0);
  const pendingScrollIdRef = useRef<string | null>(null);
  const holdActiveRef = useRef(false);
  const frameStepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameStepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const lastSelectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedIds.size === 0) {
      lastSelectedIdRef.current = null;
    }
  }, [selectedIds]);
  
  const [toast, setToast] = useState<string | null>(null);
  const [toastPath, setToastPath] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  // File System Management States
  const [fileManageOpen, setFileManageOpen] = useState(false);
  const [fileManageItems, setFileManageItems] = useState<VideoItem[]>([]);
  const [fileManageMode, setFileManageMode] = useState<'move' | 'copy'>('move');

  const [customConfirm, setCustomConfirm] = useState<{
    message: string;
    title: string;
    kind?: 'info' | 'warning' | 'error';
    resolve: (value: boolean) => void;
  } | null>(null);

  useEffect(() => {
    (window as any).__customConfirmHandler = (message: string, options?: any) => {
      return new Promise<boolean>((resolve) => {
        setCustomConfirm({
          message,
          title: options?.title || 'CONFIRMATION REQUIRED',
          kind: options?.kind || 'warning',
          resolve
        });
      });
    };
    return () => {
      delete (window as any).__customConfirmHandler;
    };
  }, []);


  const [globalHud, setGlobalHud] = useState<{ label: string; val: string } | null>(null);
  const globalHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerGlobalHud = useCallback((label: string, val: string) => {
    setGlobalHud({ label, val });
    if (globalHudTimerRef.current) clearTimeout(globalHudTimerRef.current);
    globalHudTimerRef.current = setTimeout(() => {
      setGlobalHud(null);
    }, 1200);
  }, []);

  useEffect(() => {
    return () => {
      if (globalHudTimerRef.current) clearTimeout(globalHudTimerRef.current);
    };
  }, []);

  
  
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

  const soloOverlayRef = useRef<HTMLDivElement>(null);
  const soloVolumeContainerRef = useRef<HTMLDivElement>(null);

  const [menu, setMenu] = useState<{ x: number, y: number, id: string } | null>(null);
  const [menuMetadata, setMenuMetadata] = useState<any>(null);
  const [logs, setLogs] = useState<{ t: string, m: string }[]>([]);
  const addLog = useCallback((m: string) => {
    setLogs(p => [{ t: new Date().toLocaleTimeString(), m }, ...p].slice(0, 50));
    const lower = m.toLowerCase();
    if (lower.includes("snapshot") || lower.includes("decommission") || lower.includes("annihilate") || lower.includes("deleted")) {
      let toastMsg = m;
      if (m.includes("Snapshot saved to: ")) {
        const path = m.split("Snapshot saved to: ")[1];
        setToastPath(path);
        toastMsg = `SUCCESS: Snapshot saved to ${path.split(/[\\/]/).pop()}`;
      }
      setToast(toastMsg);
      setTimeout(() => {
        setToast(null);
        setToastPath(null);
      }, SNAPSHOT_THUMBNAIL_DURATION);
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

  // Extract all currently loaded folders in the grid
  const activeGridFolders = useMemo(() => {
    const folders = new Set<string>();
    videos.forEach(v => {
      if (v.folderFiles && v.folderFiles.length > 0) {
        if (v.realPath) folders.add(v.realPath);
      } else {
        const path = v.realPath || '';
        const separator = path.includes('\\') ? '\\' : '/';
        const lastSlashIdx = path.lastIndexOf(separator);
        if (lastSlashIdx !== -1) {
          folders.add(path.substring(0, lastSlashIdx));
        }
      }
    });
    return Array.from(folders);
  }, [videos]);

  // Check and process launch arguments (Open With)
  useEffect(() => {
    if (!isTauri() || isPopout) return;

    const processLaunchArgs = async () => {
      try {
        const launchPath = await invoke<string | null>('get_launch_args');
        if (launchPath) {
          addLog(`Open With: Processing path -> ${launchPath}`);
          
          let folderVids: { name: string, url: string }[] = [];
          let isDirectory = false;
          
          try {
            folderVids = await invoke<{ name: string, url: string }[]>('get_folder_videos', { 
              path: launchPath, 
              mode: 'all'
            });
            isDirectory = true;
          } catch (e) {
            isDirectory = false;
          }

          if (isDirectory && folderVids && folderVids.length > 0) {
            folderVids.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            const folderWithUrls = folderVids.map(v => ({ 
              ...v, 
              url: toCosmoUrl(v.url),
              path: v.url 
            }));

            const newVids = folderWithUrls.map((file) => ({
              id: crypto.randomUUID(), 
              url: file.url, 
              realPath: (file as any).path || file.url, 
              title: file.name, 
              repeatMode: 'none' as RepeatMode, 
              repeatCount: 0, 
              cols: 1, 
              currentIdx: 0, 
              playing: masterPlayingRef.current, 
              muted: masterMutedRef.current 
            }));

            setVideos(prev => [...prev, ...newVids]);
            addLog(`Open With: Ingested folder with ${newVids.length} files.`);
          } else {
            const isVideo = isValidMediaExtension(launchPath, 'video');
            const isPicture = isValidMediaExtension(launchPath, 'picture');
            if (isVideo || isPicture) {
              const filename = getFileNameFromPath(launchPath);
              const newUnit = { 
                id: crypto.randomUUID(), 
                url: toCosmoUrl(launchPath), 
                realPath: launchPath, 
                title: filename, 
                repeatMode: 'none' as RepeatMode, 
                repeatCount: 0, 
                cols: 1, 
                currentIdx: 0,
                playing: masterPlayingRef.current, 
                muted: masterMutedRef.current 
              };
              setVideos(prev => [...prev, newUnit]);
              addLog(`Open With: Loaded ${filename}.`);
            }
          }
        }
      } catch (err) {
        console.error("Failed to check launch arguments:", err);
      }
    };

    // Delay slightly to ensure persistence load doesn't race/override the launch file load
    const timer = setTimeout(processLaunchArgs, 800);
    return () => clearTimeout(timer);
  }, [setVideos, addLog, isPopout]);

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

  const focusedVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
  const focusedEffectivePath = focusedVideo
    ? (focusedVideo.folderFiles && focusedVideo.currentIdx !== undefined)
      ? (focusedVideo.folderFiles[focusedVideo.currentIdx]?.path || focusedVideo.folderFiles[focusedVideo.currentIdx]?.url)
      : (focusedVideo.realPath || focusedVideo.url)
    : '';
  const isFocusedImage = focusedEffectivePath ? isValidPictureExtension(focusedEffectivePath) : false;


  const filtered = useMemo(() => {
    if (!Array.isArray(videos)) return [];
    const isValid = (v: VideoItem) => v.realPath ? isValidMediaExtension(v.realPath, mediaMode) : true;
    return videos.filter(v => {
      const t = v.title || 'Untitled Unit';
      const s = search || '';
      return t.toLowerCase().includes(s.toLowerCase()) && isValid(v);
    });
  }, [videos, search, mediaMode]);

  const handleSidebarAddFolder = async () => {
    if (isTauri()) {
      try {
        const path = await invoke<string | null>('select_folder_cmd');
        if (path) {
          const folderVids = await invoke<{ name: string; url: string }[]>('get_folder_videos', { path, mode: mediaMode });
          if (folderVids && folderVids.length > 0) {
            const toAssetUrl = (filePath: string) => toCosmoUrl(filePath);
            const folderWithUrls = folderVids.map((v) => ({ 
              ...v, 
              url: toCosmoUrl(v.url),
              path: v.url
            }));
            setVideos((p) => [
              ...p,
              {
                id: crypto.randomUUID(),
                url: toAssetUrl(folderVids[0].url),
                realPath: folderVids[0].url,
                title: folderVids[0].name,
                repeatMode: 'folder',
                repeatCount: 0,
                cols: 1,
                folderFiles: folderWithUrls,
                currentIdx: 0,
                playing: masterPlaying,
                muted: masterMuted,
              },
            ]);
            addLog(`Added folder: ${path}`);
          }
        }
      } catch (e) {
        addLog(`Ingestion Error: ${e}`);
      }
    } else {
      addLog("Local Ingestion is optimized for Cosmo Symphony Native Desktop.");
    }
  };

  const handleDecommission = useCallback(async (id: string) => {
    if (confirmDeletion) {
      const yes = await showConfirm("Remove this item from your grid?\n\nThis removes the view shortcut, but the physical file on your hard drive will NOT be affected.\n\nProceed?", { title: 'Remove from Grid', kind: 'warning' });
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

  const handleAnnihilate = useCallback(async (id: string, bypassConfirm = false) => {
    const video = videos.find(v => v.id === id);
    if (!video || !video.realPath) {
      addLog("Annihilation Error: Native path missing");
      return;
    }

    if (confirmDeletion && !bypassConfirm) {
      const yes = await showConfirm(`PROTOCOL: ANNIHILATE ASSET\n\nTarget: ${video.title}\n\nThis will physically MOVE THE FILE TO THE RECYCLE BIN.\nThis action is reversible via the OS Recycle Bin, but the file will be gone from disk.\n\nPROCEED WITH DESTRUCTION?`, { title: 'Recycle Bin', kind: 'error' });
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

  const handleFileManagementSuccess = useCallback((updatedItems: { originalId: string; newPath: string }[]) => {
    if (fileManageMode === 'move') {
      setVideos(prevVideos => {
        let currentVideos = [...prevVideos];
        
        updatedItems.forEach(update => {
          const videoItem = currentVideos.find(v => v.id === update.originalId);
          if (!videoItem) return;

          const separator = update.newPath.includes('\\') ? '\\' : '/';
          const targetFolder = update.newPath.substring(0, update.newPath.lastIndexOf(separator));
          const newFileName = update.newPath.substring(update.newPath.lastIndexOf(separator) + 1);
          const newTitle = newFileName.replace(/\.[^/.]+$/, "");

          // Check if the target folder matches an existing folder-unit in the grid
          const destFolderUnit = currentVideos.find(v => v.folderFiles && pathsEqual(v.realPath, targetFolder));

          // A. If the source item was part of a folder cycle unit
          if (videoItem.folderFiles && videoItem.folderFiles.length > 1) {
            // Remove from old folder's file cycle list
            const remainingFiles = videoItem.folderFiles.filter((_, i) => i !== (videoItem.currentIdx || 0));
            const newIdx = Math.max(0, Math.min(videoItem.currentIdx || 0, remainingFiles.length - 1));
            
            // Update the source unit to no longer include this file
            currentVideos = currentVideos.map(v => v.id === videoItem.id ? {
              ...v,
              folderFiles: remainingFiles,
              currentIdx: newIdx,
              url: remainingFiles[newIdx]?.url || '',
              realPath: remainingFiles[newIdx]?.path || '',
              title: remainingFiles[newIdx]?.name || ''
            } : v);

            // B. Add the file to the target destination
            if (destFolderUnit) {
              // Target folder unit exists: append the file to it
              currentVideos = currentVideos.map(v => v.id === destFolderUnit.id ? {
                ...v,
                folderFiles: [...(v.folderFiles || []), { name: newFileName, url: toCosmoUrl(update.newPath), path: update.newPath }]
              } : v);
            } else {
              // Target folder unit does not exist: create an individual unit
              const newIndividual: VideoItem = {
                id: `move-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                title: newTitle,
                url: toCosmoUrl(update.newPath),
                realPath: update.newPath,
                currentTime: 0,
                repeatMode: 'none',
                playing: false,
                muted: false
              };
              currentVideos.push(newIndividual);
            }
          } else {
            // C. If the source item was an individual unit or a folder unit with 1 item
            if (videoItem.folderFiles && videoItem.folderFiles.length <= 1) {
              // Delete the old unit (since the only file in it is moving)
              currentVideos = currentVideos.filter(v => v.id !== videoItem.id);
            }

            if (destFolderUnit) {
              // Target folder unit exists: remove the old individual unit and add file to the target folder unit
              if (!videoItem.folderFiles) {
                currentVideos = currentVideos.filter(v => v.id !== videoItem.id);
              }
              currentVideos = currentVideos.map(v => v.id === destFolderUnit.id ? {
                ...v,
                folderFiles: [...(v.folderFiles || []), { name: newFileName, url: toCosmoUrl(update.newPath), path: update.newPath }]
              } : v);
            } else {
              // Update the individual unit inline (or recreate if it was a single-file folder unit)
              if (videoItem.folderFiles) {
                currentVideos = currentVideos.filter(v => v.id !== videoItem.id);
                const newIndividual: VideoItem = {
                  id: `move-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  title: newTitle,
                  url: toCosmoUrl(update.newPath),
                  realPath: update.newPath,
                  currentTime: 0,
                  repeatMode: 'none',
                  playing: false,
                  muted: false
                };
                currentVideos.push(newIndividual);
              } else {
                currentVideos = currentVideos.map(v => v.id === videoItem.id ? {
                  ...v,
                  url: toCosmoUrl(update.newPath),
                  realPath: update.newPath,
                  title: newTitle
                } : v);
              }
            }
          }
        });

        return currentVideos;
      });

      addLog(`SUCCESS: Moved ${updatedItems.length} assets on disk & synced workspace grid.`);
      setToast(`Moved ${updatedItems.length} asset(s) successfully.`);
      setTimeout(() => setToast(null), 3000);
    } else if (fileManageMode === 'copy') {
      // If we copied the files:
      setVideos(prevVideos => {
        const currentVideos = [...prevVideos];

        updatedItems.forEach(update => {
          const separator = update.newPath.includes('\\') ? '\\' : '/';
          const targetFolder = update.newPath.substring(0, update.newPath.lastIndexOf(separator));
          const newFileName = update.newPath.substring(update.newPath.lastIndexOf(separator) + 1);
          const newTitle = newFileName.replace(/\.[^/.]+$/, "");

          // Check if target folder matches an existing folder unit in the grid
          const destFolderUnit = currentVideos.find(v => v.folderFiles && pathsEqual(v.realPath, targetFolder));

          if (destFolderUnit) {
            // Append to folder unit
            const index = currentVideos.findIndex(v => v.id === destFolderUnit.id);
            if (index !== -1) {
              currentVideos[index] = {
                ...currentVideos[index],
                folderFiles: [...(currentVideos[index].folderFiles || []), { name: newFileName, url: toCosmoUrl(update.newPath), path: update.newPath }]
              };
            }
          } else {
            // Create new individual item
            const newIndividual: VideoItem = {
              id: `copy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: newTitle,
              url: toCosmoUrl(update.newPath),
              realPath: update.newPath,
              currentTime: 0,
              repeatMode: 'none',
              playing: false,
              muted: false
            };
            currentVideos.push(newIndividual);
          }
        });

        return currentVideos;
      });

      addLog(`SUCCESS: Copied ${updatedItems.length} assets on disk & synced workspace grid.`);
      setToast(`Copied ${updatedItems.length} asset(s) successfully.`);
      setTimeout(() => setToast(null), 3000);
    }

    // Reset multi-select mode if active
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [fileManageMode, videos, addLog, setVideos, setToast, setSelectedIds, setSelectionMode]);

  const handleBatchRemove = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (confirmDeletion) {
      const yes = await showConfirm(`Remove ${selectedIds.size} items from your grid?\n\nThis removes the view shortcuts, but the physical files on your hard drive will NOT be affected.\n\nProceed?`, { title: 'Remove Selection', kind: 'warning' });
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
      pendingScrollIdRef.current = id;
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
      // If slideshow is active and the next item is a video, auto-play it
      const nextPath = nextVideo.realPath || nextVideo.url || '';
      if (!isValidPictureExtension(nextPath)) {
        setVideos(prev => prev.map(v =>
          v.id === nextVideo.id ? { ...v, playing: true, currentTime: 0 } :
          v.id === focusedId ? { ...v, playing: false } : v
        ));
      }
      addLog(`Folder Navigate [${filtered[currentIdx].title}] → ${nextVideo.title}`);
    }
  }, [filtered, focusedId, setFocusedId, setVideos, addLog]);

  // Reset slideshow if exiting Solo mode
  useEffect(() => {
    if (!focusedId) {
      setIsSlideshowActive(false);
    }
  }, [focusedId]);

  // Slideshow Auto-Focus Trigger: Focuses the first item to enter fullscreen if slideshow is started while in normal grid mode
  useEffect(() => {
    if (isSlideshowActive && !focusedId && filtered.length > 0) {
      const firstItem = filtered[0];
      setFocusedId(firstItem.id);
      // Auto-play if the first item is a video (check file extension, not mediaMode)
      const firstPath = firstItem.realPath || firstItem.url || '';
      if (!isValidPictureExtension(firstPath)) {
        setVideos(prev => prev.map(v => v.id === firstItem.id ? { ...v, playing: true, currentTime: 0 } : v));
      }
      addLog(`Slideshow: Starting fullscreen slideshow with [${firstItem.title}]`);
    }
  }, [isSlideshowActive, focusedId, filtered, setFocusedId, setVideos, addLog]);

  // Slideshow Timer Effect
  useEffect(() => {
    if (!isSlideshowActive || !focusedId) return;

    // For videos, sequential playback is handled on-end in handleVideoEnded instead of a timer.
    // If the focused unit is not an image, let the video player handle the end trigger.
    if (!isFocusedImage) return;

    const timer = setInterval(() => {
      handleNavigateSibling(1);
    }, slideshowInterval * 1000);

    return () => clearInterval(timer);
  }, [isSlideshowActive, focusedId, slideshowInterval, handleNavigateSibling, isFocusedImage]);

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

  const handleUpdate = useCallback((idOrIds: string | string[], updates: any) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setVideos(prev => prev.map(v => {
      if (ids.includes(v.id)) {
        const up = typeof updates === 'function' ? updates(v) : updates;
        return { ...v, ...up };
      }
      return v;
    }));
  }, [setVideos]);

  const onAddVideo = useCallback((newVideo: VideoItem) => {
    setVideos(prev => {
      if (prev.some(v => v.realPath && newVideo.realPath && v.realPath.toLowerCase() === newVideo.realPath.toLowerCase())) {
        return prev;
      }
      return [...prev, newVideo];
    });
  }, [setVideos]);

  const toggleSelect = useCallback((id: string, shiftKey?: boolean, ctrlKey?: boolean) => {
    setSelectedIds(prev => {
      let next = new Set(prev);

      // 1. Shift + Click (Range Selection)
      if (shiftKey && lastSelectedIdRef.current && filtered.some(v => v.id === lastSelectedIdRef.current)) {
        const anchorIdx = filtered.findIndex(v => v.id === lastSelectedIdRef.current);
        const currentIdx = filtered.findIndex(v => v.id === id);
        if (anchorIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(anchorIdx, currentIdx);
          const end = Math.max(anchorIdx, currentIdx);
          const rangeIds = filtered.slice(start, end + 1).map(v => v.id);

          if (ctrlKey) {
            // Add range to selection (retaining other selections)
            rangeIds.forEach(rid => next.add(rid));
          } else {
            // Replace selection with range
            next = new Set(rangeIds);
          }
          setSelectionMode(next.size > 0);
          return next;
        }
      }

      // 2. Control/Command-Click or standard toggle/click
      // Update anchor for non-shift click
      lastSelectedIdRef.current = id;

      if (ctrlKey) {
        // Toggle individual item
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      } else {
        // Standard click (without Ctrl or Shift)
        if (selectionMode) {
          // If already in selectionMode, select ONLY this item
          next = new Set([id]);
        } else {
          // Enter selectionMode and select ONLY this item
          next = new Set([id]);
        }
      }

      setSelectionMode(next.size > 0);
      return next;
    });
  }, [filtered, selectionMode, setSelectedIds, setSelectionMode]);

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

      const originalPath = toRealPath(focusedVideo.realPath || focusedVideo.url);
      if (!originalPath) {
        alert('Could not resolve a disk path for this image. Try re-adding the file.');
        return;
      }

      // Close the cropping overlay instantly so the UI feels snappy
      setIsCropping(false);
      setShowSaveCropOptions(false);

      const targetId = focusedVideo.id;
      const focusedVideoCopy = { ...focusedVideo };

      // Run the crop (and optional AI upscale) in the background
      (async () => {
        try {
          if (useAi) {
            // For AI crops we still need the canvas path since enhance_image_crop takes base64.
            // We'll do it after the FFmpeg crop by reading the result.
            setEnhancingVideoId(targetId);
            setAiServerOffline(false);
            setUpscaleStatus('enhancing');
            setLastEnhancedTitle('Image Crop');
          }

          // Use FFmpeg server-side crop — preserves original format & compression
          const savedPath = await invoke<string>('crop_image_on_disk', {
            path: originalPath,
            cropX: cropBox.x,
            cropY: cropBox.y,
            cropW: cropBox.w,
            cropH: cropBox.h,
            overwrite,
          });

          if (useAi) {
            // Read the cropped file, encode to base64, send to enhancer
            try {
              const response = await fetch(toCosmoUrl(savedPath));
              const blob = await response.blob();
              const rawBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const result = (reader.result as string).split(',')[1];
                  resolve(result);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });

              const enhancedBase64 = await invoke<string>('enhance_image_crop', { base64Data: rawBase64 });
              if (!enhancementCancelled.current) {
                const enhancedBytes = Uint8Array.from(atob(enhancedBase64), c => c.charCodeAt(0));
                const sep = savedPath.includes('\\') ? '\\' : '/';
                const parts = savedPath.split(sep);
                const fileName = parts.pop()!;
                const parentDir = parts.join(sep);
                await invoke<string>('save_snapshot', {
                  base64Data: `data:image/png;base64,${enhancedBase64}`,
                  fileName,
                  customDir: parentDir
                });
                addLog('AI Enhancement successful (4x Resolution)!');
                setUpscaleStatus('success');
              }
            } catch (err) {
              if (!enhancementCancelled.current) {
                console.error('AI Server error:', err);
                setAiServerOffline(true);
                setUpscaleStatus('failed');
              }
            }
            setEnhancingVideoId(null);
            setTimeout(() => { setUpscaleStatus(s => s === 'enhancing' ? 'idle' : s); }, 4000);
          }

          if (overwrite) {
            // Reload the image with cache-busting
            setVideos(prev => prev.map(v =>
              v.id === targetId
                ? { ...v, realPath: savedPath, url: `${toCosmoUrl(savedPath)}?t=${Date.now()}` }
                : v
            ));
            addLog(`Original overwritten with crop: ${savedPath}`);
            setToast('Original media overwritten with crop!');
            setToastPath(savedPath);
          } else {
            const sep = savedPath.includes('\\') ? '\\' : '/';
            const fileNameWithExt = savedPath.substring(savedPath.lastIndexOf(sep) + 1);
            const extIdx = fileNameWithExt.lastIndexOf('.');
            const cleanTitle = extIdx !== -1 ? fileNameWithExt.substring(0, extIdx) : fileNameWithExt;

            const newUnit: VideoItem = {
              id: `crop-${Date.now()}`,
              title: cleanTitle,
              url: toCosmoUrl(savedPath),
              realPath: savedPath,
              currentTime: 0,
              repeatMode: 'none',
              repeatCount: 0,
              cols: 1,
              playing: false,
              muted: false
            };

            setVideos(prev => {
              const currentIdx = prev.findIndex(item => item.id === targetId);
              const updated = [...prev];
              if (currentIdx !== -1) {
                updated.splice(currentIdx + 1, 0, newUnit);
              } else {
                updated.push(newUnit);
              }
              return updated;
            });
            setFocusedId(newUnit.id);

            // Auto-switch to picture mode so it is immediately visible on the grid
            if (mediaMode !== 'picture') {
              setMediaMode('picture');
            }

            addLog(`Crop saved as: ${fileNameWithExt}`);
            setToast(`Crop saved as copy: ${fileNameWithExt}`);
            setToastPath(savedPath);
          }

          setTimeout(() => { setToast(null); setToastPath(null); }, 4000);
        } catch (err) {
          console.error('Crop save failed:', err);
          addLog(`Crop failed: ${err}`);
          setToast(`Crop failed: ${err}`);
          setTimeout(() => { setToast(null); setToastPath(null); }, 5000);
        } finally {
          setEnhancingVideoId(null);
        }
      })();

    } catch (err) {
      console.error('Crop save failed:', err);
      addLog(`Crop failed: ${err}`);
      alert(`Crop failed: ${err}`);
    }
  };


  const handleUpscale = useCallback((v: any) => {
    const effectiveRealPath = (v.folderFiles && v.currentIdx !== undefined)
      ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
      : v.realPath;
    const effectiveTitle = (v.folderFiles && v.currentIdx !== undefined)
      ? (v.folderFiles[v.currentIdx]?.name || v.title)
      : v.title;

    if (!effectiveRealPath) {
      addLog("Upscale Error: Native path missing.");
      return;
    }
    setUpscaleTarget({
      ...v,
      parentUnitId: v.id,
      realPath: effectiveRealPath,
      title: effectiveTitle,
      folderIdx: (v.folderFiles && v.currentIdx !== undefined) ? v.currentIdx : undefined
    });
    setShowSaveUpscaleOptions(true);
  }, [addLog]);

  const executeUpscale = async (overwrite: boolean) => {
    if (!upscaleTarget) return;
    const v = upscaleTarget;
    setShowSaveUpscaleOptions(false);
    setEnhancingVideoId(v.parentUnitId || v.id);
    setUpscaleStatus('enhancing');
    setLastEnhancedTitle(v.title);
    enhancementCancelled.current = false;
    addLog(`Upscaling: ${v.title} (${overwrite ? 'Overwrite' : 'Save As'}) — running local super-resolution...`);
    try {
      const result = await invoke<string>('upscale_image', { path: v.realPath, overwrite });
      if (enhancementCancelled.current) return;
      
      // Check if the backend signals that AI models weren't loaded (fallback resize only)
      const isFallback = result.startsWith('[FALLBACK]');
      const cleanResult = isFallback ? result.substring('[FALLBACK]'.length) : result;
      
      if (isFallback) {
        addLog(`⚠️ Upscale completed with BASIC RESIZE (AI models not found). For true AI super-resolution, place RealESRGAN_x4plus.pth and GFPGANv1.4.pth in .cosmo_models folder.`);
      } else {
        addLog(`Upscale success (AI enhanced): ${cleanResult}`);
      }
      setUpscaleStatus(isFallback ? 'failed' : 'success');
      
      if (overwrite) {
        // Overwrite original asset physically: bust cache
        const cacheBustUrl = `local://${v.realPath}?t=${Date.now()}`;
        
        // Temporarily clear and restore focusedId to trigger a component refresh
        const originalId = focusedId;
        setFocusedId(null);
        await new Promise(resolve => setTimeout(resolve, 120));
        
        setVideos(prev => prev.map(vid => {
          if (vid.id === v.parentUnitId) {
            let updatedFiles = vid.folderFiles;
            if (updatedFiles && v.folderIdx !== undefined) {
              updatedFiles = vid.folderFiles.map((f, idx) => 
                idx === v.folderIdx 
                  ? { ...f, url: cacheBustUrl } 
                  : f
              );
            }
            return {
              ...vid,
              url: cacheBustUrl,
              folderFiles: updatedFiles
            };
          }
          return vid;
        }));
        setFocusedId(originalId);

        // Toast confirmation
        setToast(`Original media overwritten with upscaled version!`);
        setToastPath(v.realPath);
        setTimeout(() => {
          setToast(null);
          setToastPath(null);
        }, 4000);
      } else {
        // Save As: Add the new serial upscaled asset as a new card
        const extIdx = cleanResult.lastIndexOf('.');
        const fileNameWithExt = cleanResult.substring(cleanResult.lastIndexOf(cleanResult.includes('\\') ? '\\' : '/') + 1);
        const cleanTitle = extIdx !== -1 ? fileNameWithExt.substring(0, fileNameWithExt.lastIndexOf('.')) : fileNameWithExt;

        const newUnit: VideoItem = {
          id: `upscale-${Date.now()}`,
          title: cleanTitle,
          url: `local://${cleanResult}`,
          realPath: cleanResult,
          currentTime: v.currentTime || 0,
          repeatMode: v.repeatMode || 'none',
          repeatCount: v.repeatCount || 0,
          cols: v.cols || 1,
          playing: false,
          muted: v.muted || false
        };
        setVideos(prev => {
          const targetId = v.parentUnitId || v.id;
          const currentIdx = prev.findIndex(item => item.id === targetId);
          let updated;
          if (currentIdx !== -1) {
            updated = [...prev];
            updated.splice(currentIdx + 1, 0, newUnit);
          } else {
            updated = [...prev, newUnit];
          }
          return updated;
        });
        setFocusedId(newUnit.id);

        // Auto-switch to picture mode so it is immediately visible on the grid
        if (mediaMode !== 'picture') {
          setMediaMode('picture');
        }

        // Toast confirmation
        setToast(`Upscaled copy saved: ${cleanTitle}`);
        setToastPath(cleanResult);
        setTimeout(() => {
          setToast(null);
          setToastPath(null);
        }, 4000);
      }
    } catch (err) {
      if (enhancementCancelled.current) return;
      console.error("Upscale failed:", err);
      addLog(`Upscale failed: ${err}`);
      setUpscaleStatus('failed');
    } finally {
      if (!enhancementCancelled.current) {
        setEnhancingVideoId(null);
        setUpscaleTarget(null);
        // Automatically clear success/failed state after 4 seconds
        setTimeout(() => {
          setUpscaleStatus(current => current === 'enhancing' ? 'enhancing' : 'idle');
        }, 4000);
      }
    }
  };

  const cancelEnhancement = useCallback(() => {
    enhancementCancelled.current = true;
    setUpscaleStatus('idle');
    setEnhancingVideoId(null);
    setUpscaleTarget(null);
    addLog('Enhancement cancelled by user.');
  }, [addLog]);

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
      const activeItem = videos.find(v => v.id === active.id);
      const overItem = videos.find(v => v.id === over.id);

      if (activeItem && overItem) {
        const isFolder = overItem.folderFiles && overItem.folderFiles.length > 0;
        const isSingle = !activeItem.folderFiles;

        if (isFolder && isSingle && activeItem.realPath && overItem.realPath) {
          const isBatch = selectedIds.size > 1 && selectedIds.has(activeItem.id);
          const targetItems = isBatch 
            ? videos.filter(item => selectedIds.has(item.id) && !item.folderFiles && item.realPath)
            : [activeItem];

          (async () => {
            const yes = await showConfirm(
              isBatch 
                ? `MOVE BATCH PROTOCOL\n\nWould you like to move ${targetItems.length} selected files into the folder "${overItem.title}"?\n\n(Click Cancel to just reorder the grid instead)`
                : `MOVE PROTOCOL\n\nWould you like to move "${activeItem.title}" into the folder "${overItem.title}"?\n\n(Click Cancel to just reorder the grid instead)`
            );
            if (yes) {
              try {
                const destDir = overItem.realPath || '';
                const movedItems: { originalId: string; newPath: string }[] = [];

                for (const item of targetItems) {
                  const srcPath = item.realPath || '';
                  const separator = srcPath.includes('\\') ? '\\' : '/';
                  const newFileName = srcPath.substring(srcPath.lastIndexOf(separator) + 1);
                  const newPath = `${destDir}${separator}${newFileName}`;

                  // Move file on disk
                  await invoke('move_file_on_disk', { srcPath, destDir });
                  movedItems.push({ originalId: item.id, newPath });
                }

                // Sync workspace grid
                setVideos(prev => {
                  let current = [...prev];
                  const movedIds = new Set(movedItems.map(m => m.originalId));
                  // Remove moved items
                  current = current.filter(v => !movedIds.has(v.id));
                  
                  // Add them to the target folder unit's folderFiles
                  current = current.map(v => v.id === overItem.id ? {
                    ...v,
                    folderFiles: [
                      ...(v.folderFiles || []),
                      ...movedItems.map(m => {
                        const separator = m.newPath.includes('\\') ? '\\' : '/';
                        const name = m.newPath.substring(m.newPath.lastIndexOf(separator) + 1);
                        return { name, url: toCosmoUrl(m.newPath), path: m.newPath };
                      })
                    ]
                  } : v);
                  return current;
                });

                addLog(`SUCCESS: Moved ${movedItems.length} assets into "${overItem.title}" via drag-and-drop.`);
                setToast(`Moved ${movedItems.length} asset(s) successfully.`);
                setTimeout(() => setToast(null), 3000);
                
                // Clear selection
                setSelectedIds(new Set());
                setSelectionMode(false);
              } catch (err) {
                console.error(err);
                addLog(`ERROR: Drag-and-drop move failed - ${err}`);
                alert(`Move failed: ${err}`);
              }
            } else {
              // Fall back to standard reordering
              performStandardReorder(active.id as string, over.id as string);
            }
          })();
          return;
        }
      }

      performStandardReorder(active.id as string, over.id as string);
    }
  };

  const performStandardReorder = (activeId: string, overId: string) => {
    setVideos((items) => {
      const oldIndex = items.findIndex((v) => v.id === activeId);
      const newIndex = items.findIndex((v) => v.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const next = arrayMove(items, oldIndex, newIndex);
        addLog(`Reordered Units: [${items[oldIndex].title}] moved to position ${newIndex + 1}`);
        return next;
      }
      return items;
    });
  };

  const handleVideoEnded = useCallback((id: string) => {
    // If this video is currently focused (solo/fullscreen mode), play the next video card in the grid!
    if (focusedId && id === focusedId) {
      const currentIdx = filtered.findIndex(v => v.id === id);
      if (currentIdx !== -1 && filtered.length > 1) {
        const nextIdx = (currentIdx + 1) % filtered.length;
        const nextVideo = filtered[nextIdx];
        if (nextVideo) {
          setNavDirection(1);
          setFocusedId(nextVideo.id);
          setVideos(prev => prev.map(v => {
            if (v.id === nextVideo.id) {
              return { ...v, playing: true, currentTime: 0 };
            }
            if (v.id === id) {
              return { ...v, playing: false };
            }
            return v;
          }));
          addLog(`Sequence: [${filtered[currentIdx].title}] ended. Playing next sibling [${nextVideo.title}]`);
          return;
        }
      }
    }

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
  }, [globalRepeat, addLog, setVideos, focusedId, filtered, setFocusedId]);

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
     if (holdActiveRef.current) return;
     immersiveTimerRef.current = setTimeout(() => setShowImmersiveUI(false), IMMERSIVE_HIDE_DELAY);
   }, []);

  const triggerFrameStep = useCallback((action: 'stepback' | 'stepforward', videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    if (video && isValidPictureExtension(video.realPath || video.url)) {
      handleNavigateSibling(action === 'stepback' ? -1 : 1);
    } else {
      setGlobalControl(`${action}-${videoId}-${Date.now()}`);
    }
  }, [videos, handleNavigateSibling, setGlobalControl]);

  const startFrameStep = useCallback((action: 'stepback' | 'stepforward', videoId: string) => {
    holdActiveRef.current = true;
    resetImmersiveTimer();

    const video = videos.find(v => v.id === videoId);
    const isImg = video ? isValidPictureExtension(video.realPath || video.url) : false;

    // Perform immediate first step
    triggerFrameStep(action, videoId);

    // Clear any existing timer/interval
    if (frameStepTimeoutRef.current) clearTimeout(frameStepTimeoutRef.current);
    if (frameStepIntervalRef.current) clearInterval(frameStepIntervalRef.current);

    // After 400ms hold delay, start fast stepping
    frameStepTimeoutRef.current = setTimeout(() => {
      frameStepIntervalRef.current = setInterval(() => {
        triggerFrameStep(action, videoId);
      }, isImg ? 180 : 80); // Step slower for images to allow Tauri loading, fast for video frames
    }, 400);
  }, [resetImmersiveTimer, triggerFrameStep, videos]);

  const stopFrameStep = useCallback(() => {
    holdActiveRef.current = false;
    if (frameStepTimeoutRef.current) {
      clearTimeout(frameStepTimeoutRef.current);
      frameStepTimeoutRef.current = null;
    }
    if (frameStepIntervalRef.current) {
      clearInterval(frameStepIntervalRef.current);
      frameStepIntervalRef.current = null;
    }
    resetImmersiveTimer();
  }, [resetImmersiveTimer]);

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

    if (pendingScrollIdRef.current) {
      const targetId = pendingScrollIdRef.current;
      pendingScrollIdRef.current = null;
      
      const row = idToRow[targetId];
      if (typeof row === 'number') {
        const offset = rowOffsets[row];
        const scrollArea = document.querySelector('.video-scroll');
        if (scrollArea && typeof offset === 'number') {
          scrollArea.scrollTo({ top: offset, behavior: 'smooth' });
          setRotIdx(row);
          addLog(`Navigated to Line: ${row + 1}`);
        }
      }
    }
  }, [idToRow, rowOffsets, setWorkspaceIdToRow, setWorkspaceRowOffsets, addLog, setRotIdx]);

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
    isSlideshowActive,
    setIsSlideshowActive,
    onUpdateVideo,
    onToggleFocus,
    toggleMasterPlay,
    toggleMasterMute,
    setGlobalRepeat: (updater: RepeatMode | ((prev: RepeatMode) => RepeatMode)) => {
      if (typeof updater === 'function') {
        setGlobalRepeat(updater(globalRepeat));
      } else {
        setGlobalRepeat(updater);
      }
    },
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
    onDeepFocus: handleDeepFocus,
    triggerGlobalHud
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

  useEffect(() => {
    const el = soloOverlayRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastSoloWheelTime.current > 350) {
        lastSoloWheelTime.current = now;
        const direction = e.deltaY > 0 ? 1 : -1;
        const video = videos.find(v => v.id === focusedId);
        if (video) {
          if (video.folderFiles && video.folderFiles.length > 1) {
            const currentIdx = video.currentIdx || 0;
            const nextIdx = (currentIdx + direction + video.folderFiles.length) % video.folderFiles.length;
            const nextFile = video.folderFiles[nextIdx];
            if (nextFile) {
              handleUpdate(video.id, {
                currentIdx: nextIdx,
                url: nextFile.url,
                realPath: (nextFile as any).path || nextFile.url,
                title: nextFile.name
              });
              addLog(`Folder Sibling Navigate [${video.title}] → ${nextFile.name}`);
            }
          } else {
            handleNavigateSibling(direction);
          }
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [focusedId, videos, handleUpdate, addLog, handleNavigateSibling]);

  useEffect(() => {
    const el = soloVolumeContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const change = e.deltaY < 0 ? 0.05 : -0.05;
      setGlobalVolume(prev => Math.max(0, Math.min(1, prev + change)));
      
      const state = useStore.getState();
      if (state.masterMuted) {
        state.setMasterMuted(false);
      }
      
      const currentFocusedVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
      if (currentFocusedVideo && currentFocusedVideo.muted) {
        onUpdateVideo(currentFocusedVideo.id, { muted: false });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [focusedId, videos, onUpdateVideo, setGlobalVolume]);

  if (fatalError) return <ErrorFallback error={fatalError} />;

  if (isPopout) {
    return <PopoutPlayer url={popoutUrl || ''} />;
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
            <div style={{ marginTop: '16px', fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)', letterSpacing: '0.5px' }}>
              Check out my other products at <a href="https://cosmowhisper.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #00ff88)', textDecoration: 'none', fontWeight: 600 }}>cosmowhisper.com</a>
            </div>
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
      className={`app-root app-container ${immersive ? 'immersive-mode' : ''} ${!showImmersiveUI && immersive ? 'ghost-mode' : ''} ${isWindowMaximized ? 'window-maximized' : ''}`} 
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
            {toastPath && (
              <button 
                onClick={() => invoke('open_folder', { path: toastPath })}
                style={{
                  background: 'var(--accent, #00ff88)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '9px',
                  marginLeft: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: '0 2px 8px rgba(0,255,136,0.3)',
                  transition: 'transform 0.1s'
                }}
                onMouseDown={e => e.stopPropagation()}
                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <FolderOpen size={10} />
                <span>Open Folder</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {globalHud && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 30 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={{
              position: 'fixed',
              bottom: '90px',
              left: '50%',
              transform: 'translateX(-50%)',
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
              pointerEvents: 'none',
              letterSpacing: '0.5px'
            }}
          >
            <span style={{ fontSize: '9px', fontWeight: '900', color: 'var(--accent, #00ff88)', textTransform: 'uppercase' }}>{globalHud.label}</span>
            <div style={{ width: '1px', height: '12px', background: 'rgba(255, 255, 255, 0.15)' }} />
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#fff', textTransform: 'uppercase' }}>{globalHud.val}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {dragFile && <div className="drag-overlay"><img src="/logo.png" className="empty-logo-img" /><p>Drop to Add Media</p></div>}
      
      {focusedId && (
        <SoloPlayer
          focusedId={focusedId}
          setFocusedId={setFocusedId}
          videos={videos}
          setVideos={setVideos}
          onUpdateVideo={onUpdateVideo}
          globalRepeat={globalRepeat}
          speed={speed}
          fitMode={fitMode}
          handleDecommission={handleDecommission}
          handleAnnihilate={handleAnnihilate}
          addLog={addLog}
          handleSelectAll={handleSelectAll}
          snapshotDir={snapshotDir}
          setSnapshotDir={setSnapshotDir}
          globalControl={globalControl}
          masterPlaying={masterPlaying}
          masterMuted={masterMuted}
          globalVolume={globalVolume}
          setGlobalVolume={setGlobalVolume}
          masterShowUI={masterShowUI}
          handleVideoEnded={handleVideoEnded}
          toggleMasterMute={toggleMasterMute}
          toggleMasterPlay={toggleMasterPlay}
          handleContext={handleContext}
          handleDeepFocus={handleDeepFocus}
          handleNavigateSibling={handleNavigateSibling}
          handleUpscale={handleUpscale}
          enhancingVideoId={enhancingVideoId}
          isCropping={isCropping}
          setIsCropping={setIsCropping}
          cropBox={cropBox}
          setCropBox={setCropBox}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          onAddVideo={onAddVideo}
          soloOverlayRef={soloOverlayRef}
          soloVolumeContainerRef={soloVolumeContainerRef}
          isSlideshowActive={isSlideshowActive}
          setIsSlideshowActive={setIsSlideshowActive}
          setColorAdjustId={setColorAdjustId}
          setGlobalControl={setGlobalControl}
          showImmersiveUI={showImmersiveUI}
          isFocusedImage={isFocusedImage}
          focusedVideo={focusedVideo}
          navDirection={navDirection}
          startFrameStep={startFrameStep}
          stopFrameStep={stopFrameStep}
          setShowSaveCropOptions={setShowSaveCropOptions}
          setMasterMuted={setMasterMuted}
        />
      )}

      {/* Hidden Image Memory Pre-Cache Engine */}
      <div className="hidden-precache-engine" style={{ display: 'none', width: 0, height: 0, visibility: 'hidden' }} aria-hidden="true">
        {cachedAssetUrls.map(url => (
          <img key={url} src={url} alt="pre-cache" />
        ))}
      </div>

      <div className="app-layout-wrapper">
        {!immersive && (
          <aside className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-brand-container">
              <img src="/logo.png" className="sidebar-logo" alt="Logo" />
              <div className="sidebar-brand-text">
                <span className="sidebar-brand-main">COSMO</span>
                <span className="sidebar-brand-sub">SYMPHONY</span>
              </div>
            </div>

            <nav className="sidebar-nav-list">
              {/* MEDIA GRID TAB */}
              <div 
                className={`sidebar-nav-item ${(!showSymphonyWorkshop && !showCollections && !showLogs && !showSettings && !showHelp && !showCollageCanvas) ? 'active' : ''}`}
                onClick={() => {
                  setShowSymphonyWorkshop(false);
                  setShowCollections(false);
                  setShowLogs(false);
                  setShowSettings(false);
                  setShowHelp(false);
                  setShowCollageCanvas(false);
                }}
              >
                <div className="sidebar-nav-item-icon"><LayoutGrid size={16} /></div>
                <span className="sidebar-nav-item-label">Media Grid</span>
              </div>

              {/* COLLAGE CANVAS TAB */}
              <div 
                className={`sidebar-nav-item ${showCollageCanvas ? 'active' : ''}`}
                onClick={() => {
                  setShowCollageCanvas(true);
                  setShowSymphonyWorkshop(false);
                  setShowCollections(false);
                  setShowLogs(false);
                  setShowSettings(false);
                  setShowHelp(false);
                }}
              >
                <div className="sidebar-nav-item-icon"><Layers size={16} /></div>
                <span className="sidebar-nav-item-label">Collage Canvas</span>
              </div>

              {/* SYMPHONY WORKSHOP TAB */}
              <div 
                className={`sidebar-nav-item ${showSymphonyWorkshop ? 'active' : ''}`}
                onClick={() => {
                  setShowSymphonyWorkshop(true);
                  setShowCollageCanvas(false);
                  setShowCollections(false);
                  setShowLogs(false);
                  setShowSettings(false);
                  setShowHelp(false);
                }}
              >
                <div className="sidebar-nav-item-icon"><Sparkles size={16} /></div>
                <span className="sidebar-nav-item-label">Workshop</span>
              </div>

              {/* SETS/COLLECTIONS TAB */}
              <div 
                className={`sidebar-nav-item ${showCollections ? 'active' : ''}`}
                onClick={() => {
                  setShowCollections(true);
                  setShowCollageCanvas(false);
                  setShowSymphonyWorkshop(false);
                  setShowLogs(false);
                  setShowSettings(false);
                  setShowHelp(false);
                }}
              >
                <div className="sidebar-nav-item-icon"><Bookmark size={16} /></div>
                <span className="sidebar-nav-item-label">Sets & Collections</span>
              </div>

              {/* CONSOLE LOGS TAB */}
              <div 
                className={`sidebar-nav-item ${showLogs ? 'active' : ''}`}
                onClick={() => {
                  setShowLogs(true);
                  setShowSymphonyWorkshop(false);
                  setShowCollections(false);
                  setShowSettings(false);
                  setShowHelp(false);
                }}
              >
                <div className="sidebar-nav-item-icon"><Hash size={16} /></div>
                <span className="sidebar-nav-item-label">Console Logs</span>
              </div>

              {/* HELP TAB */}
              <div 
                className={`sidebar-nav-item ${showHelp ? 'active' : ''}`}
                onClick={() => {
                  setShowHelp(true);
                  setShowSymphonyWorkshop(false);
                  setShowCollections(false);
                  setShowLogs(false);
                  setShowSettings(false);
                }}
              >
                <div className="sidebar-nav-item-icon"><HelpCircle size={16} /></div>
                <span className="sidebar-nav-item-label">Orchestrator Guide</span>
              </div>

              {/* SETTINGS TAB */}
              <div 
                className={`sidebar-nav-item ${showSettings ? 'active' : ''}`}
                onClick={() => {
                  setShowSettings(true);
                  setShowSymphonyWorkshop(false);
                  setShowCollections(false);
                  setShowLogs(false);
                  setShowHelp(false);
                }}
              >
                <div className="sidebar-nav-item-icon"><Settings size={16} /></div>
                <span className="sidebar-nav-item-label">System Settings</span>
              </div>
            </nav>

            {/* QUICK INGESTION TRIGGER */}
            <div className="sidebar-ingest-container">
              <button className="sidebar-ingest-btn" onClick={handleSidebarAddFolder} title="Add Folder Asset">
                <Plus size={14} />
                <span>Add Folder</span>
              </button>
            </div>

            {/* SIDEBAR FOOTER / COLLAPSE TOGGLE */}
            <div className="sidebar-footer">
              <button className="sidebar-toggle-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
                {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </button>
            </div>
          </aside>
        )}

        {/* Right Viewport wrapper */}
        <div className="main-viewport-wrapper">
          {showCollageCanvas ? (
            <CollageWorkspace
              videos={filtered}
              collageItems={collageItems}
              setCollageItems={setCollageItems}
              collageConfig={collageConfig}
              setCollageConfig={setCollageConfig}
              onDeepFocus={handleDeepFocus}
              addLog={addLog}
              snapshotDir={snapshotDir}
              setSnapshotDir={setSnapshotDir}
            />
          ) : (
            <>
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
              rotating={rotating}
              setRotating={setRotating}
              isSlideshowActive={isSlideshowActive}
              setIsSlideshowActive={setIsSlideshowActive}
              slideshowInterval={slideshowInterval}
              setSlideshowInterval={setSlideshowInterval}
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
            onSelectAll={handleSelectAll}
            selectionMode={selectionMode}
            onNavigateSibling={handleNavigateSibling}
            onUpscale={handleUpscale}
            enhancingVideoId={enhancingVideoId}
            isSlideshowActive={isSlideshowActive}
            setIsSlideshowActive={setIsSlideshowActive}
            onColorAdjust={(id) => setColorAdjustId(id)}
            onStartCrop={(id) => {
              setFocusedId(id);
              setIsCropping(true);
              setCropBox({ x: 15, y: 15, w: 70, h: 70 });
              setAspectRatio('free');
            }}
            onAddVideo={onAddVideo}
          />

          {!immersive && (
            <footer className="app-footer">
              <TelemetrySystem videosCount={videos.length} isPopout={isPopout} />
            </footer>
          )}
            </>
          )}
        </div>
      </div>

      {menu && (
        <ContextMenu 
          x={menu.x} 
          y={menu.y} 
          onClose={() => { setMenu(null); setMenuMetadata(null); }}
          video={videos.find(x => x.id === menu.id)!}
          metadata={menuMetadata}
          selectedCount={selectedIds.size}
          isFocused={focusedId === menu.id}
          isSelected={selectedIds.has(menu.id)}
          onAction={async (action) => {
            const v = videos.find(x => x.id === menu.id);
            if (!v) return;

            // For folder-browsing units, always target the currently-displayed file
            const effectivePath = (v.folderFiles && v.currentIdx !== undefined)
              ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
              : v.realPath;
            
            switch(action) {
              case 'toggle-select': toggleSelect(v.id); break;
              case 'play': onUpdateVideo(v.id, { playing: !v.playing }); break;
              case 'mute': onUpdateVideo(v.id, { muted: !v.muted }); break;
              case 'stop': onUpdateVideo(v.id, { playing: false }); break;
              case 'loop': onUpdateVideo(v.id, { repeatMode: v.repeatMode === 'always' ? 'none' : 'always' }); break;
              case 'step-back': setGlobalControl(`stepback-${v.id}-${Date.now()}`); break;
              case 'step-forward': setGlobalControl(`stepforward-${v.id}-${Date.now()}`); break;
              case 'watermark': setGlobalControl(`watermark-${v.id}-${Date.now()}`); break;
              case 'crop':
                setFocusedId(v.id);
                setIsCropping(true);
                setCropBox({ x: 15, y: 15, w: 70, h: 70 });
                setAspectRatio('free');
                break;
              case 'prev-file': handleNavigateSibling(-1); break;
              case 'next-file': handleNavigateSibling(1); break;
              case 'rotate-ccw': {
                const isBatch = selectedIds.size > 0 && selectedIds.has(v.id);
                
                if (isBatch) {
                  const targetIds = Array.from(selectedIds);
                  addLog(`Rotating ${targetIds.length} assets Left (-90°)...`);
                  
                  const promises = targetIds.map(async (targetId) => {
                    const targetVideo = videos.find(x => x.id === targetId);
                    if (!targetVideo) return;
                    
                    const targetPath = (targetVideo.folderFiles && targetVideo.currentIdx !== undefined)
                      ? (targetVideo.folderFiles[targetVideo.currentIdx]?.path || targetVideo.folderFiles[targetVideo.currentIdx]?.url)
                      : targetVideo.realPath;
                      
                    if (targetPath) {
                      const isImage = isValidPictureExtension(targetPath || targetVideo.url);
                      try {
                        await invoke('rotate_media_on_disk', { 
                          path: targetPath, 
                          rotation: -90, 
                          isImage: isImage 
                        });
                        const cacheBuster = `t=${Date.now()}`;
                        const cleanUrl = targetVideo.url.split('?')[0];
                        const newUrl = `${cleanUrl}?${cacheBuster}`;
                        onUpdateVideo(targetVideo.id, { 
                          rotation: 0,
                          url: newUrl
                        });
                      } catch (err) {
                        console.error("Failed to rotate left on disk:", targetPath, err);
                        throw err;
                      }
                    } else {
                      onUpdateVideo(targetVideo.id, { rotation: (targetVideo.rotation || 0) - 90 });
                    }
                  });

                  Promise.all(promises)
                  .then(() => {
                    addLog(`Batch left rotation complete for ${targetIds.length} assets.`);
                  })
                  .catch((err) => {
                    addLog(`Batch left rotation failed: some assets could not be rotated.`);
                  });
                } else {
                  if (effectivePath) {
                    const isImage = isValidPictureExtension(effectivePath || v.url);
                    addLog(`Rotating Left (-90°) and auto-saving to disk for: ${v.title}...`);
                    invoke<string>('rotate_media_on_disk', { 
                      path: effectivePath, 
                      rotation: -90, 
                      isImage: isImage 
                    })
                    .then(() => {
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
                      addLog(`Failed to save rotation: ${err}`);
                    });
                  } else {
                    onUpdateVideo(v.id, { rotation: (v.rotation || 0) - 90 });
                  }
                }
                break;
              }
              case 'rotate-cw': {
                const isBatch = selectedIds.size > 0 && selectedIds.has(v.id);
                
                if (isBatch) {
                  const targetIds = Array.from(selectedIds);
                  addLog(`Rotating ${targetIds.length} assets Right (+90°)...`);
                  
                  const promises = targetIds.map(async (targetId) => {
                    const targetVideo = videos.find(x => x.id === targetId);
                    if (!targetVideo) return;
                    
                    const targetPath = (targetVideo.folderFiles && targetVideo.currentIdx !== undefined)
                      ? (targetVideo.folderFiles[targetVideo.currentIdx]?.path || targetVideo.folderFiles[targetVideo.currentIdx]?.url)
                      : targetVideo.realPath;
                      
                    if (targetPath) {
                      const isImage = isValidPictureExtension(targetPath || targetVideo.url);
                      try {
                        await invoke('rotate_media_on_disk', { 
                          path: targetPath, 
                          rotation: 90, 
                          isImage: isImage 
                        });
                        const cacheBuster = `t=${Date.now()}`;
                        const cleanUrl = targetVideo.url.split('?')[0];
                        const newUrl = `${cleanUrl}?${cacheBuster}`;
                        onUpdateVideo(targetVideo.id, { 
                          rotation: 0,
                          url: newUrl
                        });
                      } catch (err) {
                        console.error("Failed to rotate right on disk:", targetPath, err);
                        throw err;
                      }
                    } else {
                      onUpdateVideo(targetVideo.id, { rotation: (targetVideo.rotation || 0) + 90 });
                    }
                  });

                  Promise.all(promises)
                  .then(() => {
                    addLog(`Batch right rotation complete for ${targetIds.length} assets.`);
                  })
                  .catch((err) => {
                    addLog(`Batch right rotation failed: some assets could not be rotated.`);
                  });
                } else {
                  if (effectivePath) {
                    const isImage = isValidPictureExtension(effectivePath || v.url);
                    addLog(`Rotating Right (+90°) and auto-saving to disk for: ${v.title}...`);
                    invoke<string>('rotate_media_on_disk', { 
                      path: effectivePath, 
                      rotation: 90, 
                      isImage: isImage 
                    })
                    .then(() => {
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
                      addLog(`Failed to save rotation: ${err}`);
                    });
                  } else {
                    onUpdateVideo(v.id, { rotation: (v.rotation || 0) + 90 });
                  }
                }
                break;
              }
              case 'exit-focus': setFocusedId(null); break;
              case 'decommission': {
                const isBatch = selectedIds.size > 0 && selectedIds.has(v.id);
                if (isBatch) {
                  await handleBatchRemove();
                } else {
                  await handleDecommission(v.id);
                }
                break;
              }
              case 'annihilate': {
                const isBatch = selectedIds.size > 0 && selectedIds.has(v.id);
                
                if (isBatch) {
                  if (confirmDeletion) {
                    const yes = await showConfirm(`PROTOCOL: BATCH ANNIHILATION\n\nThis will physically MOVE ${selectedIds.size} FILES TO THE RECYCLE BIN.\nThis action is reversible via the OS Recycle Bin.\n\nPROCEED WITH DESTRUCTION?`, { title: 'Recycle Bin', kind: 'error' });
                    if (!yes) break;
                  }
                  
                  const targetIds = Array.from(selectedIds);
                  let successCount = 0;
                  let failCount = 0;

                  for (const targetId of targetIds) {
                    const targetVideo = videos.find(x => x.id === targetId);
                    if (!targetVideo) continue;

                    const targetPath = (targetVideo.folderFiles && targetVideo.currentIdx !== undefined)
                      ? (targetVideo.folderFiles[targetVideo.currentIdx]?.path || targetVideo.folderFiles[targetVideo.currentIdx]?.url)
                      : targetVideo.realPath;

                    if (!targetPath) {
                      failCount++;
                      continue;
                    }

                    try {
                      await invoke('recycle_unit', { path: targetPath });

                      if (targetVideo.folderFiles && targetVideo.folderFiles.length > 1) {
                        const newFiles = targetVideo.folderFiles.filter((_, i) => i !== (targetVideo.currentIdx || 0));
                        const newIdx = Math.min(targetVideo.currentIdx || 0, newFiles.length - 1);
                        onUpdateVideo(targetVideo.id, { 
                          folderFiles: newFiles, 
                          currentIdx: newIdx, 
                          url: newFiles[newIdx]?.url, 
                          realPath: newFiles[newIdx]?.path, 
                          title: newFiles[newIdx]?.name 
                        });
                      } else {
                        if (focusedId === targetVideo.id) {
                          const currentIdx = filtered.findIndex(x => x.id === targetVideo.id);
                          if (currentIdx !== -1 && filtered.length > 1) {
                            const nextIdx = (currentIdx + 1) % filtered.length;
                            const nextVideo = filtered[nextIdx];
                            if (nextVideo && nextVideo.id !== targetVideo.id) {
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
                        setVideos(p => p.filter(x => x.id !== targetVideo.id));
                      }
                      successCount++;
                    } catch(err) {
                      console.error("Annihilation failed for", targetPath, err);
                      failCount++;
                    }
                  }

                  if (successCount > 0) {
                    addLog(`Unit Annihilated (Recycle Bin): ${successCount} items`);
                  }
                  if (failCount > 0) {
                    addLog(`Annihilation Failed: ${failCount} items`);
                  }

                  setSelectedIds(new Set());
                  setSelectionMode(false);
                } else {
                  if (!effectivePath) { addLog('Annihilation Error: Native path missing'); break; }
                  if (confirmDeletion) {
                    const yes = await showConfirm(`PROTOCOL: ANNIHILATE ASSET\n\nTarget: ${v.title}\n\nThis will physically MOVE THE FILE TO THE RECYCLE BIN.\nThis action is reversible via the OS Recycle Bin.\n\nPROCEED?`, { title: 'Recycle Bin', kind: 'error' });
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
                      if (focusedId === v.id) {
                        const currentIdx = filtered.findIndex(x => x.id === v.id);
                        if (currentIdx !== -1 && filtered.length > 1) {
                          const nextIdx = (currentIdx + 1) % filtered.length;
                          const nextVideo = filtered[nextIdx];
                          if (nextVideo && nextVideo.id !== v.id) {
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
                      setVideos(p => p.filter(x => x.id !== v.id));
                    }
                    addLog('Unit Annihilated (Recycle Bin)');
                  } catch(e) {
                    addLog('Annihilation Failed: ' + e);
                  }
                }
                break;
              }

              case 'secure_delete': {
                const isBatch = selectedIds.size > 0 && selectedIds.has(v.id);
                
                if (isBatch) {
                  const yes = await showConfirm(
                    `⚠️ PROTOCOL: BATCH SECURE DESTRUCTION\n\nThis will OVERWRITE and PERMANENTLY DELETE ${selectedIds.size} FILES from disk.\n\nThis action is completely IRREVERSIBLE. Files cannot be recovered.\n\nPROCEED WITH SECURE DESTRUCTION?`,
                    { title: 'Secure Delete', kind: 'error' }
                  );
                  if (!yes) break;
                  
                  const targetIds = Array.from(selectedIds);
                  let successCount = 0;
                  let failCount = 0;

                  for (const targetId of targetIds) {
                    const targetVideo = videos.find(x => x.id === targetId);
                    if (!targetVideo) continue;

                    const targetPath = (targetVideo.folderFiles && targetVideo.currentIdx !== undefined)
                      ? (targetVideo.folderFiles[targetVideo.currentIdx]?.path || targetVideo.folderFiles[targetVideo.currentIdx]?.url)
                      : targetVideo.realPath;

                    if (!targetPath) {
                      failCount++;
                      continue;
                    }

                    try {
                      await invoke('secure_delete_file', { path: targetPath });

                      if (targetVideo.folderFiles && targetVideo.folderFiles.length > 1) {
                        const newFiles = targetVideo.folderFiles.filter((_, i) => i !== (targetVideo.currentIdx || 0));
                        const newIdx = Math.min(targetVideo.currentIdx || 0, newFiles.length - 1);
                        onUpdateVideo(targetVideo.id, { 
                          folderFiles: newFiles, 
                          currentIdx: newIdx, 
                          url: newFiles[newIdx]?.url, 
                          realPath: newFiles[newIdx]?.path, 
                          title: newFiles[newIdx]?.name 
                        });
                      } else {
                        if (focusedId === targetVideo.id) {
                          const currentIdx = filtered.findIndex(x => x.id === targetVideo.id);
                          if (currentIdx !== -1 && filtered.length > 1) {
                            const nextIdx = (currentIdx + 1) % filtered.length;
                            const nextVideo = filtered[nextIdx];
                            if (nextVideo && nextVideo.id !== targetVideo.id) {
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
                        setVideos(p => p.filter(x => x.id !== targetVideo.id));
                      }
                      successCount++;
                    } catch(err) {
                      console.error("Secure destruction failed for", targetPath, err);
                      failCount++;
                    }
                  }

                  if (successCount > 0) {
                    addLog(`Unit Securely Destroyed: ${successCount} items`);
                  }
                  if (failCount > 0) {
                    addLog(`Secure Destruction Failed: ${failCount} items`);
                  }

                  setSelectedIds(new Set());
                  setSelectionMode(false);
                } else {
                  if (!effectivePath) { addLog('Secure Delete Error: Native path missing'); break; }
                  const yes = await showConfirm(
                    `⚠️ PROTOCOL: SECURE ASSET DESTRUCTION\n\nTarget: ${v.title}\n\nThis will OVERWRITE and PERMANENTLY DELETE the file from disk.\n\nThis action is completely IRREVERSIBLE. File cannot be recovered.\n\nPROCEED?`,
                    { title: 'Secure Delete', kind: 'error' }
                  );
                  if (!yes) break;
                  
                  try {
                    await invoke('secure_delete_file', { path: effectivePath });
                    if (v.folderFiles && v.folderFiles.length > 1) {
                      const newFiles = v.folderFiles.filter((_, i) => i !== (v.currentIdx || 0));
                      const newIdx = Math.min(v.currentIdx || 0, newFiles.length - 1);
                      onUpdateVideo(v.id, { folderFiles: newFiles, currentIdx: newIdx, url: newFiles[newIdx]?.url, realPath: newFiles[newIdx]?.path, title: newFiles[newIdx]?.name });
                    } else {
                      if (focusedId === v.id) {
                        const currentIdx = filtered.findIndex(x => x.id === v.id);
                        if (currentIdx !== -1 && filtered.length > 1) {
                          const nextIdx = (currentIdx + 1) % filtered.length;
                          const nextVideo = filtered[nextIdx];
                          if (nextVideo && nextVideo.id !== v.id) {
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
                      setVideos(p => p.filter(x => x.id !== v.id));
                    }
                    addLog('Unit Securely Destroyed (Permanently overwritten & deleted)');
                  } catch(e) {
                    addLog('Secure Destruction Failed: ' + e);
                  }
                }
                break;
              }

              case 'focus': onToggleFocus(v.id); break;
              case 'snapshot': setGlobalControl(`snapshot-${v.id}-${Date.now()}`); break;
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
              case 'popout': {
                localStorage.setItem('cosmo-popout-active-url', v.url);
                localStorage.setItem('cosmo-popout-active-title', v.title);
                invoke('pop_out', { id: v.id, url: v.url, title: v.title });
                break;
              }
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
              case 'color-adjust': setColorAdjustId(v.id); break;
              case 'move_file': {
                setFileManageMode('move');
                // Target the currently displayed file inside a folder cycle, if applicable
                const effectiveRealPath = (v.folderFiles && v.currentIdx !== undefined)
                  ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
                  : v.realPath;
                const effectiveTitle = (v.folderFiles && v.currentIdx !== undefined)
                  ? (v.folderFiles[v.currentIdx]?.name || v.title)
                  : v.title;
                setFileManageItems([{ ...v, realPath: effectiveRealPath, title: effectiveTitle }]);
                setFileManageOpen(true);
                break;
              }
              case 'copy_file': {
                setFileManageMode('copy');
                const effectiveRealPath = (v.folderFiles && v.currentIdx !== undefined)
                  ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
                  : v.realPath;
                const effectiveTitle = (v.folderFiles && v.currentIdx !== undefined)
                  ? (v.folderFiles[v.currentIdx]?.name || v.title)
                  : v.title;
                setFileManageItems([{ ...v, realPath: effectiveRealPath, title: effectiveTitle }]);
                setFileManageOpen(true);
                break;
              }
              case 'duplicate_file': {
                if (effectivePath) {
                  addLog(`Duplicating unit: ${v.title}...`);
                  try {
                    const resultPath = await invoke<string>('duplicate_file_on_disk', { srcPath: effectivePath });
                    addLog(`Successfully duplicated: ${resultPath}`);
                    
                    const separator = resultPath.includes('\\') ? '\\' : '/';
                    const fileNameWithExt = resultPath.substring(resultPath.lastIndexOf(separator) + 1);
                    const extIdx = fileNameWithExt.lastIndexOf('.');
                    const cleanTitle = extIdx !== -1 ? fileNameWithExt.substring(0, extIdx) : fileNameWithExt;

                    const newUnit: VideoItem = {
                      id: `dup-${Date.now()}`,
                      title: cleanTitle,
                      url: toCosmoUrl(resultPath),
                      realPath: resultPath,
                      currentTime: 0,
                      playing: false,
                      muted: v.muted,
                      repeatMode: 'none',
                      repeatCount: 0,
                      cols: v.cols || 1
                    };
                    setVideos(prev => [...prev, newUnit]);
                  } catch (err: any) {
                    console.error("Duplicate failed:", err);
                    addLog(`Error duplicating: ${err}`);
                  }
                } else {
                  addLog("Error: Native path missing for duplication");
                }
                break;
              }
              case 'mirror-horizontal': {
                const isImage = isValidPictureExtension(effectivePath || v.url);
                if (effectivePath) {
                  addLog(`Mirroring ${isImage ? 'image' : 'video'} horizontally on disk: ${v.title}...`);
                  try {
                    await invoke('mirror_media_on_disk', { path: effectivePath, isImage });
                    const cacheBuster = `t=${Date.now()}`;
                    const cleanUrl = v.url.split('?')[0];
                    const newUrl = `${cleanUrl}?${cacheBuster}`;
                    onUpdateVideo(v.id, { 
                      flipped: false,
                      url: newUrl
                    });
                    addLog(`Mirroring permanently saved to disk for: ${v.title}`);
                  } catch (err: any) {
                    console.error("Mirror save failed:", err);
                    addLog(`Mirror save failed: ${err}`);
                    onUpdateVideo(v.id, { flipped: !v.flipped });
                  }
                } else {
                  onUpdateVideo(v.id, { flipped: !v.flipped });
                }
                break;
              }
              case 'move_selected': {
                const selectedItems = videos.filter(item => selectedIds.has(item.id)).map(item => {
                  const effectiveRealPath = (item.folderFiles && item.currentIdx !== undefined)
                    ? (item.folderFiles[item.currentIdx]?.path || item.folderFiles[item.currentIdx]?.url)
                    : item.realPath;
                  const effectiveTitle = (item.folderFiles && item.currentIdx !== undefined)
                    ? (item.folderFiles[item.currentIdx]?.name || item.title)
                    : item.title;
                  return { ...item, realPath: effectiveRealPath, title: effectiveTitle };
                });
                setFileManageMode('move');
                setFileManageItems(selectedItems);
                setFileManageOpen(true);
                break;
              }
              case 'copy_selected': {
                const selectedItems = videos.filter(item => selectedIds.has(item.id)).map(item => {
                  const effectiveRealPath = (item.folderFiles && item.currentIdx !== undefined)
                    ? (item.folderFiles[item.currentIdx]?.path || item.folderFiles[item.currentIdx]?.url)
                    : item.realPath;
                  const effectiveTitle = (item.folderFiles && item.currentIdx !== undefined)
                    ? (item.folderFiles[item.currentIdx]?.name || item.title)
                    : item.title;
                  return { ...item, realPath: effectiveRealPath, title: effectiveTitle };
                });
                setFileManageMode('copy');
                setFileManageItems(selectedItems);
                setFileManageOpen(true);
                break;
              }
            }
            setMenu(null);
            setMenuMetadata(null);
          }}
        />
      )}

      <AnimatePresence>
        {colorAdjustId && (() => {
          const v = videos.find(x => x.id === colorAdjustId);
          return v ? (
            <ColorAdjustmentPanel
              key={colorAdjustId}
              video={v}
              onClose={() => setColorAdjustId(null)}
              onUpdateVideo={handleUpdate}
              setVideos={setVideos}
              addLog={addLog}
            />
          ) : null;
        })()}
      </AnimatePresence>

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
            isVisible={false}
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

      <Suspense fallback={null}>
        {showSymphonyWorkshop && <SymphonyWorkshop onClose={() => setShowSymphonyWorkshop(false)} addLog={addLog} />}
        {showHelp && <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />}
      </Suspense>

      {fileManageOpen && (
        <FileManagementModal
          isOpen={fileManageOpen}
          onClose={() => setFileManageOpen(false)}
          items={fileManageItems}
          mode={fileManageMode}
          activeGridFolders={activeGridFolders}
          onSuccess={handleFileManagementSuccess}
          addLog={addLog}
        />
      )}

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
                            const filtered = prev.filter(vid => vid.id === singleRenameTarget.id || !pathsEqual(vid.realPath, newPath));
                            
                            return filtered.map(vid => {
                              let updated = false;
                              const newVid = { ...vid };
                              
                              if (vid.id === singleRenameTarget.id) {
                                newVid.realPath = newPath;
                                newVid.url = toCosmoUrl(newPath);
                                newVid.title = `${newName}${extension}`;
                                updated = true;
                              } else if (pathsEqual(vid.realPath, singleRenameTarget.realPath)) {
                                newVid.realPath = newPath;
                                newVid.url = toCosmoUrl(newPath);
                                newVid.title = `${newName}${extension}`;
                                updated = true;
                              }
                              
                              if (vid.folderFiles) {
                                // Filter out the overwritten entry and update the renamed entry inside folderFiles
                                const hasOverwritten = vid.folderFiles.some(f => pathsEqual(f.path, newPath));
                                const hasRenamed = vid.folderFiles.some(f => pathsEqual(f.path, singleRenameTarget.realPath));
                                
                                if (hasOverwritten || hasRenamed) {
                                  let newFiles = vid.folderFiles;
                                  if (hasOverwritten) {
                                    newFiles = newFiles.filter(f => !pathsEqual(f.path, newPath));
                                  }
                                  newVid.folderFiles = newFiles.map(f => {
                                    if (pathsEqual(f.path, singleRenameTarget.realPath)) {
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

          {upscaleStatus === 'enhancing' && (
            <button
              onClick={cancelEnhancement}
              title="Cancel enhancement"
              style={{
                flexShrink: 0,
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(255, 68, 68, 0.12)',
                border: '1px solid rgba(255, 68, 68, 0.4)',
                color: '#ff4444',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255, 68, 68, 0.25)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255, 68, 68, 0.12)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#ff4444">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            </button>
          )}
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
      {customConfirm && (
        <div className="modal-overlay" style={{ zIndex: 2000000 }}>
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="modal-content premium-glass"
            style={{ width: '450px', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '24px' }}
          >
            <div className="modal-header" style={{ marginBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="accent-icon-box" style={{ 
                  background: customConfirm.kind === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  border: `1px solid ${customConfirm.kind === 'error' ? '#ef4444' : '#f59e0b'}`
                }}>
                  <AlertCircle size={20} style={{ 
                    color: customConfirm.kind === 'error' ? '#ef4444' : '#f59e0b' 
                  }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-primary)', margin: 0 }}>
                    {customConfirm.title}
                  </h2>
                  <span style={{ fontSize: '9px', opacity: 0.5, fontWeight: 800, letterSpacing: '0.5px' }}>
                    {customConfirm.kind === 'error' ? 'CRITICAL ACTIONS PROTOCOL' : 'SYSTEM INTERLOCK ACTION'}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-body" style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: '1.6', marginBottom: '24px', whiteSpace: 'pre-line', fontFamily: 'var(--font-mono)' }}>
              {customConfirm.message}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                className="premium-btn" 
                style={{ 
                  background: 'rgba(255, 255, 255, 0.04)', 
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-primary)',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '11px',
                  letterSpacing: '0.5px'
                }}
                onClick={() => {
                  customConfirm.resolve(false);
                  setCustomConfirm(null);
                }}
              >
                CANCEL
              </button>
              <button 
                className="premium-btn"
                style={{ 
                  background: customConfirm.kind === 'error' ? '#ef4444' : 'var(--accent, #00ff88)',
                  color: customConfirm.kind === 'error' ? '#ffffff' : '#000000',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '11px',
                  letterSpacing: '0.5px',
                  boxShadow: customConfirm.kind === 'error' ? '0 0 15px rgba(239, 68, 68, 0.35)' : '0 0 15px rgba(0, 255, 136, 0.25)'
                }}
                onClick={() => {
                  customConfirm.resolve(true);
                  setCustomConfirm(null);
                }}
              >
                PROCEED
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}
