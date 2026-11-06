import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem, RepeatMode } from '../types';
import { 
  isTauri, 
  toCosmoUrl, 
  getFileNameFromPath, 
  generateUUID, 
  isValidMediaExtension, 
  requiresConversion, 
  showConfirm, 
  maybeConvertMedia 
} from '../utils/videoUtils';

interface UseLaunchArgsParams {
  isPopout: boolean;
  mediaMode: 'all' | 'video' | 'picture';
  masterPlayingRef: React.MutableRefObject<boolean>;
  masterMutedRef: React.MutableRefObject<boolean>;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  processFolderConversion: (files: { name: string; url: string }[], mode: 'all' | 'video' | 'picture') => Promise<any[]>;
  setConvertingStatus: React.Dispatch<React.SetStateAction<{ current: number; total: number; filename: string } | null>>;
  addLog: (m: string) => void;
}

export function useLaunchArgs({
  isPopout,
  mediaMode,
  masterPlayingRef,
  masterMutedRef,
  setVideos,
  processFolderConversion,
  setConvertingStatus,
  addLog,
}: UseLaunchArgsParams) {
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
          } catch {
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
              muted: masterMutedRef.current,
              size: file.size || 0,
              modified: file.modified || Date.now(),
              created: file.created || Date.now()
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
              let size = 0, modified = Date.now(), created = Date.now();
              try {
                const stats = await invoke<[number, number, number]>('get_file_stats', { path: finalPath });
                size = stats[0];
                modified = stats[1];
                created = stats[2];
              } catch {}
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
                muted: masterMutedRef.current,
                size,
                modified,
                created
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

    const timer = setTimeout(processLaunchArgs, 800);
    return () => clearTimeout(timer);
  }, [setVideos, addLog, isPopout, mediaMode, masterMutedRef, masterPlayingRef, processFolderConversion, setConvertingStatus]);
}
