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
import { isValidVideoExtension, isValidPictureExtension, convertToVideoUrl, toCosmoUrl } from '../utils/videoUtils';

export function useWorkspacePersistence(addLog: (msg: string) => void, isPopout: boolean, masterMuted: boolean, masterPlaying: boolean) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [collections, setCollections] = useState<Record<string, VideoItem[]>>({});
  const [rotationInterval, setRotationInterval] = useState(10);
  const [snapshotDir, setSnapshotDir] = useState<string>('');
  const [theme, setTheme] = useState<string>('symphony');
  const [globalRepeat, setGlobalRepeat] = useState<RepeatMode>('none');
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
        let v = await invoke<string | null>('load_persistence', { key: 'cosmo-v2' });
        if (!v) v = await invoke<string | null>('load_persistence', { key: 'cosmo-video-v2' });
        if (!v) v = await invoke<string | null>('load_persistence', { key: 'cosmo-video' });

        let c = await invoke<string | null>('load_persistence', { key: 'cosmo-collections' });
        if (!c) c = await invoke<string | null>('load_persistence', { key: 'cosmo-video-collections' });

        const r = await invoke<string | null>('load_persistence', { key: 'cosmo-rot-int' });
        const s = await invoke<string | null>('load_persistence', { key: 'cosmo-snap-dir' });
        const t = await invoke<string | null>('load_persistence', { key: 'cosmo-theme' });
        const gr = await invoke<string | null>('load_persistence', { key: 'cosmo-repeat' });
        const cd = await invoke<string | null>('load_persistence', { key: 'cosmo-confirm-del' });

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
          if (s) setSnapshotDir(s);
          if (gr) setGlobalRepeat(gr as RepeatMode);
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
      invoke('save_persistence', { key: 'cosmo-v2', data: JSON.stringify(videos) }).catch(console.error);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [videos, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      invoke('save_persistence', { key: 'cosmo-collections', data: JSON.stringify(collections) }).catch(console.error);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [collections, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      invoke('save_persistence', { key: 'cosmo-rot-int', data: rotationInterval.toString() }).catch(console.error);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [rotationInterval, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current || !snapshotDir) return;
    const timer = setTimeout(() => {
      invoke('save_persistence', { key: 'cosmo-snap-dir', data: snapshotDir }).catch(console.error);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [snapshotDir, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      invoke('save_persistence', { key: 'cosmo-theme', data: theme }).catch(console.error);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [theme, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      invoke('save_persistence', { key: 'cosmo-repeat', data: globalRepeat }).catch(console.error);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [globalRepeat, isInitialized, isPopout]);

  useEffect(() => {
    if (!isInitialized || isPopout || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      invoke('save_persistence', { key: 'cosmo-confirm-del', data: confirmDeletion.toString() }).catch(console.error);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [confirmDeletion, isInitialized, isPopout]);

  return {
    videos, setVideos,
    collections, setCollections,
    rotationInterval, setRotationInterval,
    snapshotDir, setSnapshotDir,
    theme, setTheme,
    globalRepeat, setGlobalRepeat,
    confirmDeletion, setConfirmDeletion,
    isInitialized, setIsInitialized
  };
}
