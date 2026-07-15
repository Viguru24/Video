import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import {
  toCosmoUrl,
  isValidMediaExtension,
  getFileNameFromPath,
  showConfirm,
  requiresConversion,
  maybeConvertMedia,
  isTauri,
  generateUUID
} from '../utils/videoUtils';

interface UseMediaImportProps {
  mediaMode: 'all' | 'video' | 'picture';
  masterPlaying: boolean;
  masterMuted: boolean;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  setSelectedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setFocusedId: (id: string | null) => void;
  setConvertingStatus: (status: { current: number; total: number; filename: string } | null) => void;
  addLog: (m: string) => void;
}

export function useMediaImport({
  mediaMode,
  masterPlaying,
  masterMuted,
  setVideos,
  setSelectedIds,
  setFocusedId,
  setConvertingStatus,
  addLog
}: UseMediaImportProps) {

  const processFolderConversion = useCallback(async (
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
  }, [addLog, setConvertingStatus]);

  const handleIngestPaths = useCallback(async (paths: string[]) => {
    if (!paths || paths.length === 0) return;
    
    console.log("[useMediaImport] handleIngestPaths called with:", paths);
    addLog(`System: Ingesting ${paths.length} file(s)...`);

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

    console.log("[useMediaImport] resolved files:", resolved);

    if (resolved.length === 0) {
      console.warn("[useMediaImport] No files resolved as valid media.");
      return;
    }

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
        console.log("[useMediaImport] Processing file:", file.path);
        const needsConv = requiresConversion(file.path, file.isVideo);
        if (needsConv && !doConvert) {
          console.log("[useMediaImport] Skipping non-native file (conversion declined):", file.path);
          continue;
        }

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

        const newItem = {
          id: generateUUID(),
          url: finalUrl,
          realPath: finalPath,
          title: finalName,
          repeatMode: 'none' as RepeatMode,
          repeatCount: 0,
          cols: 1,
          currentIdx: 0,
          playing: masterPlaying,
          muted: masterMuted,
          size,
          modified,
          created
        };
        console.log("[useMediaImport] Created new item:", newItem);
        newItems.push(newItem);
      } catch (err: any) {
        console.error('Failed to ingest browser path:', file.path, err);
      }
    }

    setConvertingStatus(null);
    console.log("[useMediaImport] Final newItems list built:", newItems);

    if (newItems.length > 0) {
      setVideos(prev => {
        const next = [...prev, ...newItems];
        console.log("[useMediaImport] setVideos called. Prev count:", prev.length, "New count:", next.length);
        return next;
      });
      addLog(`System: Ingested ${newItems.length} file(s) from in-app browser.`);
    } else {
      console.warn("[useMediaImport] No items added to videos state (newItems is empty).");
    }
  }, [masterPlaying, masterMuted, setVideos, addLog, setConvertingStatus]);

  const loadToastPathFolder = useCallback(async (path: string) => {
    try {
      const cleanPath = path.trim().replace(/^["']|["']$/g, '');
      const norm = cleanPath.replace(/\\/g, '/');
      const parts = norm.split('/');
      
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
        const newFolderId = generateUUID();
        
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
        
        setSelectedIds(new Set([newFolderId]));
        setFocusedId(newFolderId);
        
        addLog(`SYSTEM: Loaded folder "${folderName}" displaying ${convertedVids.length} files`);
      } else {
        addLog("System: No files found in folder.");
      }
    } catch (err) {
      addLog(`ERROR: Failed to load folder: ${err}`);
    }
  }, [mediaMode, processFolderConversion, setVideos, setSelectedIds, setFocusedId, addLog]);

  const handleSidebarAddFolder = useCallback(async () => {
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
                id: generateUUID(),
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
  }, [mediaMode, processFolderConversion, setVideos, masterPlaying, masterMuted, addLog]);

  const handleAddMediaFiles = useCallback(async () => {
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
  }, [handleIngestPaths, addLog]);

  return {
    processFolderConversion,
    loadToastPathFolder,
    handleSidebarAddFolder,
    handleAddMediaFiles,
    handleIngestPaths
  };
}
