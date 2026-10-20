import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../store/useStore';
import type { VideoItem } from '../types';
import { 
  triggerPopOut, 
  isValidPictureExtension, 
  toCosmoUrl, 
  toRealPath 
} from '../utils/videoUtils';

interface UseContextMenuActionsProps {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  toggleSelect: (id: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectionMode: (val: boolean) => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  setIsCropping: (val: boolean) => void;
  setCropBox: (box: any) => void;
  setAspectRatio: (ar: any) => void;
  handleResize: (v: VideoItem) => void;
  handleNavigateSibling: (dir: 1 | -1) => void;
  handleCreateSticker: (v: VideoItem) => void;
  handleDecommission: (id: string) => void;
  setSingleRenameTarget: (v: VideoItem | null) => void;
  setColorAdjustId: (id: string | null) => void;
  handleTriggerWifiShare: (items?: VideoItem[]) => void;
  setGlobalControl: (ctl: string | null) => void;
  addLog: (msg: string) => void;
  setToast: (msg: string | null) => void;
  setMenu: (menu: { x: number; y: number; id: string } | null) => void;
  setMenuMetadata: (meta: any) => void;
  metadataCache: React.MutableRefObject<Record<string, any>>;
}

export function useContextMenuActions({
  videos,
  setVideos,
  onUpdateVideo,
  toggleSelect,
  selectedIds,
  setSelectedIds,
  setSelectionMode,
  focusedId,
  setFocusedId,
  setIsCropping,
  setCropBox,
  setAspectRatio,
  handleResize,
  handleNavigateSibling,
  handleCreateSticker,
  handleDecommission,
  setSingleRenameTarget,
  setColorAdjustId,
  handleTriggerWifiShare,
  setGlobalControl,
  addLog,
  setToast,
  setMenu,
  setMenuMetadata,
  metadataCache
}: UseContextMenuActionsProps) {

  const onContextMenuAction = useCallback(async (action: string, menuId: string) => {
    const v = videos.find(x => x.id === menuId);
    if (!v) return;

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

                  // 1. INSTANT UI UPDATE (0ms) — tiles vanish immediately + scrub from collections & collage
                  const deletedPathSet = new Set(pathsToDelete.map(p => normalizeMediaKey(p)));
                  setCollections(prev => {
                    const next: Record<string, VideoItem[]> = {};
                    for (const [k, list] of Object.entries(prev)) {
                      next[k] = list.filter(item => !targetIdSet.has(item.id) && !deletedPathSet.has(normalizeMediaKey(item.realPath || item.url || '')));
                    }
                    return next;
                  });
                  setCollageItems(prev => prev.filter(item => !targetIdSet.has(item.id) && !deletedPathSet.has(normalizeMediaKey(item.url || ''))));
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

                  // 1. INSTANT UI UPDATE (0ms) — tile vanishes immediately + scrub from collections & collage
                  const deletedNormKey = normalizeMediaKey(targetPath);
                  setCollections(prev => {
                    const next: Record<string, VideoItem[]> = {};
                    for (const [k, list] of Object.entries(prev)) {
                      next[k] = list.filter(item => item.id !== targetId && normalizeMediaKey(item.realPath || item.url || '') !== deletedNormKey);
                    }
                    return next;
                  });
                  setCollageItems(prev => prev.filter(item => item.id !== targetId && normalizeMediaKey(item.url || '') !== deletedNormKey));
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
                useStore.getState().setShowBatchRename(true);
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
              case 'metadata_studio': {
                const currentFile = (v.folderFiles && v.currentIdx !== undefined && v.folderFiles[v.currentIdx])
                  ? v.folderFiles[v.currentIdx]
                  : null;
                const targetItem: VideoItem = currentFile ? {
                  ...v,
                  realPath: currentFile.path || currentFile.url,
                  url: currentFile.url || currentFile.path,
                  title: currentFile.name || v.title
                } : v;
                metadataCache.current = {};
                useStore.getState().setMetadataStudioTargets([targetItem]);
                break;
              }
              case 'metadata_studio_selected': {
                const selectedItems = videos.filter(item => selectedIds.has(item.id)).map(item => {
                  const currentFile = (item.folderFiles && item.currentIdx !== undefined && item.folderFiles[item.currentIdx])
                    ? item.folderFiles[item.currentIdx]
                    : null;
                  return currentFile ? {
                    ...item,
                    realPath: currentFile.path || currentFile.url,
                    url: currentFile.url || currentFile.path,
                    title: currentFile.name || item.title
                  } : item;
                });
                metadataCache.current = {};
                useStore.getState().setMetadataStudioTargets(selectedItems.length > 0 ? selectedItems : [v]);
                break;
              }
              case 'quick_strip_comfyui':
              case 'quick_strip_exif':
              case 'quick_strip_all':
              case 'quick_strip_comfyui_selected':
              case 'quick_strip_exif_selected':
              case 'quick_strip_all_selected': {
                const isBatch = action.endsWith('_selected') && selectedIds.size > 0;
                const targetItems = isBatch
                  ? videos.filter(item => selectedIds.has(item.id))
                  : [v];
                const paths = targetItems
                  .map(item => {
                    const raw = (item.folderFiles && item.currentIdx !== undefined && item.folderFiles[item.currentIdx])
                      ? (item.folderFiles[item.currentIdx]?.path || item.folderFiles[item.currentIdx]?.url)
                      : (item.realPath || item.url);
                    return toRealPath(raw || '') || raw || '';
                  })
                  .filter(p => p && !p.startsWith('/demos/'));

                if (paths.length === 0) {
                  addLog('Metadata Strip Error: No valid disk paths found.');
                  break;
                }

                const backendAction = action.includes('comfyui')
                  ? 'strip_comfyui'
                  : action.includes('exif')
                  ? 'strip_exif'
                  : 'strip_all';

                const label = backendAction === 'strip_comfyui'
                  ? 'ComfyUI workflow/prompt data'
                  : backendAction === 'strip_exif'
                  ? 'EXIF metadata'
                  : 'all ComfyUI & EXIF metadata';

                (async () => {
                  try {
                    const res = await invoke<{
                      results: { original_path: string; output_path: string; success: boolean }[];
                      success_count: number;
                      fail_count: number;
                      total_bytes_saved: number;
                    }>('strip_or_update_metadata_batch', {
                      request: {
                        paths,
                        action: backendAction,
                        overwrite: true,
                        editable_exif: null,
                        comfyui_entries: null,
                      },
                    });
                    metadataCache.current = {};
                    const kb = Math.max(0, res.total_bytes_saved / 1024).toFixed(1);
                    const msg = `✓ Stripped ${label} from ${res.success_count} file(s)${res.total_bytes_saved > 0 ? ` (${kb} KB freed)` : ''}`;
                    addLog(msg);
                    setToast(msg);
                    setTimeout(() => setToast(null), 3500);
                  } catch (err) {
                    console.error('Quick metadata strip failed:', err);
                    addLog(`Metadata Strip Failed: ${err}`);
                    setToast(`Metadata strip failed: ${err}`);
                    setTimeout(() => setToast(null), 4000);
                  }
                })();
                break;
              }
              case 'whatsapp_share': {
                const currentFile = (v.folderFiles && v.currentIdx !== undefined && v.folderFiles[v.currentIdx]) 
                  ? v.folderFiles[v.currentIdx] 
                  : null;
                const targetItem: VideoItem = currentFile ? {
                  ...v,
                  realPath: currentFile.path || currentFile.url,
                  url: currentFile.url || currentFile.path,
                  title: currentFile.name || v.title
                } : v;
                useStore.getState().setWhatsAppShareTarget(targetItem);
                break;
              }
              case 'share_file': {
                const currentFile = (v.folderFiles && v.currentIdx !== undefined && v.folderFiles[v.currentIdx]) 
                  ? v.folderFiles[v.currentIdx] 
                  : null;
                const targetItem: VideoItem = currentFile ? {
                  ...v,
                  realPath: currentFile.path || currentFile.url,
                  url: currentFile.url || currentFile.path,
                  title: currentFile.name || v.title
                } : v;
                handleTriggerWifiShare([targetItem]);
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
  }, [
    videos,
    setVideos,
    onUpdateVideo,
    toggleSelect,
    selectedIds,
    setSelectedIds,
    setSelectionMode,
    focusedId,
    setFocusedId,
    setIsCropping,
    setCropBox,
    setAspectRatio,
    handleResize,
    handleNavigateSibling,
    handleCreateSticker,
    handleDecommission,
    setSingleRenameTarget,
    setColorAdjustId,
    handleTriggerWifiShare,
    setGlobalControl,
    addLog,
    setToast,
    setMenu,
    setMenuMetadata,
    metadataCache
  ]);

  return { onContextMenuAction };
}
