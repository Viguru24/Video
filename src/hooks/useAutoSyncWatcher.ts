import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { VideoItem } from '../types';
import { isTauri, normalizeMediaKey, isMediaAlreadyInWorkspace } from '../utils/videoUtils';

interface UseAutoSyncWatcherProps {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  autoSyncFolders: string[];
  handleIngestPaths: (paths: string[]) => Promise<void>;
  folderSwitchDelay?: number;
  addLog: (msg: string) => void;
}

export function useAutoSyncWatcher({
  videos,
  setVideos,
  autoSyncFolders,
  handleIngestPaths,
  addLog
}: UseAutoSyncWatcherProps) {
  const knownFolderFilesRef = useRef<Map<string, Set<string>>>(new Map());
  const pendingAutoAddRef = useRef<Set<string>>(new Set());
  const dirDebounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const videosRef = useRef<VideoItem[]>(videos);
  videosRef.current = videos;
  const autoSyncFoldersRef = useRef<string[]>(autoSyncFolders);
  autoSyncFoldersRef.current = autoSyncFolders;
  const handleIngestPathsRef = useRef(handleIngestPaths);
  handleIngestPathsRef.current = handleIngestPaths;
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
  }, [videos.length, setVideos]);

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

          const scanFolder = async (folderToScan: string, normKey: string, attempt = 0) => {
            if (!active) return;
            try {
              const result = await invoke<any[]>('list_directory_contents', { dirPath: folderToScan });
              const mediaFiles = result.filter(x => !x.is_dir && x.is_media);
              const readyFiles = mediaFiles.filter(x => !x.is_writing);
              const writingFiles = mediaFiles.filter(x => x.is_writing);
              const currentKnown = knownFolderFilesRef.current.get(normKey) || new Set<string>();

              // Find ONLY brand new incoming files that are ready and not already in workspace or known
              const newFiles = readyFiles.filter(f => {
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
                knownFolderFilesRef.current.set(normKey, currentKnown);

                if (pathsToIngest.length > 0) {
                  const folderName = folderToScan.split(/[\\/]/).pop() || "Folder";
                  addLogRef.current(`⚡ Auto-sync: Detected ${pathsToIngest.length} new file(s) in [${folderName}]. Ingesting...`);
                  await handleIngestPathsRef.current(pathsToIngest);
                }
              }

              // If files are still actively syncing/writing to disk, schedule a follow-up scan to ingest them once complete
              if (writingFiles.length > 0 && attempt < 20) {
                const followTimer = setTimeout(() => {
                  dirDebounceTimersRef.current.delete(normKey + '_pending');
                  scanFolder(folderToScan, normKey, attempt + 1);
                }, 1500);
                dirDebounceTimersRef.current.set(normKey + '_pending', followTimer);
              }
            } catch (e) {
              console.error("Multi-folder auto-sync scan failed:", e);
            }
          };

          const timer = setTimeout(() => {
            dirDebounceTimersRef.current.delete(normChanged);
            scanFolder(changedPath, normChanged, 0);
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

  return { pendingAutoAddRef };
}
