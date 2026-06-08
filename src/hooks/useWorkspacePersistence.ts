/**
 * Workspace Persistence Hook
 * 
 * Manages application state persistence using Tauri's file system API.
 * Automatically saves and loads workspace state including videos, collections,
 * settings, and preferences.
 * 
 * Features:
 * - Auto-save with debouncing (PERSISTENCE_DEBOUNCE)
 * - Boot guard to ensure initialization
 * - Legacy data migration support
 * - Type-safe state management
 * 
 * @param addLog - Logging function for telemetry
 * @param isPopout - Whether this is a popout window
 * @param masterMuted - Master mute state
 * @param masterPlaying - Master play state
 * @returns Workspace state and setters
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem, RepeatMode } from '../types';
import { PERSISTENCE_DEBOUNCE } from '../constants';
import { isValidVideoExtension, isValidPictureExtension, convertToVideoUrl, toCosmoUrl, isTauri, toRealPath } from '../utils/videoUtils';
import { useStore } from '../store/useStore';

/** Strip null bytes and control characters from a persisted string. Returns empty string if the result is unusable. */
function sanitizePersistedString(s: string | null | undefined): string {
  if (!s) return '';
  // Remove null bytes (\x00) and other ASCII control characters
  const cleaned = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  return cleaned;
}

export function useWorkspacePersistence(addLog: (msg: string) => void, isPopout: boolean, masterMuted: boolean, masterPlaying: boolean) {
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
  const isLoadedRef = useRef(false);
  const hasLoadedRef = useRef(false);

  // PERSISTENCE (Native) & BOOT GUARD
  useEffect(() => {
    if (isPopout) {
      hasLoadedRef.current = true;
      setIsInitialized(true);
      return;
    }
    let mounted = true;
    const bootGuard = setTimeout(() => {
      if (mounted && !isInitialized) {
        isLoadedRef.current = true;
        setIsInitialized(true);
        addLog("Boot Guard Triggered: Forcing Initialization");
      }
    }, 3000);

    async function init() {
      try {
        let v: string | null = null;
        let c: string | null = null;
        let r: string | null = null;
        let s: string | null = null;
        let t: string | null = null;
        let gr: string | null = null;
        let cd: string | null = null;

        if (isTauri()) {
          v = await invoke<string | null>('load_persistence', { key: 'cosmo-v2' });
          if (!v) v = await invoke<string | null>('load_persistence', { key: 'cosmo-video-v2' });
          if (!v) v = await invoke<string | null>('load_persistence', { key: 'cosmo-video' });

          c = await invoke<string | null>('load_persistence', { key: 'cosmo-collections' });
          if (!c) c = await invoke<string | null>('load_persistence', { key: 'cosmo-video-collections' });

          // Double-redundancy: fall back to localStorage if Tauri files are empty/corrupted
          if (!v) v = localStorage.getItem('cosmo-v2') || localStorage.getItem('cosmo-video-v2') || localStorage.getItem('cosmo-video');
          if (!c) c = localStorage.getItem('cosmo-collections') || localStorage.getItem('cosmo-video-collections');

          r = await invoke<string | null>('load_persistence', { key: 'cosmo-rot-int' });
          s = await invoke<string | null>('load_persistence', { key: 'cosmo-snap-dir' });
          t = await invoke<string | null>('load_persistence', { key: 'cosmo-theme' });
          gr = await invoke<string | null>('load_persistence', { key: 'cosmo-repeat' });
          cd = await invoke<string | null>('load_persistence', { key: 'cosmo-confirm-del' });
        } else {
          v = localStorage.getItem('cosmo-v2') || localStorage.getItem('cosmo-video-v2') || localStorage.getItem('cosmo-video');
          c = localStorage.getItem('cosmo-collections') || localStorage.getItem('cosmo-video-collections');
          r = localStorage.getItem('cosmo-rot-int');
          s = localStorage.getItem('cosmo-snap-dir');
          t = localStorage.getItem('cosmo-theme');
          gr = localStorage.getItem('cosmo-repeat');
          cd = localStorage.getItem('cosmo-confirm-del');
        }

        if (mounted) {
          if (t) setTheme(t);
          if (v) {
            try {
              const parsed = JSON.parse(v);
              if (Array.isArray(parsed)) {
                  const filteredVids = parsed.filter(v => {
                    const path = v.realPath || v.url;
                    return isValidVideoExtension(path) || isValidPictureExtension(path);
                  }).map(v => {
                    // MIGRATION: Convert to high-performance cosmo:// protocol and upgrade realPath
                    const cleanPath = toRealPath(v.realPath) || toRealPath(v.url) || v.realPath || v.url;
                    const updatedUrl = toCosmoUrl(cleanPath);
                    const updatedRealPath = toRealPath(cleanPath) || cleanPath;

                    let updatedFolderFiles = v.folderFiles;
                    if (Array.isArray(v.folderFiles)) {
                      updatedFolderFiles = v.folderFiles.map((ff: any) => {
                        const ffPath = toRealPath(ff.path) || toRealPath(ff.url) || ff.path || ff.url;
                        return {
                          ...ff,
                          url: toCosmoUrl(ffPath),
                          path: toRealPath(ffPath) || ffPath
                        };
                      });
                    }

                    return { 
                      ...v, 
                      url: updatedUrl, 
                      realPath: updatedRealPath,
                      folderFiles: updatedFolderFiles,
                      muted: masterMuted, 
                      playing: masterPlaying 
                    };
                  });
                setVideos(filteredVids);
              } else {
                setVideos([]);
              }
            } catch { setVideos([]); }
          }
          if (c) {
            try {
              const parsed = JSON.parse(c);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
                // MIGRATION: Convert to high-performance cosmo:// protocol
                const migrated = Object.entries(parsed).reduce((acc, [name, items]) => {
                  if (Array.isArray(items)) {
                    acc[name] = items.map(v => {
                      const cleanPath = toRealPath(v.realPath) || toRealPath(v.url) || v.realPath || v.url;
                      const updatedUrl = toCosmoUrl(cleanPath);
                      const updatedRealPath = toRealPath(cleanPath) || cleanPath;

                      let updatedFolderFiles = v.folderFiles;
                      if (Array.isArray(v.folderFiles)) {
                        updatedFolderFiles = v.folderFiles.map((ff: any) => {
                          const ffPath = toRealPath(ff.path) || toRealPath(ff.url) || ff.path || ff.url;
                          return {
                            ...ff,
                            url: toCosmoUrl(ffPath),
                            path: toRealPath(ffPath) || ffPath
                          };
                        });
                      }

                      return { 
                        ...v, 
                        url: updatedUrl, 
                        realPath: updatedRealPath,
                        folderFiles: updatedFolderFiles
                      };
                    });
                  }
                  return acc;
                }, {} as Record<string, VideoItem[]>);
                setCollections(migrated);
              } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                // Was an empty object, preserve it
                setCollections({});
              } else {
                setCollections({ "Cinematic Symphony": [] });
              }
            } catch { setCollections({ "Cinematic Symphony": [] }); }
          } else {
            setCollections({ "Cinematic Symphony": [] });
          }
          if (r) setRotationInterval(parseInt(r) || 10);
          const cleanSnapDir = sanitizePersistedString(s);
          if (cleanSnapDir) setSnapshotDir(cleanSnapDir);
          if (gr) setGlobalRepeat(sanitizePersistedString(gr) as RepeatMode);
          if (cd) setConfirmDeletion(cd === 'true');

          hasLoadedRef.current = true;
          isLoadedRef.current = true;
          setIsInitialized(true);
          addLog("Mission Control Initialized");
          clearTimeout(bootGuard);
        }
      } catch (err) {
        console.error("Init Failure:", err);
        if (mounted) {
          hasLoadedRef.current = true;
          isLoadedRef.current = true;
          setIsInitialized(true);
        }
      }
    }
    init();
    return () => { mounted = false; clearTimeout(bootGuard); };
  }, [addLog, isPopout]); // Removed masterMuted/masterPlaying from deps to avoid re-init on toggle

  // INDIVIDUAL DEBOUNCED PERSISTENCE (Multi-layer: writes to both disk and localStorage in Tauri)
  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current || !hasLoadedRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = JSON.stringify(videos);
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-v2', data: dataStr }).catch(console.error);
      }
      localStorage.setItem('cosmo-v2', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [videos, isInitialized, isPopout]);

  // INSTANT PERSISTENCE FOR COLLECTIONS (No debounce, user manual actions, saves to both disk and localStorage)
  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current || !hasLoadedRef.current) return;
    const dataStr = JSON.stringify(collections);
    if (isTauri()) {
      invoke('save_persistence', { key: 'cosmo-collections', data: dataStr }).catch(console.error);
    }
    localStorage.setItem('cosmo-collections', dataStr);
  }, [collections, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current || !hasLoadedRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = rotationInterval.toString();
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-rot-int', data: dataStr }).catch(console.error);
      }
      localStorage.setItem('cosmo-rot-int', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [rotationInterval, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current || !hasLoadedRef.current || !snapshotDir) return;
    const timer = setTimeout(() => {
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-snap-dir', data: snapshotDir }).catch(console.error);
      }
      localStorage.setItem('cosmo-snap-dir', snapshotDir);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [snapshotDir, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current || !hasLoadedRef.current) return;
    const timer = setTimeout(() => {
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-theme', data: theme }).catch(console.error);
      }
      localStorage.setItem('cosmo-theme', theme);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [theme, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current || !hasLoadedRef.current) return;
    const timer = setTimeout(() => {
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-repeat', data: globalRepeat }).catch(console.error);
      }
      localStorage.setItem('cosmo-repeat', globalRepeat);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [globalRepeat, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current || !hasLoadedRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = confirmDeletion.toString();
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-confirm-del', data: dataStr }).catch(console.error);
      }
      localStorage.setItem('cosmo-confirm-del', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [confirmDeletion, isInitialized, isPopout]);

  // EMERGENCY BACKUP SAVE ON WINDOW UNLOAD
  useEffect(() => {
    if (isPopout) return;
    const handleBeforeUnload = () => {
      if (isLoadedRef.current && isInitialized) {
        const videosStr = JSON.stringify(videos);
        const collectionsStr = JSON.stringify(collections);
        localStorage.setItem('cosmo-v2', videosStr);
        localStorage.setItem('cosmo-collections', collectionsStr);
        localStorage.setItem('cosmo-rot-int', rotationInterval.toString());
        if (snapshotDir) localStorage.setItem('cosmo-snap-dir', snapshotDir);
        localStorage.setItem('cosmo-theme', theme);
        localStorage.setItem('cosmo-repeat', globalRepeat);
        localStorage.setItem('cosmo-confirm-del', confirmDeletion.toString());

        if (isTauri()) {
          // Fire-and-forget native disk saves before Webview is destroyed
          invoke('save_persistence', { key: 'cosmo-v2', data: videosStr }).catch(() => {});
          invoke('save_persistence', { key: 'cosmo-collections', data: collectionsStr }).catch(() => {});
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [videos, collections, rotationInterval, snapshotDir, theme, globalRepeat, confirmDeletion, isInitialized]);

  return {
    videos, setVideos,
    collections, setCollections,
    rotationInterval, setRotationInterval,
    snapshotDir, setSnapshotDir,
    confirmDeletion, setConfirmDeletion,
    isInitialized, setIsInitialized
  };
}
