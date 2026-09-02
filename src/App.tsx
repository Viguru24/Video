import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { ResizeHandles } from './components/ResizeHandles';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { motion, AnimatePresence } from 'framer-motion';
import type { VideoItem, RepeatMode, TelemetryData, CollageItem, CollageConfig, SortOption } from './types';
const CollageWorkspace = lazy(() => import('./components/CollageWorkspace').then(m => ({ default: m.CollageWorkspace })));
const InAppBrowser = lazy(() => import('./components/InAppBrowser').then(m => ({ default: m.InAppBrowser })));
const SetupWizard = lazy(() => import('./components/SetupWizard').then(m => ({ default: m.SetupWizard })));
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

// Modular Component and Hook Imports
import { ErrorFallback } from './components/ErrorFallback';
import { ClockDisplayWrapper } from './components/ClockDisplayWrapper';
import { TelemetrySystem } from './components/TelemetrySystem';
import { CropOverlay } from './components/CropOverlay';
import { SoloPlayer } from './components/SoloPlayer';
import { MusicPlayerWidget } from './components/MusicPlayerWidget';
import { PopoutPlayer } from './components/PopoutPlayer';
import { BgContextMenu } from './components/BgContextMenu';
import { useTauriWindowEvents } from './hooks/useTauriWindowEvents';
import { useMediaImport } from './hooks/useMediaImport';
import { useMediaPlayback } from './hooks/useMediaPlayback';
import { useVideoOperations } from './hooks/useVideoOperations';
import { useStickerCreator } from './hooks/useStickerCreator';
import { useWorkspaceDnd } from './hooks/useWorkspaceDnd';
import { useDemoLoader } from './hooks/useDemoLoader';
import { IntroOverlay, ShutdownOverlay } from './components/IntroOverlay';
import { Sidebar } from './components/Sidebar';
import { ModalOrchestrator } from './components/modals/ModalOrchestrator';
import { CommandPalette } from './components/CommandPalette';

import { DndContext } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
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
  maybeConvertMedia,
  triggerPopOut,
  generateUUID,
  normalizeMediaKey,
  isMediaAlreadyInWorkspace,
  fuzzyMatchScore
} from './utils/videoUtils';
import { handleError, isAbortError } from './utils/errorHandler';

// Helper: detect demo-bundled assets (read-only, cannot be edited)
function isDemoFile(video: { url?: string; realPath?: string }): boolean {
  const url = video.url || '';
  const rp = video.realPath || '';
  return url.startsWith('/demos/') || url.startsWith('demos/') ||
         rp.includes('MicroMeadow.CosmoSymphony') && rp.includes('demos');
}

export default function App() {
  const { mediaMode, setMediaMode, theme, setTheme, alwaysOnTop, setAlwaysOnTop, isFS, setIsFS, masterPlaying, setMasterPlaying, masterMuted, setMasterMuted, globalVolume, setGlobalVolume, speed, setSpeed, globalRepeat, setGlobalRepeat, fitMode, setFitMode, zoom, setZoom, immersive, setImmersive, masterShowUI, setMasterShowUI, selectedIds, setSelectedIds, selectionMode, setSelectionMode, renameHistory, setRenameHistory, addToRenameHistory, aiHardwareStatus, setAiHardwareStatus, enableOSFullscreen, sortOrder, setSortOrder, quickFolders, setQuickFolders, autoSyncFolders, folderSwitchDelay, slideshowInterval, setSlideshowInterval } = useStore();
  
  const hasCheckedQuickFolders = useRef(false);

  useEffect(() => {
    if (hasCheckedQuickFolders.current) return;
    if (!quickFolders || quickFolders.length === 0) return;
    hasCheckedQuickFolders.current = true;

    if (isTauri()) {
      import('@tauri-apps/api/path').then(({ appDataDir, pictureDir, videoDir, documentDir }) => {
        appDataDir().then(dir => {
          localStorage.setItem('cosmo-app-data-dir', dir);
        }).catch(err => console.error("Failed to get appDataDir:", err));

        // Self-healing path validation for pinned quick folders
        (async () => {
          try {
            const nextFolders = [...quickFolders];
            let modified = false;

            for (let i = 0; i < nextFolders.length; i++) {
              const folder = nextFolders[i];
              try {
                const exists = await invoke<boolean>('file_exists', { path: folder.path });
                if (!exists) {
                  let fallbackPath = '';
                  if (folder.id === 'demo-pictures') {
                    fallbackPath = await pictureDir();
                  } else if (folder.id === 'demo-videos') {
                    fallbackPath = await videoDir();
                  } else {
                    fallbackPath = await documentDir();
                  }

                  if (fallbackPath) {
                    nextFolders[i] = {
                      ...folder,
                      path: fallbackPath
                    };
                    modified = true;
                  }
                }
              } catch (err) {
                console.error(`Failed to check existence for ${folder.path}:`, err);
              }
            }

            if (modified) {
              setQuickFolders(nextFolders);
            }
          } catch (err) {
            console.error("Failed to validate quick folders on startup:", err);
          }
        })();

      }).catch(err => console.error("Failed to import @tauri-apps/api/path:", err));
    }
  }, [quickFolders, setQuickFolders]);

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
        window.open('https://cosmowhisper.com', '_blank', 'noopener,noreferrer');
      }
    }
  };

  const { isWindowMaximized } = useTauriWindowEvents();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [forceSetup, setForceSetup] = useState(false);
  
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

  const [isPopout, setIsPopout] = useState(() => {
    if (isTauri()) {
      try {
        const label = getCurrentWindow().label;
        if (label.startsWith('pop-') || label === 'popout') {
          return true;
        }
      } catch {}
    }
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('popout') === 'true';
    }
    return false;
  });

  const [popoutUrl, setPopoutUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const qUrl = urlParams.get('url');
      if (qUrl) {
        try {
          return decodeURIComponent(qUrl);
        } catch {
          return qUrl;
        }
      }
    }
    if (isTauri()) {
      try {
        const label = getCurrentWindow().label;
        if (label.startsWith('pop-') || label === 'popout') {
          return localStorage.getItem(`cosmo-popout-active-url-${label}`) || '';
        }
      } catch {}
    }
    return '';
  });

  const [showShutdown, setShowShutdown] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Pre-warm the AudioContext on the first real user interaction so that
  // WebView2 allows audio playback later (autoplay policy requires a user gesture).
  useEffect(() => {
    if (isPopout) return;
    const warmUp = () => {
      try {
        if (!audioCtxRef.current) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            audioCtxRef.current = new AudioCtx();
            // Immediately suspend so we're not wasting resources
            audioCtxRef.current.suspend().catch(() => {});
          }
        }
      } catch (e) { /* silently ignore */ }
      // Remove listeners after first interaction
      document.removeEventListener('mousedown', warmUp);
      document.removeEventListener('keydown', warmUp);
    };
    document.addEventListener('mousedown', warmUp);
    document.addEventListener('keydown', warmUp);
    return () => {
      document.removeEventListener('mousedown', warmUp);
      document.removeEventListener('keydown', warmUp);
    };
  }, [isPopout]);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isTauri() || isPopout) return;

    let unlistenClose: (() => void) | undefined;
    let isClosing = false;

    const setupCloseListener = async () => {
      try {
        const win = getCurrentWindow();
        unlistenClose = await win.onCloseRequested(async (event) => {
          // Prevent duplicate closes
          if (isClosing) { event.preventDefault(); return; }
          isClosing = true;
          event.preventDefault();
          setShowShutdown(true);

          // Play descending shutdown sweep using the pre-warmed context
          try {
            const ctx = audioCtxRef.current;
            if (ctx) {
              ctx.resume().catch(e => console.warn("AudioContext resume failed:", e));
              const now = ctx.currentTime;

              const osc1 = ctx.createOscillator();
              osc1.type = 'sine';
              osc1.frequency.setValueAtTime(360, now);
              osc1.frequency.exponentialRampToValueAtTime(90, now + 2.0);

              const osc2 = ctx.createOscillator();
              osc2.type = 'triangle';
              osc2.frequency.setValueAtTime(720, now);
              osc2.frequency.exponentialRampToValueAtTime(180, now + 2.0);

              const osc3 = ctx.createOscillator();
              osc3.type = 'sine';
              osc3.frequency.setValueAtTime(1440, now);
              osc3.frequency.exponentialRampToValueAtTime(360, now + 2.0);

              const filter = ctx.createBiquadFilter();
              filter.type = 'lowpass';
              filter.Q.setValueAtTime(2, now);
              filter.frequency.setValueAtTime(3000, now);
              filter.frequency.exponentialRampToValueAtTime(150, now + 1.8);

              const gainNode = ctx.createGain();
              gainNode.gain.setValueAtTime(0, now);
              gainNode.gain.linearRampToValueAtTime(0.08, now + 0.2);
              gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

              osc1.connect(filter);
              osc2.connect(filter);
              osc3.connect(filter);
              filter.connect(gainNode);
              gainNode.connect(ctx.destination);

              osc1.start(now); osc2.start(now); osc3.start(now);
              osc1.stop(now + 2.8); osc2.stop(now + 2.8); osc3.stop(now + 2.8);
            }
          } catch (e) {
            console.warn('Shutdown sound failed:', e);
          }

          // Wait for the animation + sound, then exit via the backend
          // (avoids the destroy/exit race condition that causes a crash)
          setTimeout(async () => {
            try {
              // Direct process terminate through background command, then close window
              await invoke('exit_app');
              await win.close();
            } catch {
              // If invoke fails, close window directly to trigger Rust's on_window_event
              await win.close();
            }
          }, 2600);
        });
      } catch (err) {
        console.error("Failed to setup close listener:", err);
      }
    };

    setupCloseListener();

    return () => {
      if (unlistenClose) unlistenClose();
    };
  }, [isPopout]);

  const [isPopoutChecking, setIsPopoutChecking] = useState(!isPopout);

  useEffect(() => {
    if (isTauri()) {
      try {
        const label = getCurrentWindow().label;
        if (label.startsWith('pop-') || label === 'popout' || isPopout) {
          invoke<string | null>('get_popout_url')
            .then(url => {
              if (url) {
                setIsPopout(true);
                setPopoutUrl(url);
                try {
                  localStorage.setItem(`cosmo-popout-active-url-${label}`, url);
                } catch {}
              }
              setIsPopoutChecking(false);
            })
            .catch(() => {
              setIsPopoutChecking(false);
            });
          return;
        }
      } catch {}
    }
    setIsPopoutChecking(false);
  }, [isPopout]);

  useEffect(() => {
    if (isTauri()) {
      import('@tauri-apps/api/path').then(async ({ appDataDir }) => {
        try {
          const dir = await appDataDir();
          localStorage.setItem('cosmo-app-data-dir', dir);
        } catch (e) {
          console.error('Failed to get appDataDir:', e);
        }
      });
    }
  }, []);

  const [globalControl, setGlobalControl] = useState<string | null>(null);

  // IMMERSIVE CROPPING SYSTEM
  // States and hooks extracted to useVideoOperations, useStickerCreator, useWorkspaceDnd

  // STORE LOGOS CREATOR STATE


  const [sessionDuration, setSessionDuration] = useState(0); 
  
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [motionActive, setMotionActive] = useState(false);
  
  const [showLogs, setShowLogs] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  const [convertingStatus, setConvertingStatus] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [colorAdjustId, setColorAdjustId] = useState<string | null>(null);
  
  
  const [masterMutedOverride, setMasterMutedOverride] = useState(false);

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
      const dataStr = JSON.stringify(collageConfig);
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-collage-cfg', data: dataStr }).catch(() => {});
      }
      localStorage.setItem('cosmo-collage-cfg', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [collageConfig]);
  // ─────────────────────────────────────────────────────────────────────────────
  // Intro overlay states and startup sound logic have been extracted to IntroOverlay.tsx

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
  const metadataCache = useRef<Record<string, any>>({});
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
              id: generateUUID(), 
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
                id: generateUUID(), 
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

  // ── GLOBAL CLIPBOARD SCREENSHOT PASTE ENGINE ─────────────────────────────────
  const handlePasteImage = useCallback((targetTileId?: string | null, customDataUrl?: string) => {
    const processDataUrl = async (dataUrl: string) => {
      const timestamp = Date.now();
      const timeStr = new Date(timestamp).toLocaleTimeString();
      let realPath: string | undefined = undefined;
      let finalUrl = dataUrl;
      let fileTitle = `Screenshot ${timeStr}.png`;

      // In Tauri runtime: save screenshot directly to disk as a real PNG file
      if (isTauri()) {
        try {
          const savedPath = await invoke<string>('save_pasted_clipboard_image', { base64Data: dataUrl });
          if (savedPath) {
            realPath = savedPath;
            finalUrl = toCosmoUrl(savedPath);
            fileTitle = getFileNameFromPath(savedPath);
          }
        } catch (err) {
          console.error("Failed to save screenshot image to disk:", err);
        }
      }

      const targetId = targetTileId || focusedId || (selectedIds.size === 1 ? Array.from(selectedIds)[0] : null);

      if (targetId) {
        setVideos((prev) =>
          prev.map((v) => {
            if (v.id === targetId) {
              return {
                ...v,
                url: finalUrl,
                realPath: realPath || v.realPath,
                title: fileTitle,
              };
            }
            return v;
          })
        );
        addLog(`Pasted screenshot into tile [${targetId}] (${fileTitle})`);
        setToast(`📋 Saved & Pasted: ${fileTitle}`);
        setTimeout(() => setToast(null), 2500);
      } else {
        const newUnit: VideoItem = {
          id: generateUUID(),
          url: finalUrl,
          realPath: realPath,
          title: fileTitle,
          playing: false,
          muted: false,
          repeatMode: 'none' as RepeatMode,
          repeatCount: 1,
          cols: 1,
        };
        setVideos((prev) => [newUnit, ...prev]);
        setMediaMode('picture');
        addLog(`Pasted screenshot as new tile [${fileTitle}] → Auto-switched to Stills tab`);
        setToast(`📋 Saved & Pasted: ${fileTitle}`);
        setTimeout(() => setToast(null), 2500);
      }
    };

    if (customDataUrl) {
      processDataUrl(customDataUrl);
      return;
    }

    if (navigator.clipboard && navigator.clipboard.read) {
      navigator.clipboard.read().then(async (items) => {
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const reader = new FileReader();
            reader.onload = (e) => {
              const resultUrl = e.target?.result as string;
              if (resultUrl) processDataUrl(resultUrl);
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
        addLog("No image found on clipboard to paste.");
        setToast("⚠️ No screenshot found on clipboard");
        setTimeout(() => setToast(null), 2500);
      }).catch((err) => {
        console.warn("Clipboard API error:", err);
      });
    }
  }, [focusedId, selectedIds, setVideos, addLog]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
        return; // Don't intercept typing in inputs
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              const dataUrl = evt.target?.result as string;
              if (dataUrl) handlePasteImage(undefined, dataUrl);
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePasteImage]);



  const focusedVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
  const focusedEffectivePath = focusedVideo
    ? (focusedVideo.folderFiles && focusedVideo.currentIdx !== undefined)
      ? (focusedVideo.folderFiles[focusedVideo.currentIdx]?.path || focusedVideo.folderFiles[focusedVideo.currentIdx]?.url)
      : (focusedVideo.realPath || focusedVideo.url)
    : '';
  const resolvedFocusedPath = toRealPath(focusedEffectivePath) || focusedEffectivePath;
  const isFocusedImage = resolvedFocusedPath ? isValidPictureExtension(resolvedFocusedPath) : false;
  const isFocusedVideo = resolvedFocusedPath ? isValidVideoExtension(resolvedFocusedPath) : false;


  const filtered = useMemo(() => {
    if (!Array.isArray(videos)) return [];
    const isValid = (v: VideoItem) => {
      const p = v.realPath || v.url;
      return p ? isValidMediaExtension(p, mediaMode) : true;
    };
    
    const query = (search || '').trim();

    if (query) {
      // Smart Fuzzy Matching with Relevance Ranking
      const scored: { item: VideoItem; score: number }[] = [];
      for (const v of videos) {
        if (!isValid(v)) continue;
        const target = `${v.title || ''} ${v.realPath || ''} ${v.url || ''}`;
        const score = fuzzyMatchScore(target, query);
        if (score > 0) {
          scored.push({ item: v, score });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.map(s => s.item);
    }

    const items = videos.filter(isValid);

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

  const {
    processFolderConversion,
    loadToastPathFolder,
    handleSidebarAddFolder,
    handleAddMediaFiles,
    handleIngestPaths
  } = useMediaImport({
    mediaMode,
    setMediaMode,
    masterPlaying,
    masterMuted,
    setVideos,
    setSelectedIds,
    setFocusedId,
    setConvertingStatus,
    addLog
  });

  // ─── MULTI-FOLDER AUTO-SYNC WATCHER ENGINE ─────────────────────────────────
  const knownFolderFilesRef = useRef<Map<string, Set<string>>>(new Map());
  const pendingAutoAddRef = useRef<Set<string>>(new Set());
  const dirDebounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const videosRef = useRef<VideoItem[]>(videos);
  videosRef.current = videos;
  const autoSyncFoldersRef = useRef<string[]>(autoSyncFolders);
  autoSyncFoldersRef.current = autoSyncFolders;
  const handleIngestPathsRef = useRef(handleIngestPaths);
  handleIngestPathsRef.current = handleIngestPaths;
  const folderSwitchDelayRef = useRef(folderSwitchDelay);
  folderSwitchDelayRef.current = folderSwitchDelay;
  const addLogRef = useRef(addLog);
  addLogRef.current = addLog;

  // Auto-deduplicate workspace items if duplicate tiles exist
  useEffect(() => {
    setVideos(prev => {
      const seen = new Set<string>();
      let hasDupes = false;
      const deduped = prev.filter(v => {
        const key = normalizeMediaKey(v.realPath || v.url || v.id);
        if (!key) return true;
        if (seen.has(key)) {
          hasDupes = true;
          return false;
        }
        seen.add(key);
        return true;
      });
      return hasDupes ? deduped : prev;
    });
  }, [videos.length]);

  // Watch active autoSyncFolders in Rust & record baseline of existing files
  useEffect(() => {
    if (!isTauri()) return;
    
    autoSyncFolders.forEach(async (folderPath) => {
      try {
        await invoke('watch_directory', { dirPath: folderPath });
        
        const normFolder = normalizeMediaKey(folderPath);
        if (!knownFolderFilesRef.current.has(normFolder)) {
          // Record existing files as baseline so we ONLY import newly created/added files
          const result = await invoke<any[]>('list_directory_contents', { dirPath: folderPath });
          const existingSet = new Set(
            result
              .filter(x => !x.is_dir && x.is_media)
              .map(x => normalizeMediaKey(x.path))
          );
          knownFolderFilesRef.current.set(normFolder, existingSet);
        }
      } catch (err) {
        console.warn("Failed to watch auto-sync folder:", folderPath, err);
      }
    });
  }, [autoSyncFolders]);

  // Global listener for folder mutations across all watched folders
  useEffect(() => {
    if (!isTauri()) return;
    let unsubscribe: (() => void) | null = null;
    let active = true;

    const setupMultiFolderListener = async () => {
      try {
        const unlistenFn = await listen<string>('directory-changed', async (event) => {
          if (!active) return;
          const changedPath = event.payload;
          if (!changedPath) return;

          const normChanged = normalizeMediaKey(changedPath);

          // Check if this folder is in autoSyncFolders
          const isWatched = autoSyncFoldersRef.current.some(p => normalizeMediaKey(p) === normChanged);
          if (!isWatched) return;

          // Clear any existing timer for this directory to collapse rapid burst write events
          const existingTimer = dirDebounceTimersRef.current.get(normChanged);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(async () => {
            dirDebounceTimersRef.current.delete(normChanged);
            if (!active) return;

            try {
              const result = await invoke<any[]>('list_directory_contents', { dirPath: changedPath });
              const mediaFiles = result.filter(x => !x.is_dir && x.is_media);
              const currentKnown = knownFolderFilesRef.current.get(normChanged) || new Set<string>();

              // Find ONLY brand new incoming files that are not already in workspace or known
              const newFiles = mediaFiles.filter(f => {
                const fileKey = normalizeMediaKey(f.path);
                return (
                  !currentKnown.has(fileKey) &&
                  !pendingAutoAddRef.current.has(fileKey) &&
                  !isMediaAlreadyInWorkspace(f.path, videosRef.current)
                );
              });
              
              if (newFiles.length > 0) {
                const pathsToIngest: string[] = [];
                newFiles.forEach(f => {
                  const fileKey = normalizeMediaKey(f.path);
                  pendingAutoAddRef.current.add(fileKey);
                  currentKnown.add(fileKey);
                  pathsToIngest.push(f.path);
                });
                knownFolderFilesRef.current.set(normChanged, currentKnown);

                if (pathsToIngest.length > 0) {
                  const folderName = changedPath.split(/[\\/]/).pop() || "Folder";
                  addLogRef.current(`⚡ Auto-sync: Detected ${pathsToIngest.length} new file(s) in [${folderName}]. Ingesting...`);
                  await handleIngestPathsRef.current(pathsToIngest);
                }
              }
            } catch (e) {
              console.error("Multi-folder auto-sync scan failed:", e);
            }
          }, 1200);

          dirDebounceTimersRef.current.set(normChanged, timer);
        });
        if (active) {
          unsubscribe = unlistenFn;
        } else {
          unlistenFn();
        }
      } catch (err) {
        console.error("Failed to setup multi-folder listener:", err);
      }
    };

    setupMultiFolderListener();

    return () => {
      active = false;
      dirDebounceTimersRef.current.forEach(t => clearTimeout(t));
      dirDebounceTimersRef.current.clear();
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const { handleVideoEnded } = useMediaPlayback({
    globalRepeat,
    addLog,
    setVideos,
    focusedId,
    filtered,
    setFocusedId,
    masterMuted,
    setNavDirection
  });

  const {
    isCropping,
    setIsCropping,
    cropBox,
    setCropBox,
    aspectRatio,
    setAspectRatio,
    showSaveCropOptions,
    setShowSaveCropOptions,
    showSaveUpscaleOptions,
    setShowSaveUpscaleOptions,
    upscaleTarget,
    setUpscaleTarget,
    enhancingVideoId,
    setEnhancingVideoId,
    aiServerOffline,
    setAiServerOffline,
    upscaleStatus,
    setUpscaleStatus,
    upscaleProgressPercent,
    upscaleStage,
    lastEnhancedTitle,
    showResizeModal,
    setShowResizeModal,
    resizeTarget,
    setResizeTarget,
    handleSaveCrop,
    handleUpscale,
    handleResize,
    handleResizeSuccess,
    executeUpscale,
    cancelEnhancement
  } = useVideoOperations({
    focusedId,
    setFocusedId,
    focusedVideo,
    mediaMode,
    setMediaMode,
    setVideos,
    addLog,
    setToast,
    setToastPath
  });

  const {
    stickerLoadingId,
    handleCreateSticker,
    handleCancelSticker
  } = useStickerCreator({
    setVideos,
    setSortOrder,
    setFocusedId,
    addLog
  });

  const {
    dragId,
    dragFile,
    setDragFile,
    sensors,
    handleDragStart,
    handleDragEnd,
    onReorder
  } = useWorkspaceDnd({
    videos,
    setVideos,
    masterPlaying,
    masterMuted,
    selectedIds,
    setSelectedIds,
    setSelectionMode,
    setToast,
    addLog
  });

  const {
    onAddVideo,
    handleLoadDemos
  } = useDemoLoader({
    setVideos,
    addLog
  });

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

  const handlePurgeWorkspace = useCallback(async () => {
    const yes = await showConfirm('Purge Workspace? This will clear all cards from your grid.', { title: 'Purge Workspace', kind: 'error' });
    if (!yes) return;
    setVideos([]);
    setSelectedIds(new Set());
    setFocusedId(null);
    setColorAdjustId(null);
    pendingAutoAddRef.current.clear();
    localStorage.setItem('cosmo-purged', 'true');
    const dataStr = JSON.stringify([]);
    if (isTauri()) {
      invoke('save_persistence', { key: 'cosmo-v2', data: dataStr }).catch(() => {});
      emit('workspace-changed', { key: 'cosmo-v2', data: dataStr }).catch(() => {});
    }
    safeSetLocalStorage('cosmo-v2', dataStr);
    addLog('SYSTEM: Workspace purged.');
  }, [addLog, setVideos, setSelectedIds, setFocusedId, setColorAdjustId]);

  const handleRefreshTiles = useCallback(async () => {
    addLog('Refreshing tiles — validating files on disk & checking temporary drives...');
    const toRemoveIds: string[] = [];
    let preservedCount = 0;
    let folderRescannedCount = 0;

    for (const vid of videos) {
      const rawPath = vid.folderPath || vid.realPath;
      if (!rawPath || typeof rawPath !== 'string') continue;

      // Skip internal demo units
      if (rawPath.startsWith('/demos/') || rawPath.startsWith('demos/')) continue;

      try {
        const driveStatus = await invoke<{ exists: boolean; drive_root: string; drive_accessible: boolean }>('check_path_drive_status', { path: rawPath });

        if (!driveStatus.exists) {
          if (!driveStatus.drive_accessible && driveStatus.drive_root) {
            // Drive (e.g. M:\) is unmounted / disabled — PRESERVE tile safely in workspace!
            preservedCount++;
          } else {
            // File is genuinely deleted on an active, accessible drive
            toRemoveIds.push(vid.id);
          }
        } else {
          // Path exists! If it's a folder unit, auto-rescan its files in case drive was re-enabled or files were added
          const fPath = vid.folderPath || rawPath;
          if (vid.folderPath || vid.repeatMode === 'folder') {
            try {
              const scanned = await invoke<{ name: string; url: string }[]>('get_folder_videos', {
                path: fPath,
                mode: vid.folderMode || 'all'
              });
              if (scanned && scanned.length > 0) {
                scanned.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                const folderWithUrls = scanned.map(fi => ({
                  name: fi.name,
                  url: toCosmoUrl(fi.url),
                  path: fi.url
                }));
                // Update playlist files immediately while respecting user-configured delay before switching tile display
                const delayMs = (useStore.getState().folderSwitchDelay || 10) * 1000;
                setVideos(prev => prev.map(v => {
                  if (v.id !== vid.id) return v;
                  const currentFileStillExists = v.url && scanned.some(s => toCosmoUrl(s.url) === v.url || s.url === v.realPath);
                  if (currentFileStillExists) {
                    // Retain active file view, but update available file list
                    return { ...v, folderFiles: folderWithUrls };
                  }
                  // If active file no longer exists, update tile display immediately to first valid file
                  return {
                    ...v,
                    folderFiles: folderWithUrls,
                    url: toCosmoUrl(scanned[0].url),
                    realPath: scanned[0].url,
                    title: scanned[0].name
                  };
                }));

                // Schedule delayed transition if new files are detected
                if (scanned.length > (vid.folderFiles?.length || 0)) {
                  const newestFile = scanned[scanned.length - 1];
                  setTimeout(() => {
                    setVideos(prev => prev.map(v => v.id === vid.id ? {
                      ...v,
                      url: toCosmoUrl(newestFile.url),
                      realPath: newestFile.url,
                      title: newestFile.name,
                      currentIdx: scanned.length - 1
                    } : v));
                    addLog(`Folder Sync: Switched tile [${vid.title}] to newly added file "${newestFile.name}" after ${useStore.getState().folderSwitchDelay}s delay`);
                  }, delayMs);
                }
                folderRescannedCount++;
              }
            } catch (err) {
              console.warn("Folder rescan failed:", fPath, err);
            }
          }
        }
      } catch {
        // Safe fallback: preserve tile
      }
    }

    if (toRemoveIds.length > 0) {
      setVideos(prev => prev.filter(v => !toRemoveIds.includes(v.id)));
      addLog(`Refresh complete: removed ${toRemoveIds.length} ghost tile(s).`);
    }

    if (preservedCount > 0) {
      addLog(`Drive Protection Active: Preserved ${preservedCount} tile(s) on unmounted temporary drive(s).`);
    }

    if (folderRescannedCount > 0) {
      addLog(`Folder Sync: Re-scanned and updated ${folderRescannedCount} folder unit(s).`);
    }

    if (toRemoveIds.length === 0 && preservedCount === 0 && folderRescannedCount === 0) {
      addLog('Refresh complete: all workspace tiles are valid.');
    }
  }, [videos, setVideos, addLog]);

  // handleCreateSticker and handleCancelSticker are extracted to useStickerCreator

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
      setVideos(p => p.filter(x => x.id !== id));
      await new Promise(resolve => setTimeout(resolve, 150));
      await invoke('recycle_unit', { path: video.realPath });
      addLog("Unit Annihilated (Recycle Bin)");
    } catch (e) {
      console.error(e);
      addLog("Annihilation Failed: " + e);
    }
  }, [videos, setVideos, addLog, confirmDeletion, focusedId, filtered, exitSoloMode]);

  const handleFileManagementSuccess = useCallback((updatedItems: { originalId: string; newPath: string }[]) => {
    if (fileManageMode === 'move') {
      // Clear stale metadata cache for all old paths so Picture Details re-fetches from new location
      updatedItems.forEach(update => {
        const videoItem = videos.find(v => v.id === update.originalId);
        if (videoItem) {
          // Determine old effective path (handles folder cycle units too)
          const oldPaths: string[] = [];
          if (videoItem.folderFiles && videoItem.currentIdx !== undefined) {
            const f = videoItem.folderFiles[videoItem.currentIdx];
            if (f?.path) oldPaths.push(f.path);
            if (f?.url) oldPaths.push(f.url);
          } else {
            if (videoItem.realPath) oldPaths.push(videoItem.realPath);
            if (videoItem.url) oldPaths.push(videoItem.url);
          }
          oldPaths.forEach(p => { delete metadataCache.current[p]; });
        }
      });

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
      setIsCropping(false);
      setShowSaveCropOptions(false);
      setShowSaveUpscaleOptions(false);
      setShowResizeModal(false);
      setColorAdjustId(null);
      setGlobalControl(null);
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
  }, [filtered, focusedId, masterMuted, setFocusedId, setVideos, addLog, setIsCropping, setShowSaveCropOptions, setShowSaveUpscaleOptions, setShowResizeModal, setColorAdjustId, setGlobalControl]);

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

  // Slideshow Timer Effect: Only applies to static images
  useEffect(() => {
    if (!isSlideshowActive || !focusedId) return;

    // For videos and audio, sequential playback is handled on-end in handleVideoEnded instead of a timer.
    if (!isFocusedImage || isFocusedVideo) return;

    const timer = setInterval(() => {
      handleNavigateSibling(1);
    }, Math.max(1, slideshowInterval) * 1000);

    return () => clearInterval(timer);
  }, [isSlideshowActive, focusedId, slideshowInterval, handleNavigateSibling, isFocusedImage, isFocusedVideo]);

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

  const fetchMenuMetadata = useCallback(async (video: VideoItem) => {
    // For folder-browsing units, use currently-displayed file
    const effectivePath = (video.folderFiles && video.currentIdx !== undefined)
      ? video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url
      : video.realPath || video.url;

    const pathClean = effectivePath || video.url || '';
    const ext = pathClean.split('?')[0].split('.').pop() || 'MEDIA';
    const isImg = isValidPictureExtension(pathClean);

    // 1. Instant synchronous metadata (Zero-delay popup)
    const initialMeta = metadataCache.current[pathClean] || {
      name: (video.folderFiles && video.currentIdx !== undefined)
        ? (video.folderFiles[video.currentIdx]?.name || video.title)
        : (video.title || getFileNameFromPath(pathClean)),
      format: ext.toUpperCase(),
      size: video.size ? (video.size < 1024 * 1024 ? `${(video.size / 1024).toFixed(1)} KB` : `${(video.size / (1024 * 1024)).toFixed(1)} MB`) : 'Standard',
      width: video.width || 0,
      height: video.height || 0,
      duration: isImg ? 'Static' : undefined
    };

    setMenuMetadata(initialMeta);

    // 2. Fast background ffprobe probe (if not cached)
    if (pathClean && !metadataCache.current[pathClean]) {
      if (pathClean.startsWith('/demos/')) {
        const demoMeta = {
          name: video.title || pathClean.split('/').pop() || 'Demo',
          format: ext.toUpperCase(),
          width: 1920,
          height: 1080,
          duration: isImg ? 'Static' : '0:05',
          size: isImg ? '110 KB' : '500 KB'
        };
        metadataCache.current[pathClean] = demoMeta;
        setMenuMetadata(demoMeta);
      } else {
        try {
          const targetPath = toRealPath(pathClean) || pathClean;
          const data = await invoke<any>('get_video_metadata', { path: targetPath });
          if (data) {
            metadataCache.current[pathClean] = data;
            setMenuMetadata(data);
          }
        } catch (e: any) {
          console.error("Failed to fetch metadata", e);
        }
      }
    }
  }, []);

  const handleContext = useCallback(async (id: string, x: number, y: number) => {
    const video = videos.find(v => v.id === id);
    if (!video) {
      setMenu({ x, y, id });
      setMenuMetadata(null);
      return;
    }

    setMenu({ x, y, id });
    await fetchMenuMetadata(video);
  }, [videos, fetchMenuMetadata]);

  // Keep ContextMenu and top info header dynamically updated when scrolling/navigating in fullscreen
  const activeSoloVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
  const activeSoloKey = activeSoloVideo 
    ? `${activeSoloVideo.id}_${activeSoloVideo.currentIdx ?? 0}_${activeSoloVideo.realPath ?? activeSoloVideo.url ?? ''}`
    : null;

  useEffect(() => {
    if (focusedId && menu && activeSoloVideo) {
      if (menu.id !== focusedId) {
        setMenu(prev => prev ? { ...prev, id: focusedId } : null);
      }
      fetchMenuMetadata(activeSoloVideo);
    }
  }, [activeSoloKey, focusedId, activeSoloVideo, fetchMenuMetadata]);

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

  // onAddVideo and handleLoadDemos are extracted to useDemoLoader

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

  // handleSaveCrop, handleUpscale, handleResize, handleResizeSuccess, executeUpscale, and cancelEnhancement are extracted to useVideoOperations

  // drag end and standard reordering are handled by useWorkspaceDnd hook

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
      // Exiting solo mode: Muted and paused master media
      setMasterPlaying(false);
      setMasterMuted(true);
      setGlobalVolume(0);
      addLog("Exiting Solo Mode: Returned to Grid");
    } else if (!prevFocusedIdForMute.current && focusedId) {
      // Entering solo mode: unmute and play master for focused unit
      setMasterPlaying(true);
      setMasterMuted(false);
      setGlobalVolume(1.0); // Full volume for solo focused media
      addLog("Entering Solo Mode");
    }
    prevFocusedIdForMute.current = focusedId;
  }, [focusedId, setMasterPlaying, setMasterMuted, setGlobalVolume, addLog]);

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
    setMediaMode,
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
    if (!focusedId) return;

    const handleSoloWheel = (e: WheelEvent) => {
      // Only act when in solo mode and no modifier keys
      if (e.altKey || e.ctrlKey || e.shiftKey) return;
      // Only act if the target is inside the solo overlay
      const overlay = soloOverlayRef.current;
      if (!overlay || !overlay.contains(e.target as Node)) return;

      e.preventDefault();
      e.stopImmediatePropagation();
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

    // Window capture phase — fires before ANY other handler in the entire app
    window.addEventListener('wheel', handleSoloWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener('wheel', handleSoloWheel, { capture: true });
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

  const handleTriggerWifiShare = useCallback((targetVideos?: VideoItem[]) => {
    let candidateList: VideoItem[] | undefined = targetVideos;
    if (candidateList && candidateList.length > 0) {
      // User targeted specific video(s)
    } else if (selectedIds.size > 0) {
      // User selected items with checkboxes
      candidateList = videos.filter(item => selectedIds.has(item.id));
    } else {
      // General toolbar click with no selection: open Wi-Fi Share manager without auto-sharing all workspace files
      setWifiShareOpen(true);
      return;
    }

    const resolvedItems = candidateList.map(item => {
      const targetPath = (item.folderFiles && item.currentIdx !== undefined)
        ? (item.folderFiles[item.currentIdx]?.path || item.folderFiles[item.currentIdx]?.url || item.realPath || item.url)
        : (item.realPath || item.url);
      const effectiveRealPath = toRealPath(targetPath) || targetPath;
      const effectiveTitle = (item.folderFiles && item.currentIdx !== undefined)
        ? (item.folderFiles[item.currentIdx]?.name || item.title)
        : item.title;
      return { id: item.id, title: effectiveTitle, url: item.url, realPath: effectiveRealPath };
    });

    const realPaths = resolvedItems.map(x => x.realPath || '').filter(Boolean);
    addLog(`Wi-Fi Share: Preparing ${realPaths.length} file(s) for mobile transfer...`);

    invoke('set_wifi_shared_files', { paths: realPaths })
      .then(() => {
        setWifiShareItems(resolvedItems);
        setWifiShareOpen(true);
      })
      .catch((err) => {
        addLog(`Wi-Fi Share ERROR: ${err}`);
        setWifiShareOpen(true);
      });
  }, [videos, selectedIds, addLog]);

  if (isPopoutChecking) {
    return <div className="cosmo-boot" style={{ background: '#000' }} />;
  }

  if (fatalError) return <ErrorFallback error={fatalError} />;

  if (isPopout) {
    return <PopoutPlayer url={popoutUrl} />;
  }

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
      onDrop={async (e) => {
        const internalPath = e.dataTransfer.getData("application/cosmo-file");
        if (internalPath) {
          e.preventDefault();
          e.stopPropagation();
          
          const normalizePath = (p: string) => p ? p.replace(/\\/g, '/').toLowerCase() : '';
          const normalizedInternal = normalizePath(internalPath);
          const isAlreadyInWorkspace = videos.some(v => 
            normalizePath(v.realPath || '') === normalizedInternal || 
            (v.folderFiles && v.folderFiles.some(f => normalizePath(f.path || '') === normalizedInternal))
          );
          
          if (isAlreadyInWorkspace || e.altKey || e.ctrlKey) {
            try {
              addLog(`Duplicating file on disk: ${internalPath}`);
              setToast(`Creating physical duplicate...`);
              const newPath = await invoke<string>('duplicate_file_on_disk', { srcPath: internalPath });
              addLog(`Successfully duplicated file: ${newPath}`);
              handleIngestPaths([newPath]);
            } catch (err) {
              console.error("Duplicate via drag-drop failed:", err);
              addLog(`ERROR: Failed to duplicate - ${err}`);
              setToast(`Duplicate failed: ${err}`);
              setTimeout(() => setToast(null), 4000);
            }
          } else {
            handleIngestPaths([internalPath]);
          }
        } else {
          e.preventDefault();
        }
      }}
    >
      <IntroOverlay isPopout={isPopout} />
      <ShutdownOverlay show={showShutdown} />
      <AnimatePresence>
        {needsSetup && (
          <Suspense fallback={null}>
            <SetupWizard key="setup-wizard" onComplete={async () => {
              setNeedsSetup(false);
              setForceSetup(false);
              try {
                const res = await invoke<string>('detect_ai_hardware');
                setAiHardwareStatus(res);
              } catch (e) {
                console.error("Failed to re-detect AI hardware:", e);
              }
            }} force={forceSetup} />
          </Suspense>
        )}
      </AnimatePresence>
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
                  invoke('open_folder', { path: toastPath }).catch(err => {
                    console.error("Failed to open folder:", err);
                  });
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
          onCancelSticker={handleCancelSticker}
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
          <Sidebar
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            showCollageCanvas={showCollageCanvas}
            setShowCollageCanvas={setShowCollageCanvas}
            showCollections={showCollections}
            setShowCollections={setShowCollections}
            showLogs={showLogs}
            setShowLogs={setShowLogs}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            showHelp={showHelp}
            setShowHelp={setShowHelp}
            handleSidebarAddFolder={handleSidebarAddFolder}
          />
        )}

        {/* Right Viewport wrapper */}
        <div className="main-viewport-wrapper">
          <Suspense fallback={null}>
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
              onOpenWifiShare={() => handleTriggerWifiShare()}
              isSlideshowActive={isSlideshowActive}
              setIsSlideshowActive={setIsSlideshowActive}
              slideshowInterval={slideshowInterval}
              setSlideshowInterval={setSlideshowInterval}
              rotating={rotating}
              setRotating={setRotating}
              toggleMasterMute={toggleMasterMute}
              globalControl={globalControl}
              onPurgeWorkspace={handlePurgeWorkspace}
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
            onCancelSticker={handleCancelSticker}
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
          </Suspense>
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
              case 'pop_out': {
                const path = effectivePath || v.realPath || v.url;
                await triggerPopOut(path, v.title);
                addLog(`SYSTEM: Popped out window for "${v.title}"`);
                break;
              }
              case 'refresh_tile': {
                const cacheBuster = `t=${Date.now()}`;
                const cleanUrl = v.url.split('?')[0];
                onUpdateVideo(v.id, { url: `${cleanUrl}?${cacheBuster}` });
                addLog(`SYSTEM: Refreshed tile "${v.title}"`);
                break;
              }
              case 'play': onUpdateVideo(v.id, { playing: !v.playing }); break;
              case 'mute': onUpdateVideo(v.id, { muted: !v.muted }); break;
              case 'stop': onUpdateVideo(v.id, { playing: false }); break;
              case 'loop': onUpdateVideo(v.id, { repeatMode: v.repeatMode === 'always' ? 'none' : 'always' }); break;
              case 'step-back': setGlobalControl(`stepback-${v.id}-${Date.now()}`); break;
              case 'step-forward': setGlobalControl(`stepforward-${v.id}-${Date.now()}`); break;
              case 'create_sticker':
                handleCreateSticker(v);
                break;
              case 'trim_crop':
                useStore.getState().setTrimCropModalTarget(v);
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
                  
                  const targetIdSet = new Set(selectedIds);
                  const pathsToRecycle: string[] = [];
                  let focusedWillBeDeleted = false;
                  const nextVideos: VideoItem[] = [];

                  for (const vid of videos) {
                    if (targetIdSet.has(vid.id)) {
                      if (vid.id === focusedId) focusedWillBeDeleted = true;

                      if (vid.folderFiles && vid.folderFiles.length > 1) {
                        const curIdx = vid.currentIdx || 0;
                        const targetPath = vid.folderFiles[curIdx]?.path || vid.folderFiles[curIdx]?.url;
                        if (targetPath) pathsToRecycle.push(targetPath);

                        const newFiles = vid.folderFiles.filter((_, i) => i !== curIdx);
                        const newIdx = Math.min(curIdx, newFiles.length - 1);
                        nextVideos.push({
                          ...vid,
                          folderFiles: newFiles,
                          currentIdx: newIdx,
                          url: newFiles[newIdx]?.url || vid.url,
                          realPath: newFiles[newIdx]?.path || vid.realPath,
                          title: newFiles[newIdx]?.name || vid.title
                        });
                      } else {
                        const targetPath = (vid.folderFiles && vid.currentIdx !== undefined)
                          ? (vid.folderFiles[vid.currentIdx]?.path || vid.folderFiles[vid.currentIdx]?.url)
                          : vid.realPath;
                        if (targetPath) pathsToRecycle.push(targetPath);
                      }
                    } else {
                      nextVideos.push(vid);
                    }
                  }

                  // 1. INSTANT UI UPDATE (0ms)
                  setVideos(nextVideos);
                  setSelectedIds(new Set());
                  setSelectionMode(false);

                  if (focusedWillBeDeleted) {
                    if (nextVideos.length > 0) {
                      setFocusedId(nextVideos[0].id);
                    } else {
                      setFocusedId(null);
                      setImmersive(false);
                      getCurrentWindow().setFullscreen(false);
                      setIsFS(false);
                    }
                  }

                  // 2. BACKGROUND ASYNC RECYCLE
                  (async () => {
                    let successCount = 0;
                    let failCount = 0;
                    for (const p of pathsToRecycle) {
                      try {
                        await invoke('recycle_unit', { path: p });
                        successCount++;
                      } catch {
                        failCount++;
                      }
                    }
                    if (successCount > 0) {
                      addLog(`Unit Annihilated (Recycle Bin): ${successCount} items`);
                      setToast(`🗑️ Moved ${successCount} file(s) to Recycle Bin`);
                      setTimeout(() => setToast(null), 3000);
                    }
                    if (failCount > 0) {
                      addLog(`Recycle failed for ${failCount} item(s)`);
                    }
                  })();
                } else {
                  if (!effectivePath) { addLog('Annihilation Error: Native path missing'); break; }
                  if (confirmDeletion) {
                    const yes = await showConfirm(`PROTOCOL: ANNIHILATE ASSET\n\nTarget: ${v.title}\n\nThis will physically MOVE THE FILE TO THE RECYCLE BIN.\nThis action is reversible via the OS Recycle Bin.\n\nPROCEED?`, { title: 'Recycle Bin', kind: 'error' });
                    if (!yes) break;
                  }

                  const targetPath = effectivePath;
                  const targetTitle = v.title;
                  const targetId = v.id;

                  // 1. INSTANT UI UPDATE (0ms)
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
                    setVideos(p => p.filter(x => x.id !== targetId));
                  }

                  // 2. BACKGROUND ASYNC RECYCLE
                  (async () => {
                    try {
                      await invoke('recycle_unit', { path: targetPath });
                      addLog(`Unit Annihilated (Recycle Bin): ${targetTitle}`);
                      setToast(`🗑️ Moved "${targetTitle}" to Recycle Bin`);
                      setTimeout(() => setToast(null), 3000);
                    } catch(e) {
                      addLog('Annihilation Failed: ' + e);
                    }
                  })();
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
                  
                  const targetIdSet = new Set(selectedIds);
                  const pathsToDelete: string[] = [];
                  let focusedWillBeDeleted = false;
                  const nextVideos: VideoItem[] = [];

                  for (const vid of videos) {
                    if (targetIdSet.has(vid.id)) {
                      if (vid.id === focusedId) focusedWillBeDeleted = true;

                      if (vid.folderFiles && vid.folderFiles.length > 1) {
                        const curIdx = vid.currentIdx || 0;
                        const targetPath = vid.folderFiles[curIdx]?.path || vid.folderFiles[curIdx]?.url;
                        if (targetPath) pathsToDelete.push(targetPath);

                        const newFiles = vid.folderFiles.filter((_, i) => i !== curIdx);
                        const newIdx = Math.min(curIdx, newFiles.length - 1);
                        nextVideos.push({
                          ...vid,
                          folderFiles: newFiles,
                          currentIdx: newIdx,
                          url: newFiles[newIdx]?.url || vid.url,
                          realPath: newFiles[newIdx]?.path || vid.realPath,
                          title: newFiles[newIdx]?.name || vid.title
                        });
                      } else {
                        const targetPath = (vid.folderFiles && vid.currentIdx !== undefined)
                          ? (vid.folderFiles[vid.currentIdx]?.path || vid.folderFiles[vid.currentIdx]?.url)
                          : vid.realPath;
                        if (targetPath) pathsToDelete.push(targetPath);
                      }
                    } else {
                      nextVideos.push(vid);
                    }
                  }

                  // 1. INSTANT UI UPDATE (0ms) — tiles vanish immediately
                  setVideos(nextVideos);
                  setSelectedIds(new Set());
                  setSelectionMode(false);

                  if (focusedWillBeDeleted) {
                    if (nextVideos.length > 0) {
                      setFocusedId(nextVideos[0].id);
                    } else {
                      setFocusedId(null);
                      setImmersive(false);
                      getCurrentWindow().setFullscreen(false);
                      setIsFS(false);
                    }
                  }

                  // 2. BACKGROUND ASYNC BATCH DELETION & TRIM
                  (async () => {
                    try {
                      const res = await invoke<{ success_count: number, fail_count: number }>('secure_delete_files_batch', { paths: pathsToDelete });
                      if (res.success_count > 0) {
                        addLog(`Units Securely Destroyed: ${res.success_count} item(s) (Storage trimmed)`);
                        setToast(`✓ All ${res.success_count} file(s) permanently destroyed & storage trimmed`);
                        setTimeout(() => setToast(null), 3500);
                      }
                      if (res.fail_count > 0) {
                        addLog(`Secure Destruction Failed for ${res.fail_count} item(s)`);
                      }
                    } catch (err) {
                      console.error("Batch secure delete error:", err);
                      addLog(`Secure Destruction Failed: ${err}`);
                    }
                  })();
                } else {
                  if (!effectivePath) { addLog('Secure Delete Error: Native path missing'); break; }
                  const yes = await showConfirm(
                    `⚠️ PROTOCOL: SECURE ASSET DESTRUCTION\n\nTarget: ${v.title}\n\nThis will OVERWRITE and PERMANENTLY DELETE the file from disk.\n\nThis action is completely IRREVERSIBLE. File cannot be recovered.\n\nPROCEED?`,
                    { title: 'Secure Delete', kind: 'error' }
                  );
                  if (!yes) break;
                  
                  const targetPath = effectivePath;
                  const targetTitle = v.title;
                  const targetId = v.id;

                  // 1. INSTANT UI UPDATE (0ms) — tile vanishes immediately
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
                    setVideos(p => p.filter(x => x.id !== targetId));
                  }

                  // 2. BACKGROUND ASYNC DELETION & TRIM
                  (async () => {
                    try {
                      await invoke('secure_delete_file', { path: targetPath });
                      addLog(`Unit Securely Destroyed: ${targetTitle}`);
                      setToast(`✓ "${targetTitle}" permanently destroyed & storage trimmed`);
                      setTimeout(() => setToast(null), 3500);
                    } catch(e) {
                      addLog('Secure Destruction Failed: ' + e);
                    }
                  })();
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
                      addLog(`Failed to save rotation: ${err}`);
                      setToast(`Rotation save failed: ${err}`);
                      setTimeout(() => setToast(null), 4000);
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
              case 'paste_image': {
                handlePasteImage(v.id);
                break;
              }
              case 'whatsapp_share': {
                useStore.getState().setWhatsAppShareTarget(v);
                break;
              }
              case 'share_file': {
                handleTriggerWifiShare([v]);
                break;
              }
              case 'share_selected': {
                const selectedItems = videos.filter(item => selectedIds.has(item.id));
                handleTriggerWifiShare(selectedItems.length > 0 ? selectedItems : [v]);
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
          onPurge={handlePurgeWorkspace}
          onSelectAll={handleSelectAll}
          onRefreshTiles={handleRefreshTiles}
          onPasteImage={() => handlePasteImage(null)}
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



      <MusicPlayerWidget videos={videos} setVideos={setVideos} />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectAction={(actionId) => {
          switch (actionId) {
            case 'whatsapp_share': {
              const target = (focusedId ? videos.find(v => v.id === focusedId) : null) || videos[0];
              if (target) useStore.getState().setWhatsAppShareTarget(target);
              break;
            }
            case 'wifi_share':
              handleTriggerWifiShare();
              break;
            case 'trim_crop_studio': {
              const target = (focusedId ? videos.find(v => v.id === focusedId) : null) || videos[0];
              if (target) useStore.getState().setTrimCropModalTarget(target);
              break;
            }
            case 'color_grading':
              if (videos.length > 0) setColorAdjustId(videos[0].id);
              break;
            case 'reshape_studio':
              if (videos.length > 0) setReshapeTarget(videos[0]);
              break;
            case 'portrait_blur':
              if (videos.length > 0) setPortraitBlurTarget(videos[0]);
              break;
            case 'frame_studio':
              setShowResizeModal(true);
              break;
            case 'export_video':
              setShowSaveCropOptions(true);
              break;
            case 'popout_player':
              if (videos.length > 0) togglePopout(videos[0].id);
              break;
            case 'purge_workspace':
              handlePurgeWorkspace();
              break;
            case 'music_player':
              setVolumeRepeatOpen(true);
              break;
            case 'help':
              setShowHelp(true);
              break;
          }
        }}
      />
      <ModalOrchestrator
        showHelp={showHelp}
        setShowHelp={setShowHelp}
        fileManageOpen={fileManageOpen}
        setFileManageOpen={setFileManageOpen}
        fileManageItems={fileManageItems}
        fileManageMode={fileManageMode}
        activeGridFolders={activeGridFolders}
        handleFileManagementSuccess={handleFileManagementSuccess}
        addLog={addLog}
        singleRenameTarget={singleRenameTarget}
        setSingleRenameTarget={setSingleRenameTarget}
        renameHistory={renameHistory}
        addToRenameHistory={addToRenameHistory}
        setVideos={setVideos}
        showSaveCropOptions={showSaveCropOptions}
        setShowSaveCropOptions={setShowSaveCropOptions}
        handleSaveCrop={handleSaveCrop}
        showSaveUpscaleOptions={showSaveUpscaleOptions}
        setShowSaveUpscaleOptions={setShowSaveUpscaleOptions}
        upscaleTarget={upscaleTarget}
        setUpscaleTarget={setUpscaleTarget}
        executeUpscale={executeUpscale}
        showResizeModal={showResizeModal}
        setShowResizeModal={setShowResizeModal}
        resizeTarget={resizeTarget}
        setResizeTarget={setResizeTarget}
        handleResizeSuccess={handleResizeSuccess}
        upscaleStatus={upscaleStatus}
        setUpscaleStatus={setUpscaleStatus}
        upscaleProgressPercent={upscaleProgressPercent}
        upscaleStage={upscaleStage}
        lastEnhancedTitle={lastEnhancedTitle}
        cancelEnhancement={cancelEnhancement}
        aiServerOffline={aiServerOffline}
        setAiServerOffline={setAiServerOffline}
        customConfirm={customConfirm}
        setCustomConfirm={setCustomConfirm}
        customPrompt={customPrompt}
        setCustomPrompt={setCustomPrompt}
        wifiShareOpen={wifiShareOpen}
        setWifiShareOpen={setWifiShareOpen}
        wifiShareItems={wifiShareItems}
        setWifiShareItems={setWifiShareItems}
        onClearSharedFiles={() => setWifiShareItems([])}
        handleIngestPaths={handleIngestPaths}
        volumeRepeatOpen={volumeRepeatOpen}
        setVolumeRepeatOpen={setVolumeRepeatOpen}
        globalVolume={globalVolume}
        setGlobalVolume={setGlobalVolume}
        masterMuted={masterMuted}
        toggleMasterMute={toggleMasterMute}
        globalRepeat={globalRepeat}
        setGlobalRepeat={setGlobalRepeat}
        videos={videos}
        handleUpdate={handleUpdate}
      />
    </main>
  );
}
