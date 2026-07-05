import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { ResizeHandles } from './components/ResizeHandles';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { motion, AnimatePresence } from 'framer-motion';
import type { VideoItem, RepeatMode, TelemetryData, CollageItem, CollageConfig, SortOption } from './types';
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
const HelpModal = lazy(() => import('./components/HelpModal').then(m => ({ default: m.HelpModal })));

import { SetupWizard } from './components/SetupWizard';

// Modular Component Imports
import { ErrorFallback } from './components/ErrorFallback';
import { ClockDisplayWrapper } from './components/ClockDisplayWrapper';
import { TelemetrySystem } from './components/TelemetrySystem';
import { CropOverlay } from './components/CropOverlay';
import { SoloPlayer } from './components/SoloPlayer';
import { MusicPlayerWidget, isAudioFile } from './components/MusicPlayerWidget';
import { FileManagementModal } from './components/FileManagementModal';
import { InAppBrowser } from './components/InAppBrowser';
import { BgContextMenu } from './components/BgContextMenu';
import { WifiShareModal } from './components/WifiShareModal';
import { VolumeRepeatModal } from './components/VolumeRepeatModal';
import { RenameProtocolModal } from './components/modals/RenameProtocolModal';
import { CustomPromptModal } from './components/modals/CustomPromptModal';
import { CustomConfirmModal } from './components/modals/CustomConfirmModal';
import { SaveCropModal } from './components/modals/SaveCropModal';
import { SaveUpscaleModal } from './components/modals/SaveUpscaleModal';
import { ResizeModal } from './components/modals/ResizeModal';
import { UpscaleStatusPanel } from './components/modals/UpscaleStatusPanel';
import { AiOfflineModal } from './components/modals/AiOfflineModal';
import { GenerateStoreLogosModal } from './components/modals/GenerateStoreLogosModal';

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
import { Minimize2, CheckCircle2, Search, LayoutGrid, Trash2, RotateCcw, RefreshCw, Bookmark, Layers, Monitor, Plus, ListRestart, Gauge, Volume2, Pause, Play, VolumeX, Repeat, Repeat1, Eye, EyeOff, Settings, X, ChevronLeft, ChevronRight, ChevronDown, Camera, Crop, Sparkles, HelpCircle, Hash, Menu, SkipBack, SkipForward, Sliders, FolderOpen } from 'lucide-react';
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
  pathsEqual,
  requiresConversion,
  maybeConvertMedia
} from './utils/videoUtils';
import { handleError, isAbortError } from './utils/errorHandler';

export default function App() {
  const { mediaMode, setMediaMode, theme, setTheme, alwaysOnTop, setAlwaysOnTop, isFS, setIsFS, masterPlaying, setMasterPlaying, masterMuted, setMasterMuted, globalVolume, setGlobalVolume, speed, setSpeed, globalRepeat, setGlobalRepeat, fitMode, setFitMode, zoom, setZoom, immersive, setImmersive, masterShowUI, setMasterShowUI, selectedIds, setSelectedIds, selectionMode, setSelectionMode, renameHistory, setRenameHistory, addToRenameHistory, aiHardwareStatus, setAiHardwareStatus, enableOSFullscreen, sortOrder, setSortOrder } = useStore();
  
  const handleOpenWebsite = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await invoke('open_external_url', { url: 'https://cosmowhisper.com' });
    } catch (err) {
      console.error("Failed to open URL via backend invoke:", err);
      try {
        await openUrl('https://cosmowhisper.com');
      } catch (err2) {
        console.error("Failed to open URL via Tauri openUrl plugin:", err2);
        window.open('https://cosmowhisper.com', '_blank');
      }
    }
  };

  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [forceSetup, setForceSetup] = useState(false);

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

  const [isPopout, setIsPopout] = useState(false);
  const [popoutUrl, setPopoutUrl] = useState('');
  const [isPopoutChecking, setIsPopoutChecking] = useState(true);

  useEffect(() => {
    const label = isTauri() ? getCurrentWindow().label : '';
    const isPop = label.startsWith('pop-');

    if (isPop) {
      setIsPopout(true);
      const cachedUrl = localStorage.getItem('cosmo-popout-active-url') || '';
      setPopoutUrl(cachedUrl);
      setIsPopoutChecking(false);
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const qPopout = urlParams.get('popout') === 'true';
    const qUrl = urlParams.get('url');

    if (qPopout && qUrl) {
      setIsPopout(true);
      setPopoutUrl(decodeURIComponent(qUrl));
      setIsPopoutChecking(false);
      return;
    }

    invoke<string | null>('get_popout_url')
      .then(url => {
        if (url) {
          setIsPopout(true);
          setPopoutUrl(url);
          localStorage.setItem('cosmo-popout-active-url', url);
        }
        setIsPopoutChecking(false);
      })
      .catch(() => {
        setIsPopoutChecking(false);
      });
  }, []);

  const [globalControl, setGlobalControl] = useState<string | null>(null);

  // IMMERSIVE CROPPING SYSTEM
  const [isCropping, setIsCropping] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 15, y: 15, w: 70, h: 70 });
  const [aspectRatio, setAspectRatio] = useState<'free' | '1:1' | '16:9' | '4:3'>('free');
  const [showSaveCropOptions, setShowSaveCropOptions] = useState(false);
  const [showSaveUpscaleOptions, setShowSaveUpscaleOptions] = useState(false);
  const [upscaleTarget, setUpscaleTarget] = useState<VideoItem | null>(null);
  const [showResizeModal, setShowResizeModal] = useState(false);
  const [resizeTarget, setResizeTarget] = useState<VideoItem | null>(null);
  const [enhancingVideoId, setEnhancingVideoId] = useState<string | null>(null);
  const isAiEnhancing = enhancingVideoId !== null;
  const [aiServerOffline, setAiServerOffline] = useState(false);
  const [upscaleStatus, setUpscaleStatus] = useState<'idle' | 'enhancing' | 'success' | 'failed'>('idle');
  // STORE LOGOS CREATOR STATE
  const [isGeneratingStoreLogos, setIsGeneratingStoreLogos] = useState(false);
  const [storeLogoImagePath, setStoreLogoImagePath] = useState('');
  const [upscaleProgressPercent, setUpscaleProgressPercent] = useState<number | null>(null);
  const [upscaleStage, setUpscaleStage] = useState<string | null>(null);
  const [lastEnhancedTitle, setLastEnhancedTitle] = useState('');
  // Ref used to cancel an in-progress enhancement — set to true to discard result and reset UI
  const enhancementCancelled = useRef(false);
  const [sessionDuration, setSessionDuration] = useState(0); 
  
  
  const [motionActive, setMotionActive] = useState(false);
  
  const [showLogs, setShowLogs] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragFile, setDragFile] = useState(false);
  const [convertingStatus, setConvertingStatus] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [colorAdjustId, setColorAdjustId] = useState<string | null>(null);
  
  
  const [masterMutedOverride, setMasterMutedOverride] = useState(false);
  
  // STICKER SYSTEM
  const [stickerLoadingId, setStickerLoadingId] = useState<string | null>(null);
  
  

  const [showSettings, setShowSettings] = useState(false);
  const [showCollections, setShowCollections] = useState(false);

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

  // Auto-save collage state on change with debounce
  useEffect(() => {
    if (collageItems.length === 0) return;
    const timer = setTimeout(() => {
      const nonImageItems = collageItems.filter(item => !item.isImage);
      const dataStr = JSON.stringify(nonImageItems);
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-collage', data: dataStr }).catch(() => {});
      }
      localStorage.setItem('cosmo-collage', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [collageItems]);

  useEffect(() => {
    const timer = setTimeout(() => {
      let configToSave = collageConfig;
      if (collageConfig.backgroundType === 'image') {
        configToSave = {
          backgroundType: 'gradient',
          backgroundValue: 'linear-gradient(135deg, #0d081b 0%, #150d2e 50%, #05020c 100%)'
        };
      }
      const dataStr = JSON.stringify(configToSave);
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-collage-cfg', data: dataStr }).catch(() => {});
      }
      localStorage.setItem('cosmo-collage-cfg', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [collageConfig]);
  // ─────────────────────────────────────────────────────────────────────────────
  const [showIntro, setShowIntro] = useState(!isPopout);
  const [introStep, setIntroStep] = useState<'whisper' | 'expand' | 'complete'>('whisper');

  useEffect(() => {
    if (isPopout) {
      setIntroStep('complete');
      setShowIntro(false);
      return;
    }

    // Play warm sci-fi rising startup sound
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        
        // Root oscillator (Sine for deep clean sub-bass)
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(90, now);
        osc1.frequency.exponentialRampToValueAtTime(360, now + 2.0); // Sweep upwards
        
        // Harmonic oscillator (Triangle for rich warm texture)
        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(180, now);
        osc2.frequency.exponentialRampToValueAtTime(720, now + 2.0);
        
        // High harmonic sparkle (Sine detuned)
        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(360, now);
        osc3.frequency.exponentialRampToValueAtTime(1440, now + 2.0);

        // Lowpass filter sweep to give it that cinematic build-up feel
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(2, now);
        filter.frequency.setValueAtTime(150, now);
        filter.frequency.exponentialRampToValueAtTime(3000, now + 1.8);

        // Gain (volume) envelope
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.08, now + 0.4); // quick fade in
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.8); // slow decay

        osc1.connect(filter);
        osc2.connect(filter);
        osc3.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc3.start(now);

        osc1.stop(now + 3.0);
        osc2.stop(now + 3.0);
        osc3.stop(now + 3.0);
      }
    } catch (e) {
      console.warn('Startup sound audio context blocked or unsupported:', e);
    }
    
    // Step 1: Whisper for 2.2 seconds
    const t1 = setTimeout(() => {
      setIntroStep('expand');
    }, 2200);
    
    // Step 2: Expand for 1.3 seconds, then complete
    const t2 = setTimeout(() => {
      setIntroStep('complete');
      setTimeout(() => {
        setShowIntro(false);
      }, 800);
    }, 3500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isPopout]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === null ? true : saved === 'true';
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

      invoke<any>('check_dependencies').then(status => {
        if (!status.python_ok || !status.packages_ok || !status.models_ok) {
          setNeedsSetup(true);
        }
      }).catch(err => console.error("Dependency check failed:", err));
    }
  }, []);
  const [singleRenameTarget, setSingleRenameTarget] = useState<VideoItem | null>(null);

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
  const [wifiShareOpen, setWifiShareOpen] = useState(false);
  const [volumeRepeatOpen, setVolumeRepeatOpen] = useState(false);
  const [wifiShareItems, setWifiShareItems] = useState<any[]>([]);

  const [customConfirm, setCustomConfirm] = useState<{
    message: string;
    title: string;
    kind?: 'info' | 'warning' | 'error';
    resolve: (value: boolean) => void;
  } | null>(null);

  const [customPrompt, setCustomPrompt] = useState<{
    message: string;
    title: string;
    defaultValue: string;
    resolve: (value: string | null) => void;
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

    (window as any).__customPromptHandler = (message: string, defaultValue: string = '', options?: any) => {
      return new Promise<string | null>((resolve) => {
        setCustomPrompt({
          message,
          defaultValue,
          title: options?.title || 'INPUT DIRECTIVE',
          resolve
        });
      });
    };

    return () => {
      delete (window as any).__customConfirmHandler;
      delete (window as any).__customPromptHandler;
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
        toastMsg = "Snapshot Saved";
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

  useEffect(() => {
    // Prevent stale selected IDs if videos are removed
    setSelectedIds(prev => {
      const validIds = new Set(videos.map(v => v.id));
      const hasStale = Array.from(prev).some(id => !validIds.has(id));
      if (hasStale) {
        const next = new Set(Array.from(prev).filter(id => validIds.has(id)));
        return next;
      }
      return prev;
    });
  }, [videos, setSelectedIds]);

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
            const convertedVids = await processFolderConversion(folderVids, mediaMode);
            if (convertedVids.length === 0) {
              addLog(`Open With: No compatible native or converted files in folder.`);
              return;
            }
            const newVids = convertedVids.map((file) => ({
              id: crypto.randomUUID(), 
              url: toCosmoUrl(file.url), 
              realPath: file.url, 
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
              const needsConv = requiresConversion(launchPath, isVideo);
              let finalPath = launchPath;
              if (needsConv) {
                const yes = await showConfirm(
                  `The launch file "${getFileNameFromPath(launchPath)}" cannot be displayed natively and will be converted to ${isVideo ? 'MP4' : 'PNG'}.\n\nConvert now?`,
                  { title: 'Format Conversion Required', kind: 'warning' }
                );
                if (yes) {
                  setConvertingStatus({ current: 1, total: 1, filename: getFileNameFromPath(launchPath) });
                  finalPath = await maybeConvertMedia(launchPath, isVideo, addLog);
                  setConvertingStatus(null);
                } else {
                  addLog(`Open With: Launch file conversion skipped.`);
                  return;
                }
              }
              const filename = getFileNameFromPath(finalPath);
              const newUnit = { 
                id: crypto.randomUUID(), 
                url: toCosmoUrl(finalPath), 
                realPath: finalPath, 
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

  const exitSoloMode = useCallback(async () => {
    if (!isTauri()) {
      setFocusedId(null);
      setImmersive(false);
      return;
    }

    try {
      const win = getCurrentWindow();
      const isAlreadyFS = await win.isFullscreen();
      if (isAlreadyFS) {
        await win.setFullscreen(false);
        setIsFS(false);
      }
      setFocusedId(null);
      setImmersive(false);
    } catch (err) {
      console.warn("Error exiting fullscreen/solo mode:", err);
      setFocusedId(null);
      setImmersive(false);
    }
  }, [setFocusedId, setImmersive, setIsFS]);

  const focusedVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
  const focusedEffectivePath = focusedVideo
    ? (focusedVideo.folderFiles && focusedVideo.currentIdx !== undefined)
      ? (focusedVideo.folderFiles[focusedVideo.currentIdx]?.path || focusedVideo.folderFiles[focusedVideo.currentIdx]?.url)
      : (focusedVideo.realPath || focusedVideo.url)
    : '';
  const isFocusedImage = focusedEffectivePath ? isValidPictureExtension(focusedEffectivePath) : false;


  const filtered = useMemo(() => {
    if (!Array.isArray(videos)) return [];
    const isValid = (v: VideoItem) => {
      const p = v.realPath || v.url;
      return p ? isValidMediaExtension(p, mediaMode) : true;
    };
    
    const items = videos.filter(v => {
      const t = v.title || 'Untitled Unit';
      const s = search || '';
      return t.toLowerCase().includes(s.toLowerCase()) && isValid(v);
    });

    if (sortOrder !== 'custom') {
      items.sort((a, b) => {
        let diff = 0;
        switch (sortOrder) {
          case 'videos-first': {
            const pathA = a.realPath || a.url || '';
            const pathB = b.realPath || b.url || '';
            const isVideoA = isValidVideoExtension(pathA);
            const isVideoB = isValidVideoExtension(pathB);
            if (isVideoA && !isVideoB) diff = -1;
            else if (!isVideoA && isVideoB) diff = 1;
            else diff = 0;
            break;
          }
          case 'pictures-first': {
            const pathA = a.realPath || a.url || '';
            const pathB = b.realPath || b.url || '';
            const isVideoA = isValidVideoExtension(pathA);
            const isVideoB = isValidVideoExtension(pathB);
            if (!isVideoA && isVideoB) diff = -1;
            else if (isVideoA && !isVideoB) diff = 1;
            else diff = 0;
            break;
          }
          case 'name-asc':
            diff = (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' });
            break;
          case 'name-desc':
            diff = (b.title || '').localeCompare(a.title || '', undefined, { numeric: true, sensitivity: 'base' });
            break;
          case 'size-asc':
            diff = (a.size || 0) - (b.size || 0);
            break;
          case 'size-desc':
            diff = (b.size || 0) - (a.size || 0);
            break;
          case 'modified-newest':
            diff = (b.modified || 0) - (a.modified || 0);
            break;
          case 'modified-oldest':
            diff = (a.modified || 0) - (b.modified || 0);
            break;
          case 'created-newest':
            diff = (b.created || 0) - (a.created || 0);
            break;
          case 'created-oldest':
            diff = (a.created || 0) - (b.created || 0);
            break;
          default:
            diff = 0;
        }
        
        // Stable sort fallback to prevent jumping
        if (diff === 0) {
          const nameCompare = (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' });
          if (nameCompare === 0) {
            return a.id.localeCompare(b.id);
          }
          return nameCompare;
        }
        return diff;
      });
    }

    return items;
  }, [videos, search, mediaMode, sortOrder]);

  const processFolderConversion = async (
    folderVids: { name: string; url: string; size?: number; modified?: number; created?: number }[],
    mode: 'all' | 'video' | 'picture'
  ): Promise<{ name: string; url: string; size?: number; modified?: number; created?: number }[]> => {
    const resolved: { path: string; name: string; isVideo: boolean; size?: number; modified?: number; created?: number }[] = [];
    for (const v of folderVids) {
      const isVideo = isValidMediaExtension(v.url, 'video');
      const isPicture = isValidMediaExtension(v.url, 'picture');
      if (isVideo || isPicture) {
        resolved.push({
          path: v.url,
          name: v.name,
          isVideo,
          size: v.size,
          modified: v.modified,
          created: v.created
        });
      }
    }

    const needConv = resolved.filter(f => requiresConversion(f.path, f.isVideo));
    let doConvert = false;

    if (needConv.length > 0) {
      const formats = [
        ...new Set(
          needConv.map(f => '.' + (f.path.split('.').pop()?.toLowerCase() ?? '')),
        ),
      ].join(', ');

      const allVideo = needConv.every(f => f.isVideo);
      const allImage = needConv.every(f => !f.isVideo);
      const targetLabel = allVideo ? 'MP4' : allImage ? 'PNG' : 'MP4 / PNG';

      doConvert = await showConfirm(
        `${needConv.length} file${needConv.length > 1 ? 's' : ''} (${formats}) inside this folder ` +
          `cannot be displayed natively and will be converted to ${targetLabel}.\n\n` +
          `The original${needConv.length > 1 ? 's' : ''} will be permanently replaced. ` +
          `Convert now?`,
        { title: 'Format Conversion Required', kind: 'warning' },
      );

      if (!doConvert) {
        addLog(`System: Conversion skipped — ${needConv.length} non-native file(s) excluded.`);
      }
    }

    const result: { name: string; url: string; size?: number; modified?: number; created?: number }[] = [];
    let convIdx = 0;

    for (const file of resolved) {
      const needsConv = requiresConversion(file.path, file.isVideo);
      if (needsConv && !doConvert) continue;

      let finalPath = file.path;
      if (needsConv && doConvert) {
        convIdx++;
        setConvertingStatus({
          current: convIdx,
          total: needConv.length,
          filename: getFileNameFromPath(file.path),
        });
        finalPath = await maybeConvertMedia(file.path, file.isVideo, addLog);
      }

      result.push({
        name: getFileNameFromPath(finalPath),
        url: finalPath,
        size: file.size,
        modified: file.modified,
        created: file.created
      });
    }

    setConvertingStatus(null);
    return result;
  };

  const loadToastPathFolder = async (path: string) => {
    try {
      const cleanPath = path.trim().replace(/^["']|["']$/g, '');
      const norm = cleanPath.replace(/\\/g, '/');
      const parts = norm.split('/');
      
      // If the last segment has a file extension (like .png or .mp4), it's a file path,
      // so we pop it to get the parent folder. Otherwise, it's already a folder.
      const lastSegment = parts[parts.length - 1];
      if (lastSegment && lastSegment.includes('.')) {
        parts.pop();
      }
      const parentPath = parts.join('/');
      
      const folderVids = await invoke<{ name: string; url: string }[]>('get_folder_videos', { path: parentPath, mode: mediaMode });
      if (folderVids && folderVids.length > 0) {
        const sortedVids = [...folderVids].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        const convertedVids = await processFolderConversion(sortedVids, mediaMode);
        if (convertedVids.length === 0) {
          addLog(`System: No compatible files in folder.`);
          return;
        }
        const folderWithUrls = convertedVids.map((v) => ({ 
          name: v.name,
          url: toCosmoUrl(v.url),
          path: v.url,
          size: v.size,
          modified: v.modified,
          created: v.created
        }));
        
        const folderName = parentPath.split('/').pop() || "Snapshots";
        const newFolderId = crypto.randomUUID();
        
        // Add folder unit
        setVideos((p) => [
          ...p,
          {
            id: newFolderId,
            url: toCosmoUrl(convertedVids[0].url),
            realPath: convertedVids[0].url,
            title: folderName,
            repeatMode: 'folder',
            repeatCount: 0,
            cols: 1,
            folderFiles: folderWithUrls,
            currentIdx: 0,
            activeClean: convertedVids[0].url
          }
        ]);
        
        // Select and focus the newly loaded folder unit immediately
        setSelectedIds(new Set([newFolderId]));
        setFocusedId(newFolderId);
        
        addLog(`SYSTEM: Loaded folder "${folderName}" displaying ${convertedVids.length} files`);
      } else {
        addLog("System: No files found in folder.");
      }
    } catch (err) {
      addLog(`ERROR: Failed to load folder: ${err}`);
    }
  };

  const handleSidebarAddFolder = async () => {
    if (isTauri()) {
      try {
        const path = await invoke<string | null>('select_folder_cmd');
        if (path) {
          const folderVids = await invoke<{ name: string; url: string }[]>('get_folder_videos', { path, mode: mediaMode });
          if (folderVids && folderVids.length > 0) {
            const convertedVids = await processFolderConversion(folderVids, mediaMode);
            if (convertedVids.length === 0) {
              addLog(`System: No compatible native or converted files in folder.`);
              return;
            }
            const folderWithUrls = convertedVids.map((v) => ({ 
              name: v.name,
              url: toCosmoUrl(v.url),
              path: v.url,
              size: v.size,
              modified: v.modified,
              created: v.created
            }));
            setVideos((p) => [
              ...p,
              {
                id: crypto.randomUUID(),
                url: toCosmoUrl(convertedVids[0].url),
                realPath: convertedVids[0].url,
                title: convertedVids[0].name,
                repeatMode: 'folder',
                repeatCount: 0,
                cols: 1,
                folderFiles: folderWithUrls,
                folderPath: path,
                folderMode: mediaMode,
                currentIdx: 0,
                playing: masterPlaying,
                muted: masterMuted,
                size: convertedVids[0].size,
                modified: convertedVids[0].modified,
                created: convertedVids[0].created
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

  const handleAddMediaFiles = async () => {
    if (isTauri()) {
      try {
        const paths = await invoke<string[] | null>('select_files_cmd');
        if (paths && paths.length > 0) {
          await handleIngestPaths(paths);
        }
      } catch (e) {
        addLog(`Ingestion Error: ${e}`);
      }
    } else {
      addLog("Local Ingestion is optimized for Cosmo Symphony Native Desktop.");
    }
  };

  const handleIngestPaths = useCallback(async (paths: string[]) => {
    if (!paths || paths.length === 0) return;
    
    // Phase 1: Resolve and identify types
    const resolved = paths.map(p => {
      const isVideo = isValidMediaExtension(p, 'video');
      const isPicture = isValidMediaExtension(p, 'picture');
      return {
        path: p,
        name: getFileNameFromPath(p),
        url: toCosmoUrl(p),
        isVideo,
        isPicture
      };
    }).filter(f => f.isVideo || f.isPicture);

    if (resolved.length === 0) return;

    // Phase 2: Check conversion
    const needConv = resolved.filter(f => requiresConversion(f.path, f.isVideo));
    let doConvert = false;

    if (needConv.length > 0) {
      const formats = [
        ...new Set(
          needConv.map(f => '.' + (f.path.split('.').pop()?.toLowerCase() ?? '')),
        ),
      ].join(', ');

      const allVideo = needConv.every(f => f.isVideo);
      const allImage = needConv.every(f => !f.isVideo);
      const targetLabel = allVideo ? 'MP4' : allImage ? 'PNG' : 'MP4 / PNG';

      doConvert = await showConfirm(
        `${needConv.length} file${needConv.length > 1 ? 's' : ''} (${formats}) ` +
          `cannot be displayed natively and will be converted to ${targetLabel}.\n\n` +
          `The original${needConv.length > 1 ? 's' : ''} will be permanently replaced. ` +
          `Convert now?`,
        { title: 'Format Conversion Required', kind: 'warning' },
      );

      if (!doConvert) {
        addLog(`System: In-app browser import conversion skipped.`);
      }
    }

    // Phase 3: Build video items
    const newItems: VideoItem[] = [];
    let convIdx = 0;
    const convFiles = resolved.filter(f => requiresConversion(f.path, f.isVideo) && doConvert);

    setConvertingStatus({ current: 0, total: convFiles.length, filename: '' });

    for (const file of resolved) {
      try {
        const needsConv = requiresConversion(file.path, file.isVideo);
        if (needsConv && !doConvert) continue;

        if (needsConv && doConvert) {
          convIdx++;
          setConvertingStatus({
            current: convIdx,
            total: convFiles.length,
            filename: file.name
          });
        }

        const finalPath = needsConv && doConvert
          ? await maybeConvertMedia(file.path, file.isVideo, addLog)
          : file.path;

        const finalUrl = finalPath !== file.path ? toCosmoUrl(finalPath) : file.url;
        const finalName = finalPath !== file.path ? getFileNameFromPath(finalPath) : file.name;

        let size = 0, modified = 0, created = 0;
        try {
          const stats = await invoke<[number, number, number]>('get_file_stats', { path: file.path });
          size = stats[0];
          modified = stats[1];
          created = stats[2];
        } catch (e) {
          console.error('[Ingestion] Failed to get stats for single file:', file.path, e);
        }

        newItems.push({
          id: crypto.randomUUID(),
          url: finalUrl,
          realPath: finalPath,
          title: finalName,
          repeatMode: 'none',
          repeatCount: 0,
          cols: 1,
          currentIdx: 0,
          playing: masterPlaying,
          muted: masterMuted,
          size,
          modified,
          created
        });
      } catch (err: any) {
        console.error('Failed to ingest browser path:', file.path, err);
      }
    }

    setConvertingStatus(null);

    if (newItems.length > 0) {
      setVideos(prev => [...prev, ...newItems]);
      addLog(`System: Ingested ${newItems.length} file(s) from in-app browser.`);
    }
  }, [masterPlaying, masterMuted, setVideos, addLog]);

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
          exitSoloMode();
        }
      } else {
        exitSoloMode();
      }
    }

    setVideos(p => p.filter(x => x.id !== id));
    addLog("Removed item from grid");
  }, [setVideos, addLog, confirmDeletion, focusedId, filtered, exitSoloMode]);

  const handleCreateSticker = async (video: VideoItem) => {
    const rawPath = (video.folderFiles && video.currentIdx !== undefined)
      ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url)
      : video.realPath;
      
    if (!rawPath) {
      addLog("Sticker Error: Native path missing");
      return;
    }
    
    const targetPath = toRealPath(rawPath) || rawPath;
    
    setStickerLoadingId(video.id);
    addLog(`AI: Extracting subject to create sticker from: ${video.title}...`);
    
    try {
      const newPath = await invoke<string>('extract_subject_on_disk', { path: targetPath });
      
      // Add the new sticker image to the grid
      const filename = getFileNameFromPath(newPath);
      const newSticker: VideoItem = {
        id: `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: filename.replace(/\.[^/.]+$/, "") + " (Cutout)",
        url: toCosmoUrl(newPath),
        realPath: newPath,
        repeatMode: 'none',
        repeatCount: 0,
        cols: 1,
        playing: false,
        muted: true,
        // Copy parent timestamps (+1ms offset) to preserve sorting placement next to each other
        created: video.created ? video.created + 1 : Date.now(),
        modified: video.modified ? video.modified + 1 : Date.now()
      };
      setVideos(prev => {
        const idx = prev.findIndex(x => x.id === video.id);
        if (idx === -1) return [...prev, newSticker];
        const next = [...prev];
        next.splice(idx + 1, 0, newSticker);
        return next;
      });
      setSortOrder('custom');
      setFocusedId(newSticker.id);
      addLog(`AI Sticker Success: Cutout generated -> ${filename}`);
    } catch (err) {
      addLog(`AI Sticker Error: ${err}`);
    } finally {
      setStickerLoadingId(null);
    }
  };

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
          exitSoloMode();
        }
      } else {
        exitSoloMode();
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
  }, [videos, setVideos, addLog, confirmDeletion, focusedId, filtered, exitSoloMode]);

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
    
    if (focusedId === id || isSlideshowActive) {
      pendingScrollIdRef.current = id;
      jumpToUnit(id);
      exitSoloMode();
    } else {
      setFocusedId(id);
      setImmersive(true);
      if (rotating) setRotating(false);
      if (enableOSFullscreen) {
        setIsFS(true);
      }
      addLog(`Deep Focus: Unit ${id.split('-')[0]}`);
    }
  }, [focusedId, isSlideshowActive, setVideos, setFocusedId, setImmersive, enableOSFullscreen, setIsFS, rotating, setRotating, addLog, jumpToUnit, exitSoloMode]);

  // Centralized Fullscreen Mode Synchronization Effect
  useEffect(() => {
    if (!isTauri()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    if (immersive && enableOSFullscreen) {
      // Delay OS fullscreen to allow smooth transition animation first
      timer = setTimeout(async () => {
        try {
          const win = getCurrentWindow();
          const isAlreadyFS = await win.isFullscreen();
          if (!isAlreadyFS && useStore.getState().immersive) {
            await win.setFullscreen(true);
            setIsFS(true);
            addLog("System Fullscreen activated via deep focus");
          }
        } catch (err) {
          console.warn("Failed to activate OS fullscreen:", err);
        }
      }, 400);
    } else if (!immersive) {
      getCurrentWindow().isFullscreen().then(async (isAlreadyFS) => {
        if (isAlreadyFS) {
          try {
            await getCurrentWindow().setFullscreen(false);
            setIsFS(false);
            addLog("System Fullscreen deactivated");
          } catch (err) {
            console.warn("Failed to deactivate OS fullscreen:", err);
          }
        }
      }).catch(() => {});
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [immersive, enableOSFullscreen, setIsFS, addLog]);

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
          v.id === nextVideo.id ? { ...v, playing: true, muted: masterMuted, currentTime: 0 } :
          v.id === focusedId ? { ...v, playing: false, muted: true } : v
        ));
      }
      addLog(`Folder Navigate [${filtered[currentIdx].title}] → ${nextVideo.title}`);
    }
  }, [filtered, focusedId, masterMuted, setFocusedId, setVideos, addLog]);

  // Reset slideshow if exiting Solo mode
  useEffect(() => {
    if (!focusedId) {
      setIsSlideshowActive(false);
    }
  }, [focusedId]);

  // Pause other media playing in the background when slideshow starts
  useEffect(() => {
    if (isSlideshowActive) {
      setVideos(prev => prev.map(v => {
        if (v.id === focusedId) {
          const firstPath = v.realPath || v.url || '';
          if (!isValidPictureExtension(firstPath)) {
            return { ...v, playing: true };
          }
          return v;
        }
        return { ...v, playing: false };
      }));
    }
  }, [isSlideshowActive, focusedId, setVideos]);


  // Slideshow Notification & Immersive Trigger
  const wasSlideshowActiveRef = useRef(false);
  useEffect(() => {
    if (isSlideshowActive && !wasSlideshowActiveRef.current) {
      setImmersive(true);
      setToast("Slideshow started");
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      wasSlideshowActiveRef.current = true;
      return () => clearTimeout(timer);
    } else if (!isSlideshowActive && wasSlideshowActiveRef.current) {
      setImmersive(false);
      wasSlideshowActiveRef.current = false;
    }
  }, [isSlideshowActive, setImmersive, setToast]);

  // Slideshow Auto-Focus Trigger: Focuses the first item to enter fullscreen if slideshow is started while in normal grid mode
  useEffect(() => {
    if (isSlideshowActive && !focusedId && filtered.length > 0) {
      const firstItem = filtered[0];
      setFocusedId(firstItem.id);
      setImmersive(true);
      // Auto-play if the first item is a video (check file extension, not mediaMode)
      const firstPath = firstItem.realPath || firstItem.url || '';
      if (!isValidPictureExtension(firstPath)) {
        setVideos(prev => prev.map(v => v.id === firstItem.id ? { ...v, playing: true, currentTime: 0 } : v));
      }
      addLog(`Slideshow: Starting fullscreen slideshow with [${firstItem.title}]`);
    }
  }, [isSlideshowActive, focusedId, filtered, setFocusedId, setVideos, setImmersive, addLog]);

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
    if (!focusedId) return [];

    const focusedVideo = videos.find(v => v.id === focusedId);
    if (!focusedVideo) return [];

    const urls: string[] = [];

    // Case 1: Sibling units (original logic)
    if (filtered.length > 1) {
      const currentIdx = filtered.findIndex(v => v.id === focusedId);
      if (currentIdx !== -1) {
        const indicesToCache = [
          (currentIdx - 2 + filtered.length) % filtered.length,
          (currentIdx - 1 + filtered.length) % filtered.length,
          (currentIdx + 1) % filtered.length,
          (currentIdx + 2) % filtered.length,
        ];
        indicesToCache.forEach(idx => {
          const video = filtered[idx];
          if (video) {
            const path = video.realPath || video.url;
            if (isValidPictureExtension(path)) {
              const url = convertToVideoUrl(video);
              if (url) urls.push(url);
            }
          }
        });
      }
    }

    // Case 2: Sub-files inside the currently focused folder unit (if it's a folder/multi-image unit)
    if (focusedVideo.folderFiles && focusedVideo.folderFiles.length > 1) {
      const currentIdx = focusedVideo.currentIdx || 0;
      const folderFiles = focusedVideo.folderFiles;
      
      const subIndicesToCache = [
        (currentIdx - 2 + folderFiles.length) % folderFiles.length,
        (currentIdx - 1 + folderFiles.length) % folderFiles.length,
        (currentIdx + 1) % folderFiles.length,
        (currentIdx + 2) % folderFiles.length,
      ];
      
      subIndicesToCache.forEach(idx => {
        const file = folderFiles[idx];
        if (file) {
          const path = file.path || file.url;
          if (isValidPictureExtension(path)) {
            const url = toCosmoUrl(path);
            if (url) urls.push(url);
          }
        }
      });
    }

    return Array.from(new Set(urls));
  }, [focusedId, filtered, videos]);

  const handleContext = useCallback(async (id: string, x: number, y: number) => {
    const video = videos.find(v => v.id === id);
    setMenu({ x, y, id });
    setMenuMetadata(null);

    if (video) {
      // For folder-browsing units, realPath stays as the first file loaded.
      // Use the currently-displayed file's path instead.
      const effectivePath = (video.folderFiles && video.currentIdx !== undefined)
        ? video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url
        : video.realPath || video.url;

      if (effectivePath) {
        if (effectivePath.startsWith('/demos/')) {
          const parts = effectivePath.split('/');
          const filename = parts[parts.length - 1];
          const ext = filename.split('.').pop() || '';
          setMenuMetadata({
            name: video.title || filename,
            format: ext.toUpperCase(),
            width: ext.toLowerCase() === 'webp' ? 1920 : 1920,
            height: ext.toLowerCase() === 'webp' ? 1080 : 1080,
            duration: ext.toLowerCase() === 'webp' ? 'Static' : '0:05',
            size: ext.toLowerCase() === 'webp' ? '110 KB' : '500 KB'
          });
        } else {
          try {
            const targetPath = toRealPath(effectivePath) || effectivePath;
            const data = await invoke('get_video_metadata', { path: targetPath });
            setMenuMetadata(data);
          } catch (e) {
            console.error("Failed to fetch metadata", e);
          }
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

  const handleLoadDemos = useCallback(() => {
    const DEMO_ITEMS: VideoItem[] = [
      {
        id: 'demo-1',
        title: 'Work Colleagues',
        url: '/demos/promo_001.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-2',
        title: 'Space Command',
        url: '/demos/promo_002.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-3',
        title: 'Girl Listening to Music',
        url: '/demos/promo_003.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-4',
        title: 'Glowing Flower',
        url: '/demos/promo_004.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-5',
        title: 'Sixties Cinematic',
        url: '/demos/promo_005.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-6',
        title: 'Rainy City',
        url: '/demos/promo_006.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-7',
        title: 'Chameleon in Forest',
        url: '/demos/chameleon.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-8',
        title: 'Helicopter Waterfall',
        url: '/demos/promo_008.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-9',
        title: 'Man with Cat',
        url: '/demos/man_cat.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-10',
        title: 'Chameleon in Forest (Alt)',
        url: '/demos/chameleon.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-11',
        title: 'Chinese Lady Drinking Tea',
        url: '/demos/chinese_lady_tea.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-12',
        title: 'Native American Elder',
        url: '/demos/abstract_art_1.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-13',
        title: 'Monitor Setup',
        url: '/demos/abstract_art_2.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-14',
        title: 'Friends Walking',
        url: '/demos/friends_town.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      }
    ];
    setVideos(DEMO_ITEMS);
    addLog("Onboarding: Loaded Cosmo Symphony Demo Workspace");
  }, [setVideos, addLog]);

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

      const originalPath = toRealPath(focusedVideo.realPath || focusedVideo.url) || focusedVideo.realPath || focusedVideo.url;
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
            setTimeout(() => { setUpscaleStatus(current => current === 'enhancing' ? 'enhancing' : 'idle'); }, 5000);
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

  const handleResize = useCallback((v: any) => {
    const effectiveRealPath = (v.folderFiles && v.currentIdx !== undefined)
      ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
      : v.realPath;
    const effectiveTitle = (v.folderFiles && v.currentIdx !== undefined)
      ? (v.folderFiles[v.currentIdx]?.name || v.title)
      : v.title;

    if (!effectiveRealPath) {
      addLog("Resize Error: Native path missing.");
      return;
    }
    setResizeTarget({
      ...v,
      parentUnitId: v.id,
      realPath: effectiveRealPath,
      title: effectiveTitle,
      folderIdx: (v.folderFiles && v.currentIdx !== undefined) ? v.currentIdx : undefined
    });
    setShowResizeModal(true);
  }, [addLog]);

  const handleResizeSuccess = useCallback((newPath: string, overwrite: boolean) => {
    if (!resizeTarget) return;
    const target = resizeTarget;

    setVideos((prev) => {
      let current = [...prev];
      const separator = newPath.includes('\\') ? '\\' : '/';
      const fileName = newPath.substring(newPath.lastIndexOf(separator) + 1);
      const cleanTitle = fileName.replace(/\.[^/.]+$/, "");

      if (overwrite) {
        // Overwrite original file
        if (target.folderIdx !== undefined && target.folderFiles) {
          // It was a file inside a folder cycle
          current = current.map((v) => {
            if (v.id === target.parentUnitId && v.folderFiles) {
              const updatedFiles = [...v.folderFiles];
              updatedFiles[target.folderIdx] = {
                ...updatedFiles[target.folderIdx],
                url: toCosmoUrl(newPath) + `?t=${Date.now()}`,
                path: newPath
              };
              return {
                ...v,
                folderFiles: updatedFiles,
                url: v.currentIdx === target.folderIdx ? (toCosmoUrl(newPath) + `?t=${Date.now()}`) : v.url
              };
            }
            return v;
          });
        } else {
          // Individual card
          current = current.map((v) => {
            if (v.id === target.parentUnitId) {
              return {
                ...v,
                url: toCosmoUrl(newPath) + `?t=${Date.now()}`,
                realPath: newPath
              };
            }
            return v;
          });
        }
        setToast(`Original media resized successfully!`);
      } else {
        // Save As Copy: Append a new card to grid
        const newUnit = {
          id: `resize-${Date.now()}`,
          title: cleanTitle,
          url: toCosmoUrl(newPath),
          realPath: newPath,
          currentTime: 0,
          repeatMode: 'none' as any,
          playing: false,
          muted: false
        };
        current.push(newUnit);
        setToast(`Resized copy saved: ${cleanTitle}`);
      }
      return current;
    });

    setTimeout(() => setToast(null), 3000);
    setResizeTarget(null);
  }, [resizeTarget, setVideos, setToast]);

  const executeUpscale = async (overwrite: boolean) => {
    if (!upscaleTarget) return;
    const v = upscaleTarget;
    setShowSaveUpscaleOptions(false);
    setEnhancingVideoId(v.parentUnitId || v.id);
    setUpscaleStatus('enhancing');
    setLastEnhancedTitle(v.title);
    setUpscaleProgressPercent(null);
    setUpscaleStage(null);
    enhancementCancelled.current = false;

    const isVideo = v.realPath?.toLowerCase().match(/\.(mp4|webm|mov|mkv|avi|ts|mpeg|mpg)$/);
    let unlistenProgress: (() => void) | undefined;

    addLog(`Upscaling: ${v.title} (${overwrite ? 'Overwrite' : 'Save As'}) — running local ${isVideo ? 'video' : 'image'} super-resolution...`);
    try {
      if (isVideo) {
        const win = getCurrentWindow();
        unlistenProgress = await win.listen<{ frame: number, total: number, stage: string }>('upscale-progress', (event) => {
          const { frame, total, stage } = event.payload;
          setUpscaleStage(stage);
          if (stage === 'upscaling' && total > 0) {
            setUpscaleProgressPercent(Math.round((frame / total) * 100));
          } else if (stage === 'extracting') {
            setUpscaleProgressPercent(10);
          } else if (stage === 'assembling') {
            setUpscaleProgressPercent(95);
          }
        });
      }

      const result = await invoke<string>(isVideo ? 'upscale_video' : 'upscale_image', { path: v.realPath, overwrite });
      if (unlistenProgress) unlistenProgress();
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

        // Auto-switch to appropriate tab so it is immediately visible on the grid
        const targetTab = isVideo ? 'video' : 'picture';
        if (mediaMode !== targetTab) {
          setMediaMode(targetTab);
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
      if (unlistenProgress) unlistenProgress();
      if (enhancementCancelled.current) return;
      console.error("Upscale failed:", err);
      addLog(`Upscale failed: ${err}`);
      setUpscaleStatus('failed');
    } finally {
      if (!enhancementCancelled.current) {
        setEnhancingVideoId(null);
        setUpscaleTarget(null);
        setUpscaleProgressPercent(null);
        setUpscaleStage(null);
        // Automatically clear success/failed state after 5 seconds
        setTimeout(() => {
          setUpscaleStatus(current => current === 'enhancing' ? 'enhancing' : 'idle');
        }, 5000);
      }
    }
  };

  const cancelEnhancement = useCallback(() => {
    enhancementCancelled.current = true;
    setUpscaleStatus('idle');
    setEnhancingVideoId(null);
    setUpscaleTarget(null);
    setUpscaleProgressPercent(null);
    setUpscaleStage(null);
    invoke('cancel_video_upscale').catch(err => console.error("Failed to cancel video upscale:", err));
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
                const rawDestDir = overItem.realPath || '';
                const destDir = toRealPath(rawDestDir) || rawDestDir;
                const movedItems: { originalId: string; newPath: string }[] = [];

                for (const item of targetItems) {
                  const rawSrcPath = item.realPath || '';
                  const srcPath = toRealPath(rawSrcPath) || rawSrcPath;
                  const separator = srcPath.includes('/') ? '/' : '\\';
                  const newFileName = srcPath.substring(srcPath.lastIndexOf(separator) + 1);
                  const destFilePath = `${destDir}${separator}${newFileName}`;

                  const exists = await invoke<boolean>('file_exists', { path: destFilePath });
                  let overwrite = false;
                  let renameSibling = false;

                  if (exists) {
                    const confirmOver = await showConfirm(
                      `File Collision\n\n"${newFileName}" already exists in the destination folder.\n\nDo you want to overwrite it?\n(Select No/Cancel to keep both files)`,
                      { title: 'File Collision', kind: 'warning' }
                    );
                    if (confirmOver) {
                      overwrite = true;
                    } else {
                      renameSibling = true;
                    }
                  }

                  // Move file on disk
                  const finalPath = await invoke<string>('move_file_on_disk', { 
                    srcPath, 
                    destDir,
                    overwrite,
                    renameSibling
                  });
                  movedItems.push({ originalId: item.id, newPath: finalPath });
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
    if (sortOrder !== 'custom') {
      setSortOrder('custom');
      addLog(`System: Reset sorting to custom for manual reordering.`);
    }
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
    const endedVideo = filtered.find(v => v.id === id);
    if (!endedVideo) return;
    
    const isEndedAudio = isAudioFile(endedVideo.realPath || endedVideo.url || '');
    let currentMode = (endedVideo.repeatMode && endedVideo.repeatMode !== 'none')
      ? endedVideo.repeatMode
      : globalRepeat;

    // If global loop is ON and the card has playlist folder files, advance to the next file inside the card
    const hasFolderFiles = endedVideo.folderFiles && endedVideo.folderFiles.length > 0;
    if (currentMode === 'always' && hasFolderFiles) {
      currentMode = 'folder';
    }

    // 1. Repeat Once (or Repeat One/Always)
    if (currentMode === 'always' || currentMode === 'once') {
      setVideos(prev => prev.map(v => {
        if (v.id === id) {
          const nextCount = currentMode === 'once' ? (v.repeatCount || 0) + 1 : 0;
          if (currentMode === 'once' && nextCount > 1) {
            // Finished the single repeat. Stop playing.
            return { ...v, playing: false, repeatCount: 0 };
          }
          return { ...v, playing: true, currentTime: 0, repeatCount: nextCount };
        }
        return v;
      }));
      return;
    }

    // 2. Don't Repeat ('none')
    if (currentMode === 'none') {
      // Just stop playback of the ended video
      setVideos(prev => prev.map(v => v.id === id ? { ...v, playing: false, repeatCount: 0 } : v));
      addLog(`Playback ended: [${endedVideo.title}] (Repeat Mode: None)`);
      return;
    }

    // 3. Repeat All ('folder')
    if (currentMode === 'folder') {
      // A. If the video card itself contains a folder/playlist of files, cycle to the next file IN THAT CARD
      const hasFolderFiles = endedVideo.folderFiles && endedVideo.folderFiles.length > 0;
      if (hasFolderFiles) {
        setVideos(prev => prev.map(v => {
          if (v.id !== id) return v;
          const nextIdx = ((v.currentIdx || 0) + 1) % v.folderFiles.length;
          const nextFile = v.folderFiles[nextIdx];
          addLog(`Folder Cycle [${v.title}] -> ${nextFile.name}`);
          return { 
            ...v, 
            currentIdx: nextIdx, 
            url: nextFile.url, 
            realPath: nextFile.path, 
            title: nextFile.name,
            playing: true,
            currentTime: 0
          };
        }));
        return;
      }

      // B. If in Solo mode or it is an audio track, go to the next sibling card in the workspace playlist
      if ((focusedId && id === focusedId) || isEndedAudio) {
        const currentIdx = filtered.findIndex(v => v.id === id);
        if (currentIdx !== -1 && filtered.length > 1) {
          const nextIdx = (currentIdx + 1) % filtered.length;
          const nextVideo = filtered[nextIdx];
          if (nextVideo) {
            if (focusedId && id === focusedId) {
              setNavDirection(1);
              setFocusedId(nextVideo.id);
            }
            
            setVideos(prev => prev.map(v => {
              if (v.id === nextVideo.id) {
                return { ...v, playing: true, muted: masterMuted, currentTime: 0 };
              }
              if (v.id === id) {
                return { ...v, playing: false, muted: true };
              }
              return v;
            }));

            if (isEndedAudio) {
              useStore.getState().setCurrentPlayingSongId(nextVideo.id);
            }
            
            addLog(`Sequence (Repeat All): [${filtered[currentIdx].title}] ended. Playing next sibling [${nextVideo.title}]`);
            return;
          }
        }
      }

      // B. Grid mode (on the tile):
      // - If folder-browsing unit: cycle to the next file in the folder
      // - If regular video: loop it infinitely
      setVideos(prev => prev.map(v => {
        if (v.id !== id) return v;
        
        if (v.folderFiles && v.folderFiles.length > 0) {
          const nextIdx = ((v.currentIdx || 0) + 1) % v.folderFiles.length;
          const nextFile = v.folderFiles[nextIdx];
          addLog(`Folder Cycle [${v.title}] -> ${nextFile.name}`);
          return { 
            ...v, 
            currentIdx: nextIdx, 
            url: nextFile.url, 
            realPath: nextFile.path, 
            title: nextFile.name,
            playing: true,
            currentTime: 0
          };
        } else {
          // Replay/loop regular video card on the grid
          const videoEl = document.querySelector(`[data-id="${id}"] video`) as HTMLVideoElement;
          if (videoEl) {
            videoEl.currentTime = 0;
            videoEl.play().catch(() => {});
          }
          return { ...v, playing: true, currentTime: 0 };
        }
      }));
    }
  }, [globalRepeat, addLog, setVideos, focusedId, filtered, setFocusedId, masterMuted]);

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

  // Mute/Unmute audio and pause/play video when entering or exiting solo/big screen mode
  const prevFocusedIdForMute = useRef(focusedId);
  useEffect(() => {
    if (prevFocusedIdForMute.current && !focusedId) {
      // Exiting solo mode: Muted and paused all media (Panic Reset)
      setMasterPlaying(false);
      setMasterMuted(true);
      setGlobalVolume(0);
      setVideos(p => p.map(v => ({ ...v, playing: false, muted: true })));
      addLog("Exiting Solo Mode: Muted and paused all media (Panic Reset)");
    } else if (!prevFocusedIdForMute.current && focusedId) {
      // Entering solo mode: play focused, unmute, pause/mute all others
      setMasterPlaying(true);
      setMasterMuted(false);
      setGlobalVolume(1.0); // Full volume for solo focused media
      setVideos(p => p.map(v => ({
        ...v,
        playing: v.id === focusedId,
        muted: v.id !== focusedId
      })));
      const focusedVideo = videos.find(x => x.id === focusedId);
      addLog(`Entering Solo Mode: Playing [${focusedVideo ? focusedVideo.title : focusedId}] with audio`);
    }
    prevFocusedIdForMute.current = focusedId;
  }, [focusedId, setMasterPlaying, setMasterMuted, setGlobalVolume, setVideos, addLog, videos]);

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
    showHelp,
    isPopout,
    isSlideshowActive,
    setIsSlideshowActive,
    onUpdateVideo,
    onToggleFocus,
    exitSoloMode,
    onSelectAll: handleSelectAll,
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
    setConvertingStatus,
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
      if (now - lastSoloWheelTime.current > 180) {
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

  if (isPopoutChecking) {
    return <div className="cosmo-boot" style={{ background: '#000' }} />;
  }

  if (fatalError) return <ErrorFallback error={fatalError} />;



  if (!isInitialized) {
    return (
      <div className="cosmo-boot">
        <div className="boot-nebula" />
        <div className="boot-content">
          <img src="/logo.png" className="boot-logo" alt="Cosmo Symphony" />
          <div className="boot-text">
            <h2>COSMO SYMPHONY</h2>
            <div className="boot-loader-bar">
              <div className="boot-loader-progress" />
            </div>
            <p>Initializing Symphony Orchestrator...</p>
            <div style={{ marginTop: '16px', fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', letterSpacing: '0.5px', WebkitFontSmoothing: 'antialiased' }}>
              🚀 Discover more professional tools & AI creative suites at <a href="https://cosmowhisper.com" onClick={handleOpenWebsite} style={{ color: 'var(--accent, #00ff88)', textDecoration: 'underline', fontWeight: 600, cursor: 'pointer' }}>cosmowhisper.com</a>
            </div>
            <button 
              className="boot-bypass-btn"
              onClick={() => setIsInitialized(true)} 
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
      onDrop={(e) => {
        const internalPath = e.dataTransfer.getData("application/cosmo-file");
        if (internalPath) {
          e.preventDefault();
          e.stopPropagation();
          handleIngestPaths([internalPath]);
        } else {
          e.preventDefault();
        }
      }}
    >
      {showIntro && (
        <div className={`cosmo-intro-overlay ${introStep === 'complete' ? 'fadeout' : ''}`}>
          <div className={`intro-glow-bg ${introStep !== 'whisper' ? 'expanded' : ''}`} />
          <div className={`intro-logo-content ${introStep !== 'whisper' ? 'expanded' : ''}`}>
            <span className="intro-title-text">COSMO</span>
            <span className="intro-subtitle-text">SYMPHONY</span>
          </div>
        </div>
      )}
      {needsSetup && (
        <SetupWizard onComplete={() => { setNeedsSetup(false); setForceSetup(false); }} force={forceSetup} />
      )}
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
              bottom: '20px',
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
                onClick={() => {
                  loadToastPathFolder(toastPath);
                }}
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

      {convertingStatus && (
        <div className="converting-overlay">
          <div className="converting-spinner" />
          <div className="converting-text">
            <span className="converting-label">Converting</span>
            <span className="converting-count">{convertingStatus.current} of {convertingStatus.total}</span>
            <span className="converting-filename">{convertingStatus.filename}</span>
          </div>
        </div>
      )}
      
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
          handleResize={handleResize}
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
          isStickerLoading={stickerLoadingId === focusedId}
          onCreateSticker={handleCreateSticker}
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
                className={`sidebar-nav-item ${(!showCollections && !showLogs && !showSettings && !showHelp && !showCollageCanvas) ? 'active' : ''}`}
                onClick={() => {
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
                  const target = !showCollageCanvas;
                  setShowCollageCanvas(target);
                  setShowCollections(false);
                  setShowLogs(false);
                  setShowSettings(false);
                  setShowHelp(false);
                }}
              >
                <div className="sidebar-nav-item-icon"><Layers size={16} /></div>
                <span className="sidebar-nav-item-label">Collage Canvas</span>
              </div>



              {/* SETS/COLLECTIONS TAB */}
              <div 
                className={`sidebar-nav-item ${showCollections ? 'active' : ''}`}
                onClick={() => {
                  const target = !showCollections;
                  setShowCollections(target);
                  setShowCollageCanvas(false);
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
                  const target = !showLogs;
                  setShowLogs(target);
                  setShowCollections(false);
                  setShowSettings(false);
                  setShowHelp(false);
                }}
              >
                <div className="sidebar-nav-item-icon"><Hash size={16} /></div>
                <span className="sidebar-nav-item-label">Console Logs</span>
              </div>



              {/* SETTINGS TAB */}
              <div 
                className={`sidebar-nav-item ${showSettings ? 'active' : ''}`}
                onClick={() => {
                  const target = !showSettings;
                  setShowSettings(target);
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
              onAddVideo={onAddVideo}
              onNavigateToGrid={() => setShowCollageCanvas(false)}
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
              toggleMasterMute={toggleMasterMute}
              globalControl={globalControl}
          rotating={rotating}
              setRotating={setRotating}
              isSlideshowActive={isSlideshowActive}
              setIsSlideshowActive={setIsSlideshowActive}
              slideshowInterval={slideshowInterval}
              setSlideshowInterval={setSlideshowInterval}
              setSnapshotDir={setSnapshotDir}
              onOpenVolumeRepeat={() => setVolumeRepeatOpen(true)}
              onForceSetup={() => {
                setForceSetup(true);
                setNeedsSetup(true);
              }}
              onOpenWifiShare={() => {
                invoke('set_wifi_shared_files', { paths: [] })
                  .then(() => {
                    setWifiShareItems([]);
                    setWifiShareOpen(true);
                  })
                  .catch((err) => {
                    addLog(`Wi-Fi Share ERROR: ${err}`);
                  });
              }}
              onForceSetup={() => {
                setForceSetup(true);
                setNeedsSetup(true);
                setShowSettings(false);
              }}
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
            onBgContextMenu={(x, y) => {
              setBgMenu({ x, y });
              setMenu(null);
            }}
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
            stickerLoadingId={stickerLoadingId}
            onCreateSticker={handleCreateSticker}
            onLoadDemos={handleLoadDemos}
          />

          {!immersive && (
            <footer className="app-footer">
              <TelemetrySystem videosCount={videos.length} isPopout={isPopout} />
            </footer>
          )}

          <InAppBrowser 
            onAddFile={(path) => handleIngestPaths([path])}
            onAddMultipleFiles={handleIngestPaths}
            addLog={addLog}
          />
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
              case 'create_sticker':
                handleCreateSticker(v);
                break;
              case 'crop':
                setFocusedId(v.id);
                setIsCropping(true);
                setCropBox({ x: 15, y: 15, w: 70, h: 70 });
                setAspectRatio('free');
                break;
              case 'resize':
                handleResize(v);
                break;
              case 'generate_store_logos':
                if (effectivePath) {
                  setStoreLogoImagePath(effectivePath);
                  setIsGeneratingStoreLogos(true);
                }
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
              case 'select-all': handleSelectAll(); break;
              case 'deselect-all': {
                setSelectedIds(new Set());
                setSelectionMode(false);
                addLog("SYSTEM: Deselected all items.");
                break;
              }
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
                   invoke('open_folder', { path: folderEffectivePath })
                     .then(() => addLog(`SYSTEM: Opened folder displaying "${folderEffectivePath}"`))
                     .catch(err => addLog(`ERROR: Failed to open folder: ${err}`));
                 } else {
                   addLog("Error: Native path lost for this unit.");
                 }
                 break;
              }
              case 'upscale': handleUpscale(v); break;
              case 'resize': handleResize(v); break;
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
                  setSingleRenameTarget({ ...v, realPath: effectiveRealPath, title: effectiveTitle });
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
                    const cleanPath = toRealPath(effectivePath) || effectivePath;
                    const resultPath = await invoke<string>('duplicate_file_on_disk', { srcPath: cleanPath });
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
              case 'share_file': {
                const effectiveRealPath = (v.folderFiles && v.currentIdx !== undefined)
                  ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
                  : v.realPath;
                const effectiveTitle = (v.folderFiles && v.currentIdx !== undefined)
                  ? (v.folderFiles[v.currentIdx]?.name || v.title)
                  : v.title;
                const itemsToShare = [{ id: v.id, title: effectiveTitle, url: v.url, realPath: effectiveRealPath }];
                const realPaths = itemsToShare.map(x => x.realPath || '').filter(Boolean);
                addLog(`Wi-Fi Share: Setting shared file: ${effectiveTitle}`);
                invoke('set_wifi_shared_files', { paths: realPaths })
                  .then(() => {
                    setWifiShareItems(itemsToShare);
                    setWifiShareOpen(true);
                  })
                  .catch((err) => {
                    addLog(`Wi-Fi Share ERROR: ${err}`);
                  });
                break;
              }
              case 'share_selected': {
                const selectedItems = videos.filter(item => selectedIds.has(item.id)).map(item => {
                  const effectiveRealPath = (item.folderFiles && item.currentIdx !== undefined)
                    ? (item.folderFiles[item.currentIdx]?.path || item.folderFiles[item.currentIdx]?.url)
                    : item.realPath;
                  const effectiveTitle = (item.folderFiles && item.currentIdx !== undefined)
                    ? (item.folderFiles[item.currentIdx]?.name || item.title)
                    : item.title;
                  return { id: item.id, title: effectiveTitle, url: item.url, realPath: effectiveRealPath };
                });
                const realPaths = selectedItems.map(x => x.realPath || '').filter(Boolean);
                addLog(`Wi-Fi Share: Setting shared files list: ${realPaths.length} items`);
                invoke('set_wifi_shared_files', { paths: realPaths })
                  .then(() => {
                    setWifiShareItems(selectedItems);
                    setWifiShareOpen(true);
                  })
                  .catch((err) => {
                    addLog(`Wi-Fi Share ERROR: ${err}`);
                  });
                break;
              }
            }
            setMenu(null);
            setMenuMetadata(null);
          }}
        />
      )}

      {bgMenu && (
        <BgContextMenu
          x={bgMenu.x}
          y={bgMenu.y}
          onClose={() => setBgMenu(null)}
          onAddFolder={handleSidebarAddFolder}
          onAddMedia={handleAddMediaFiles}
          onPurge={async () => { if (await showConfirm('Purge Workspace? This will clear all cards.', { title: 'Purge Workspace', kind: 'error' })) setVideos([]); }}
          onSelectAll={handleSelectAll}
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
        <RenameProtocolModal
          target={singleRenameTarget}
          renameHistory={renameHistory}
          addToRenameHistory={addToRenameHistory}
          onClose={() => setSingleRenameTarget(null)}
          setVideos={setVideos}
          addLog={addLog}
        />
      )}

      {/* Save options and status overlays */}
      <SaveCropModal
        isOpen={showSaveCropOptions}
        onClose={() => setShowSaveCropOptions(false)}
        onSave={handleSaveCrop}
      />

      <GenerateStoreLogosModal
        isOpen={isGeneratingStoreLogos}
        onClose={() => setIsGeneratingStoreLogos(false)}
        imagePath={storeLogoImagePath}
        onLog={addLog}
      />

      <SaveUpscaleModal
        isOpen={showSaveUpscaleOptions && upscaleTarget !== null}
        onClose={() => {
          setShowSaveUpscaleOptions(false);
          setUpscaleTarget(null);
        }}
        onExecute={executeUpscale}
      />

      <ResizeModal
        isOpen={showResizeModal && resizeTarget !== null}
        onClose={() => {
          setShowResizeModal(false);
          setResizeTarget(null);
        }}
        target={resizeTarget}
        onSuccess={handleResizeSuccess}
        addLog={addLog}
      />

      <UpscaleStatusPanel
        status={upscaleStatus}
        progressPercent={upscaleProgressPercent}
        stage={upscaleStage}
        title={lastEnhancedTitle}
        onCancel={cancelEnhancement}
        onDismiss={() => setUpscaleStatus('idle')}
      />

      <AiOfflineModal
        isOpen={aiServerOffline}
        onClose={() => setAiServerOffline(false)}
        onBack={() => {
          setAiServerOffline(false);
          setShowSaveCropOptions(true);
        }}
      />

      {customConfirm && (
        <CustomConfirmModal
          title={customConfirm.title}
          message={customConfirm.message}
          kind={customConfirm.kind}
          onResolve={(val) => {
            customConfirm.resolve(val);
            setCustomConfirm(null);
          }}
        />
      )}
      {customPrompt && (
        <CustomPromptModal
          title={customPrompt.title}
          message={customPrompt.message}
          defaultValue={customPrompt.defaultValue}
          onResolve={(val) => {
            customPrompt.resolve(val);
            setCustomPrompt(null);
          }}
        />
      )}
      <MusicPlayerWidget videos={videos} setVideos={setVideos} />
      <WifiShareModal
        isOpen={wifiShareOpen}
        onClose={() => setWifiShareOpen(false)}
        sharedFiles={wifiShareItems}
        onLog={addLog}
        onAddMultipleFiles={handleIngestPaths}
      />
      <VolumeRepeatModal
        isOpen={volumeRepeatOpen}
        onClose={() => setVolumeRepeatOpen(false)}
        globalVolume={globalVolume}
        setGlobalVolume={setGlobalVolume}
        masterMuted={masterMuted}
        toggleMasterMute={toggleMasterMute}
        globalRepeat={globalRepeat}
        setGlobalRepeat={setGlobalRepeat}
        videos={videos}
        onUpdateVideo={handleUpdate}
      />
    </main>
  );
}
