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
import { isValidVideoExtension, isValidPictureExtension, convertToVideoUrl, toCosmoUrl, isTauri } from '../utils/videoUtils';
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

  // PERSISTENCE (Native) & BOOT GUARD
  useEffect(() => {
    if (isPopout) {
      setIsInitialized(true);
      return;
    }
    let mounted = true;
    const bootGuard = setTimeout(() => {
      if (mounted && !isInitialized) {
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
                    // MIGRATION: Convert to high-performance cosmo:// protocol
                    let updatedUrl = v.url;
                    if (v.realPath) {
                      updatedUrl = toCosmoUrl(v.realPath);
                    }
                    return { ...v, url: updatedUrl, muted: masterMuted, playing: masterPlaying };
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
                      let updatedUrl = v.url;
                      if (v.realPath) {
                        updatedUrl = toCosmoUrl(v.realPath);
                      }
                      return { ...v, url: updatedUrl };
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

          isLoadedRef.current = true;
          setIsInitialized(true);
          addLog("Mission Control Initialized");
          clearTimeout(bootGuard);
        }
      } catch (err) {
        console.error("Init Failure:", err);
        if (mounted) setIsInitialized(true);
      }
    }
    init();
    return () => { mounted = false; clearTimeout(bootGuard); };
  }, [addLog, isPopout]); // Removed masterMuted/masterPlaying from deps to avoid re-init on toggle

  // INDIVIDUAL DEBOUNCED PERSISTENCE
  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = JSON.stringify(videos);
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-v2', data: dataStr }).catch(console.error);
      } else {
        localStorage.setItem('cosmo-v2', dataStr);
      }
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [videos, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = JSON.stringify(collections);
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-collections', data: dataStr }).catch(console.error);
      } else {
        localStorage.setItem('cosmo-collections', dataStr);
      }
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [collections, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = rotationInterval.toString();
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-rot-int', data: dataStr }).catch(console.error);
      } else {
        localStorage.setItem('cosmo-rot-int', dataStr);
      }
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [rotationInterval, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current || !snapshotDir) return;
    const timer = setTimeout(() => {
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-snap-dir', data: snapshotDir }).catch(console.error);
      } else {
        localStorage.setItem('cosmo-snap-dir', snapshotDir);
      }
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [snapshotDir, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-theme', data: theme }).catch(console.error);
      } else {
        localStorage.setItem('cosmo-theme', theme);
      }
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [theme, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-repeat', data: globalRepeat }).catch(console.error);
      } else {
        localStorage.setItem('cosmo-repeat', globalRepeat);
      }
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [globalRepeat, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      const dataStr = confirmDeletion.toString();
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-confirm-del', data: dataStr }).catch(console.error);
      } else {
        localStorage.setItem('cosmo-confirm-del', dataStr);
      }
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [confirmDeletion, isInitialized, isPopout]);

  return {
    videos, setVideos,
    collections, setCollections,
    rotationInterval, setRotationInterval,
    snapshotDir, setSnapshotDir,
    confirmDeletion, setConfirmDeletion,
    isInitialized, setIsInitialized
  };
}
