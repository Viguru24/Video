import React, { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import type { VideoItem } from '../types';
import { 
  showConfirm, 
  toCosmoUrl, 
  pathsEqual, 
  isTauri, 
  safeSetLocalStorage 
} from '../utils/videoUtils';

interface UseWorkspaceMediaOpsParams {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  filtered: VideoItem[];
  confirmDeletion: boolean;
  fileManageMode: 'move' | 'copy';
  metadataCache: React.MutableRefObject<Record<string, any>>;
  exitSoloMode: () => Promise<void>;
  clearPendingAutoAdd: () => void;
  setColorAdjustId: (id: string | null) => void;
  addLog: (m: string) => void;
  setToast: (m: string | null) => void;
}

export function useWorkspaceMediaOps({
  videos,
  setVideos,
  selectedIds,
  setSelectedIds,
  setSelectionMode,
  focusedId,
  setFocusedId,
  filtered,
  confirmDeletion,
  fileManageMode,
  metadataCache,
  exitSoloMode,
  clearPendingAutoAdd,
  setColorAdjustId,
  addLog,
  setToast,
}: UseWorkspaceMediaOpsParams) {
  const handleDecommission = useCallback(async (id: string) => {
    if (confirmDeletion) {
      const yes = await showConfirm(
        "Remove this item from your grid?\n\nThis removes the view shortcut, but the physical file on your hard drive will NOT be affected.\n\nProceed?",
        { title: 'Remove from Grid', kind: 'warning' }
      );
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
  }, [setVideos, addLog, confirmDeletion, focusedId, filtered, exitSoloMode, setFocusedId]);

  const handlePurgeWorkspace = useCallback(async () => {
    const yes = await showConfirm('Purge Workspace? This will clear all cards from your grid.', { title: 'Purge Workspace', kind: 'error' });
    if (!yes) return;
    setVideos([]);
    setSelectedIds(new Set());
    setFocusedId(null);
    setColorAdjustId(null);
    clearPendingAutoAdd();
    localStorage.setItem('cosmo-purged', 'true');
    const dataStr = JSON.stringify([]);
    if (isTauri()) {
      invoke('save_persistence', { key: 'cosmo-v2', data: dataStr }).catch(() => {});
      emit('workspace-changed', { key: 'cosmo-v2', data: dataStr }).catch(() => {});
    }
    safeSetLocalStorage('cosmo-v2', dataStr);
    addLog('SYSTEM: Workspace purged.');
  }, [addLog, setVideos, setSelectedIds, setFocusedId, setColorAdjustId, clearPendingAutoAdd]);

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
                // Update playlist files immediately
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

                // Transition tile display if new files are detected
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
                    addLog(`Folder Sync: Switched tile [${vid.title}] to newly added file "${newestFile.name}"`);
                  }, 5000);
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

  const handleAnnihilate = useCallback(async (id: string, bypassConfirm = false) => {
    const video = videos.find(v => v.id === id);
    if (!video || !video.realPath) {
      addLog("Annihilation Error: Native path missing");
      return;
    }

    if (confirmDeletion && !bypassConfirm) {
      const yes = await showConfirm(
        `PROTOCOL: ANNIHILATE ASSET\n\nTarget: ${video.title}\n\nThis will physically MOVE THE FILE TO THE RECYCLE BIN.\nThis action is reversible via the OS Recycle Bin, but the file will be gone from disk.\n\nPROCEED WITH DESTRUCTION?`,
        { title: 'Recycle Bin', kind: 'error' }
      );
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
  }, [videos, setVideos, addLog, confirmDeletion, focusedId, filtered, exitSoloMode, setFocusedId]);

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
  }, [fileManageMode, videos, metadataCache, addLog, setVideos, setToast, setSelectedIds, setSelectionMode]);

  const handleBatchRemove = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (confirmDeletion) {
      const yes = await showConfirm(
        `Remove ${selectedIds.size} items from your grid?\n\nThis removes the view shortcuts, but the physical files on your hard drive will NOT be affected.\n\nProceed?`,
        { title: 'Remove Selection', kind: 'warning' }
      );
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

  return {
    handleDecommission,
    handlePurgeWorkspace,
    handleRefreshTiles,
    handleAnnihilate,
    handleFileManagementSuccess,
    handleBatchRemove,
    handleBatchMute,
    handleBatchPlay,
  };
}
