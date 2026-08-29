/**
 * Workspace Persistence Hook
 *
 * Manages application state persistence using Tauri's file system API.
 * Automatically saves and loads workspace state including videos, collections,
 * settings, and preferences.
 *
 * Features:
 * - Auto-save with debouncing (PERSISTENCE_DEBOUNCE)
 * - Single readyToSaveRef gate: only opens after full init completes
 * - Legacy data migration support
 * - Type-safe state management
 *
 * @param addLog - Logging function for telemetry
 * @param isPopout - Whether this is a popout window
 * @param masterMuted - Master mute state
 * @param masterPlaying - Master play state
 * @returns Workspace state and setters
 */
import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import type { VideoItem, RepeatMode } from '../types';
import { PERSISTENCE_DEBOUNCE } from '../constants';
import {
  isValidVideoExtension, isValidPictureExtension,
  toCosmoUrl, isTauri, toRealPath, safeSetLocalStorage
} from '../utils/videoUtils';
import { useStore } from '../store/useStore';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** Strip null bytes and control characters from a persisted string. */
function sanitizePersistedString(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

export function cleanVideosForPersistence(
  vids: VideoItem[],
  opts?: { keepPictures?: boolean }
): VideoItem[] {
  return vids.map(v => {
      const isFolderType = v.repeatMode === 'folder' || !!v.folderPath ||
        (Array.isArray(v.folderFiles) && v.folderFiles.length > 0);
      
      const cleaned: any = {
        id: v.id,
        url: v.url,
        title: v.title
      };

      if (v.realPath && v.realPath !== v.url) cleaned.realPath = v.realPath;
      if (v.repeatMode && v.repeatMode !== 'none') cleaned.repeatMode = v.repeatMode;
      if (v.repeatCount && v.repeatCount !== 0) cleaned.repeatCount = v.repeatCount;
      if (v.cols && v.cols !== 1) cleaned.cols = v.cols;
      if (v.playing) cleaned.playing = true;
      if (v.muted === false) cleaned.muted = false;
      if (v.currentIdx && v.currentIdx !== 0) cleaned.currentIdx = v.currentIdx;
      if (v.folderPath) cleaned.folderPath = v.folderPath;
      if (v.folderMode) cleaned.folderMode = v.folderMode;
      if (v.created) cleaned.created = v.created;
      if (v.modified) cleaned.modified = v.modified;
      if (v.rotation) cleaned.rotation = v.rotation;
      if (v.flipped) cleaned.flipped = v.flipped;
      if (v.currentTime && v.currentTime !== 0) cleaned.currentTime = v.currentTime;
      if (v.colorFilters) cleaned.colorFilters = v.colorFilters;

      if (isFolderType) {
        let inferredFolderPath = v.folderPath;
        if (!inferredFolderPath && (v.realPath || v.url)) {
          const path = v.realPath || v.url;
          const sep = path.includes('\\') ? '\\' : '/';
          const lastIdx = path.lastIndexOf(sep);
          if (lastIdx !== -1) inferredFolderPath = path.substring(0, lastIdx);
        }
        const isPictureFolder =
          v.folderMode === 'picture' ||
          (v.folderFiles && v.folderFiles.some(f => isValidPictureExtension(f.path)));
        cleaned.folderFiles = [];
        cleaned.folderPath = inferredFolderPath;
        cleaned.folderMode = v.folderMode || (isPictureFolder ? 'picture' : 'video');
        if (isPictureFolder) {
          cleaned.url = '';
          cleaned.realPath = '';
          if (/\.(jpg|jpeg|png|gif|webp)$/i.test(v.title)) {
            cleaned.title = 'Image Folder';
          }
        }
        cleaned.currentIdx = 0;
      }
      return cleaned;
    });
}

export function cleanCollectionsForPersistence(
  colls: Record<string, VideoItem[]>
): Record<string, VideoItem[]> {
  const result: Record<string, VideoItem[]> = {};
  for (const [name, vids] of Object.entries(colls)) {
    // Collections are explicitly saved by the user — preserve ALL tile types
    // (including pictures). Only strip folderFiles arrays to reduce file size.
    result[name] = cleanVideosForPersistence(vids, { keepPictures: true });
  }
  return result;
}

/** Deserialise one saved VideoItem, fixing up cosmo:// URLs and restoring default properties. */
function hydrateItem(item: any): VideoItem {
  const cleanPath =
    toRealPath(item.realPath) || toRealPath(item.url) || item.realPath || item.url;
  const updatedUrl = toCosmoUrl(cleanPath);
  const updatedRealPath = toRealPath(cleanPath) || cleanPath;

  let updatedFolderFiles = item.folderFiles;
  if (Array.isArray(item.folderFiles)) {
    updatedFolderFiles = item.folderFiles.map((ff: any) => {
      const ffPath = toRealPath(ff.path) || toRealPath(ff.url) || ff.path || ff.url;
      return { ...ff, url: toCosmoUrl(ffPath), path: toRealPath(ffPath) || ffPath };
    });
  }
  return {
    repeatMode: 'none',
    repeatCount: 0,
    cols: 1,
    playing: false,
    muted: true,
    ...item,
    url: updatedUrl,
    realPath: updatedRealPath,
    folderFiles: updatedFolderFiles
  };
}

export function useWorkspacePersistence(
  addLog: (msg: string) => void,
  isPopout: boolean,
  masterMuted: boolean,
  masterPlaying: boolean
) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [collections, setCollections] = useState<Record<string, VideoItem[]>>({});
  const [rotationInterval, setRotationInterval] = useState(10);
  const [snapshotDir, setSnapshotDir] = useState<string>('');
  const theme = useStore(state => state.theme);
  const setTheme = useStore(state => state.setTheme);
  const globalRepeat = useStore(state => state.globalRepeat);
  const setGlobalRepeat = useStore(state => state.setGlobalRepeat);
  const [confirmDeletion, setConfirmDeletion] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Single gate ref. Only becomes true after the full init() Promise resolves
   * (or the boot guard fires). Nothing will be written to disk/localStorage
   * until this is true, preventing boot-time overwrites.
   */
  const readyToSaveRef = useRef(false);

  // Keep a ref to the latest state values to avoid stale closures on beforeunload
  const stateRef = useRef({
    videos,
    collections,
    rotationInterval,
    snapshotDir,
    theme,
    globalRepeat,
    confirmDeletion
  });

  useEffect(() => {
    stateRef.current = {
      videos,
      collections,
      rotationInterval,
      snapshotDir,
      theme,
      globalRepeat,
      confirmDeletion
    };
  }, [videos, collections, rotationInterval, snapshotDir, theme, globalRepeat, confirmDeletion]);

  // ─── BOOT: LOAD PERSISTENCE ─────────────────────────────────────────────────
  useEffect(() => {
    if (isPopout) {
      readyToSaveRef.current = true;
      setIsInitialized(true);
      return;
    }

    let mounted = true;

    // Safety net: if init hangs for >5 s, open the save gate anyway
    const bootGuard = setTimeout(() => {
      if (mounted && !readyToSaveRef.current) {
        readyToSaveRef.current = true;
        setIsInitialized(true);
        addLog('Boot Guard Triggered: Forcing Initialization');
      }
    }, 5000);

    async function init() {
      try {
        // ── Read raw strings ──────────────────────────────────────────────
        let v: string | null = null;
        let c: string | null = null;
        let r: string | null = null;
        let s: string | null = null;
        let t: string | null = null;
        let gr: string | null = null;
        let cd: string | null = null;

        if (isTauri()) {
          try {
            const { appDataDir } = await import('@tauri-apps/api/path');
            const dir = await appDataDir();
            localStorage.setItem('cosmo-app-data-dir', dir);
          } catch (err) {
            console.error("Failed to pre-resolve appDataDir:", err);
          }

          v = await invoke<string | null>('load_persistence', { key: 'cosmo-v2' });
          if (!v) v = await invoke<string | null>('load_persistence', { key: 'cosmo-video-v2' });
          if (!v) v = await invoke<string | null>('load_persistence', { key: 'cosmo-video' });

          c = await invoke<string | null>('load_persistence', { key: 'cosmo-collections' });
          if (!c) c = await invoke<string | null>('load_persistence', { key: 'cosmo-video-collections' });

          // Double-redundancy: fall back to localStorage if Tauri files are empty
          if (!v) v = localStorage.getItem('cosmo-v2') || localStorage.getItem('cosmo-video-v2') || localStorage.getItem('cosmo-video');
          if (!c) c = localStorage.getItem('cosmo-collections') || localStorage.getItem('cosmo-video-collections');

          r  = await invoke<string | null>('load_persistence', { key: 'cosmo-rot-int' });
          s  = await invoke<string | null>('load_persistence', { key: 'cosmo-snap-dir' });
          t  = await invoke<string | null>('load_persistence', { key: 'cosmo-theme' });
          gr = await invoke<string | null>('load_persistence', { key: 'cosmo-repeat' });
          cd = await invoke<string | null>('load_persistence', { key: 'cosmo-confirm-del' });
        } else {
          v  = localStorage.getItem('cosmo-v2') || localStorage.getItem('cosmo-video-v2') || localStorage.getItem('cosmo-video');
          c  = localStorage.getItem('cosmo-collections') || localStorage.getItem('cosmo-video-collections');
          r  = localStorage.getItem('cosmo-rot-int');
          s  = localStorage.getItem('cosmo-snap-dir');
          t  = localStorage.getItem('cosmo-theme');
          gr = localStorage.getItem('cosmo-repeat');
          cd = localStorage.getItem('cosmo-confirm-del');
        }

        if (!mounted) return;

        // ── Apply scalar settings ─────────────────────────────────────────
        if (t)  setTheme(t);
        if (r)  setRotationInterval(parseInt(r) || 10);
        const cleanSnapDir = sanitizePersistedString(s);
        if (cleanSnapDir) setSnapshotDir(cleanSnapDir);
        if (gr) setGlobalRepeat(sanitizePersistedString(gr) as RepeatMode);
        if (cd) setConfirmDeletion(cd === 'true');

        // ── Enforce Demo Symphony Workspace Collection ────────────────────
        const defaultDemoItems: VideoItem[] = [
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
        
        let loadedCollections: Record<string, VideoItem[]> = {
          "Demo Symphony": defaultDemoItems
        };
        if (c) {
          try {
            const parsed = JSON.parse(c);
            if (parsed && typeof parsed === 'object') {
              const hydrated: Record<string, VideoItem[]> = {};
              for (const [name, list] of Object.entries(parsed)) {
                if (Array.isArray(list)) {
                  hydrated[name] = list.map(item => hydrateItem(item));
                }
              }
              loadedCollections = {
                ...loadedCollections,
                ...hydrated,
                "Demo Symphony": defaultDemoItems // Enforce default demo set is always present
              };
            }
          } catch (err) {
            console.error('Failed to parse collections json:', err);
          }
        }
        setCollections(loadedCollections);

        // ── Parse videos, then scan their folders ─────────────────────────
        let initialVids: VideoItem[] = [];
        if (v) {
          try {
            const parsed = JSON.parse(v);
            if (Array.isArray(parsed)) {
              initialVids = parsed
                .filter(item => {
                  if (item.repeatMode === 'folder' || item.folderPath) return true;
                  const path = item.realPath || item.url;
                  return isValidVideoExtension(path) || isValidPictureExtension(path);
                })
                .map(item => ({
                  ...hydrateItem(item),
                  muted: masterMuted,
                  playing: masterPlaying,
                }));
            }
          } catch (err) {
            console.error('Failed to parse videos json:', err);
          }
        }

        if (initialVids.length === 0) {
          initialVids = defaultDemoItems.map(item => ({
            ...item,
            muted: masterMuted,
            playing: masterPlaying,
          }));
        }

        if (!mounted) return;

        setVideos(initialVids);

        // ── Open the save gate NOW, after all data is loaded ──────────────
        readyToSaveRef.current = true;
        setIsInitialized(true);
        clearTimeout(bootGuard);
        addLog('Mission Control Initialized');

        // Now, asynchronously scan folders in the background without blocking the UI boot!
        initialVids.forEach(async (item) => {
          if ((item.repeatMode === 'folder' || item.folderPath) && item.folderPath) {
            try {
              const scanned = await invoke<{ name: string; url: string }[]>(
                'get_folder_videos',
                { path: item.folderPath, mode: item.folderMode || 'all' }
              );
              if (scanned && scanned.length > 0 && mounted) {
                scanned.sort((a, b) =>
                  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                );
                const folderWithUrls = scanned.map(fi => ({
                  name: fi.name,
                  url: toCosmoUrl(fi.url),
                  path: fi.url,
                }));
                // Update this specific video item in the state
                setVideos(prev => prev.map(v => v.id === item.id ? {
                  ...v,
                  folderFiles: folderWithUrls,
                  url: toCosmoUrl(scanned[0].url),
                  realPath: scanned[0].url,
                  title: scanned[0].name,
                } : v));
              }
            } catch (err) {
              console.error(`Failed to scan folder asynchronously: ${item.folderPath}`, err);
            }
          }
        });
      } catch (err) {
        console.error('Init Failure:', err);
        if (mounted) {
          readyToSaveRef.current = true;
          setIsInitialized(true);
          clearTimeout(bootGuard);
        }
      }
    }

    init();
    return () => {
      mounted = false;
      clearTimeout(bootGuard);
    };
  }, [addLog, isPopout]); // intentionally omit masterMuted/masterPlaying to avoid re-init on toggle

  // ─── SAVE: ACTIVE WORKSPACE ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized || isPopout || !readyToSaveRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = JSON.stringify(cleanVideosForPersistence(videos));
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-v2', data: dataStr }).catch(console.error);
        emit('workspace-changed', { key: 'cosmo-v2', data: dataStr }).catch(console.error);
      }
      safeSetLocalStorage('cosmo-v2', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [videos, isInitialized, isPopout]);

  // ─── SAVE: COLLECTIONS (debounced to avoid spurious boot writes) ─────────────
  useEffect(() => {
    if (!isInitialized || isPopout || !readyToSaveRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = JSON.stringify(cleanCollectionsForPersistence(collections));
      if (isTauri()) invoke('save_persistence', { key: 'cosmo-collections', data: dataStr }).catch(console.error);
      safeSetLocalStorage('cosmo-collections', dataStr);
    }, 300); // short debounce — fast enough for manual saves, long enough to skip boot noise
    return () => clearTimeout(timer);
  }, [collections, isInitialized, isPopout]);

  // ─── SAVE: ROTATION INTERVAL ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized || isPopout || !readyToSaveRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = rotationInterval.toString();
      if (isTauri()) invoke('save_persistence', { key: 'cosmo-rot-int', data: dataStr }).catch(console.error);
      localStorage.setItem('cosmo-rot-int', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [rotationInterval, isInitialized, isPopout]);

  // ─── SAVE: SNAPSHOT DIR ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized || isPopout || !readyToSaveRef.current || !snapshotDir) return;
    const timer = setTimeout(() => {
      if (isTauri()) invoke('save_persistence', { key: 'cosmo-snap-dir', data: snapshotDir }).catch(console.error);
      localStorage.setItem('cosmo-snap-dir', snapshotDir);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [snapshotDir, isInitialized, isPopout]);

  // ─── SAVE: THEME ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized || isPopout || !readyToSaveRef.current) return;
    const timer = setTimeout(() => {
      if (isTauri()) invoke('save_persistence', { key: 'cosmo-theme', data: theme }).catch(console.error);
      localStorage.setItem('cosmo-theme', theme);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [theme, isInitialized, isPopout]);

  // ─── SAVE: GLOBAL REPEAT ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized || isPopout || !readyToSaveRef.current) return;
    const timer = setTimeout(() => {
      if (isTauri()) invoke('save_persistence', { key: 'cosmo-repeat', data: globalRepeat }).catch(console.error);
      localStorage.setItem('cosmo-repeat', globalRepeat);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [globalRepeat, isInitialized, isPopout]);

  // ─── SAVE: CONFIRM DELETION ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized || isPopout || !readyToSaveRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = confirmDeletion.toString();
      if (isTauri()) invoke('save_persistence', { key: 'cosmo-confirm-del', data: dataStr }).catch(console.error);
      localStorage.setItem('cosmo-confirm-del', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [confirmDeletion, isInitialized, isPopout]);

  // ─── SAVE ON CLOSE (Tauri onCloseRequested — more reliable than beforeunload) ─
  useEffect(() => {
    if (isPopout || !isTauri()) return;

    let unlisten: (() => void) | null = null;
    let isClosing = false; // prevent re-entrant close (taskbar + X simultaneously)

    const setup = async () => {
      try {
        // Cache window handle at setup time — safer than calling inside handler
        const appWindow = getCurrentWindow();

        unlisten = await appWindow.onCloseRequested(async (event) => {
          event.preventDefault();

          // Guard: if we're already running the close sequence, bail
          if (isClosing) return;
          isClosing = true;

          try {
            if (readyToSaveRef.current) {
              const {
                videos: curVideos,
                collections: curCollections,
                rotationInterval: curRot,
                snapshotDir: curSnap,
                theme: curTheme,
                globalRepeat: curRepeat,
                confirmDeletion: curConfirm
              } = stateRef.current;

              const videosStr      = JSON.stringify(cleanVideosForPersistence(curVideos));
              const collectionsStr = JSON.stringify(cleanCollectionsForPersistence(curCollections));

              // Safe localStorage writes
              safeSetLocalStorage('cosmo-v2',          videosStr);
              safeSetLocalStorage('cosmo-collections', collectionsStr);
              localStorage.setItem('cosmo-rot-int',     curRot.toString());
              if (curSnap) localStorage.setItem('cosmo-snap-dir', curSnap);
              localStorage.setItem('cosmo-theme',       curTheme);
              localStorage.setItem('cosmo-repeat',      curRepeat);
              localStorage.setItem('cosmo-confirm-del', curConfirm.toString());

              // Tauri IPC saves with a hard 2s timeout.
              // If the Rust backend is dead/hanging (common during taskbar close),
              // we still close the window instead of freezing forever.
              const tauriSaves = Promise.allSettled([
                invoke('save_persistence', { key: 'cosmo-v2',          data: videosStr      }),
                invoke('save_persistence', { key: 'cosmo-collections', data: collectionsStr }),
              ]);
              await Promise.race([
                tauriSaves,
                new Promise(resolve => setTimeout(resolve, 2000)),
              ]);
            }
          } catch (saveErr) {
            console.error('Save-on-close error (will still close):', saveErr);
          } finally {
            // ALWAYS close the window — no matter what happened above
            try {
              await appWindow.destroy();
            } catch {
              // Last resort if destroy() itself fails
              window.close();
            }
          }
        });
      } catch (err) {
        console.error('Failed to register onCloseRequested:', err);
      }
    };

    setup();
    return () => { if (unlisten) unlisten(); };
  }, [isPopout]);

  // ─── FALLBACK: beforeunload for non-Tauri / web mode ─────────────────────────
  useEffect(() => {
    if (isPopout || isTauri()) return; // Tauri uses onCloseRequested above
    const handleBeforeUnload = () => {
      if (!readyToSaveRef.current) return;
      const {
        videos: curVideos,
        collections: curCollections,
        rotationInterval: curRot,
        snapshotDir: curSnap,
        theme: curTheme,
        globalRepeat: curRepeat,
        confirmDeletion: curConfirm
      } = stateRef.current;
      const videosStr      = JSON.stringify(cleanVideosForPersistence(curVideos));
      const collectionsStr = JSON.stringify(cleanCollectionsForPersistence(curCollections));
      safeSetLocalStorage('cosmo-v2',          videosStr);
      safeSetLocalStorage('cosmo-collections', collectionsStr);
      localStorage.setItem('cosmo-rot-int',     curRot.toString());
      if (curSnap) localStorage.setItem('cosmo-snap-dir', curSnap);
      localStorage.setItem('cosmo-theme',       curTheme);
      localStorage.setItem('cosmo-repeat',      curRepeat);
      localStorage.setItem('cosmo-confirm-del', curConfirm.toString());
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPopout]);

  return {
    videos, setVideos,
    collections, setCollections,
    rotationInterval, setRotationInterval,
    snapshotDir, setSnapshotDir,
    confirmDeletion, setConfirmDeletion,
    isInitialized, setIsInitialized,
  };
}
