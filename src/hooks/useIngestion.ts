import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  toCosmoUrl,
  isValidMediaExtension,
  getFileNameFromPath,
  showConfirm,
  requiresConversion,
  maybeConvertMedia,
} from '../utils/videoUtils';
import type { VideoItem } from '../types';

interface UseIngestionProps {
  mediaMode: 'all' | 'video' | 'picture';
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addLog: (msg: string) => void;
  masterPlayingRef: React.MutableRefObject<boolean>;
  masterMutedRef: React.MutableRefObject<boolean>;
  setDragFile: (dragging: boolean) => void;
  /** Called with progress during batch conversion, or null when done */
  setConvertingStatus: (status: { current: number; total: number; filename: string } | null) => void;
  isPopout?: boolean;
}

/**
 * Custom hook to manage the media ingestion pipeline.
 * Handles OS-level drag-and-drop events, folder expansion, and format conversion.
 *
 * Pipeline:
 *   Phase 1 — Resolve: expand folders into individual file records
 *   Phase 2 — Confirm: show ONE dialog if any files need conversion
 *   Phase 3 — Process: convert approved files and add all cards to the grid
 */
export function useIngestion({
  mediaMode,
  setVideos,
  addLog,
  masterPlayingRef,
  masterMutedRef,
  setDragFile,
  setConvertingStatus,
  isPopout = false,
}: UseIngestionProps) {
  const mediaModeRef = useRef(mediaMode);

  // Keep the ref in sync with state to avoid re-initialising the listener
  useEffect(() => {
    mediaModeRef.current = mediaMode;
  }, [mediaMode]);

  useEffect(() => {
    if (isPopout) return;

    const stopDefaults = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('dragover', stopDefaults);
    window.addEventListener('drop', stopDefaults);

    let unlistenDragDrop: any;

    const setupListeners = async () => {
      try {
        const win = getCurrentWindow();

        unlistenDragDrop = await win.onDragDropEvent(async (event: any) => {
          console.log(`[Ingestion] Event: ${event.payload.type}`);

          if (event.payload.type === 'over' || event.payload.type === 'enter') {
            setDragFile(true);
            return;
          }

          if (event.payload.type !== 'drop') {
            setDragFile(false);
            return;
          }

          setDragFile(false);

          const paths: string[] = event.payload.paths
            ? [...event.payload.paths].sort((a, b) =>
                a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
              )
            : [];
          if (paths.length === 0) return;

          addLog(`System: Intercepting ${paths.length} drop asset(s)...`);

          // ── Phase 1: Resolve all dropped paths to individual file records ──
          type ResolvedFile = {
            path: string;
            name: string;
            url: string;
            isVideo: boolean;
            size?: number;
            modified?: number;
            created?: number;
          };
          const resolved: ResolvedFile[] = [];
          const processedFolders = new Set<string>();

          for (const p of paths) {
            try {
              let folderVids: { name: string; url: string, size?: number, modified?: number, created?: number }[] = [];
              let isDirectory = false;

              try {
                folderVids = await invoke<{ name: string; url: string, size?: number, modified?: number, created?: number }[]>(
                  'get_folder_videos',
                  { path: p, mode: 'all' },
                );
                isDirectory = true;
              } catch {
                isDirectory = false;
              }

              if (isDirectory && folderVids.length > 0) {
                if (processedFolders.has(p)) continue;
                processedFolders.add(p);

                folderVids.sort((a, b) =>
                  a.name.localeCompare(b.name, undefined, {
                    numeric: true,
                    sensitivity: 'base',
                  }),
                );
                addLog(`Ingesting Folder: ${p} (${folderVids.length} items)`);

                for (const v of folderVids) {
                  const isVideo = isValidMediaExtension(v.url, 'video');
                  const isPicture = isValidMediaExtension(v.url, 'picture');
                  if (isVideo || isPicture) {
                    resolved.push({
                      path: v.url,
                      name: v.name,
                      url: toCosmoUrl(v.url),
                      isVideo,
                      size: v.size,
                      modified: v.modified,
                      created: v.created
                    });
                  }
                }
              } else {
                const isVideo = isValidMediaExtension(p, 'video');
                const isPicture = isValidMediaExtension(p, 'picture');
                if (isVideo || isPicture) {
                  let size = 0, modified = 0, created = 0;
                  try {
                    const stats = await invoke<[number, number, number]>('get_file_stats', { path: p });
                    size = stats[0];
                    modified = stats[1];
                    created = stats[2];
                  } catch (e) {
                    console.error('[Ingestion] Failed to get stats for single file:', p, e);
                  }

                  resolved.push({
                    path: p,
                    name: getFileNameFromPath(p),
                    url: toCosmoUrl(p),
                    isVideo,
                    size,
                    modified,
                    created
                  });
                }
              }
            } catch (err) {
              console.error('[Ingestion] Error resolving path:', p, err);
            }
          }

          if (resolved.length === 0) return;

          // ── Phase 2: One confirmation if any files need conversion ──────────
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
              addLog(
                `System: Conversion skipped — ${needConv.length} non-native file(s) excluded.`,
              );
            }
          }

          // ── Phase 3: Build video cards (converting where approved) ──────────
          const newVids: VideoItem[] = [];
          let videoCount = 0;
          let pictureCount = 0;

          // Count how many files actually need conversion so we can show progress
          const convFiles = resolved.filter(f => requiresConversion(f.path, f.isVideo) && doConvert);
          let convIdx = 0;

          for (const file of resolved) {
            try {
              const needsConv = requiresConversion(file.path, file.isVideo);

              // Skip non-native files if user declined conversion
              if (needsConv && !doConvert) continue;

              if (needsConv && doConvert) {
                convIdx++;
                setConvertingStatus({
                  current: convIdx,
                  total: convFiles.length,
                  filename: getFileNameFromPath(file.path),
                });
              }

              const finalPath =
                needsConv && doConvert
                  ? await maybeConvertMedia(file.path, file.isVideo, addLog)
                  : file.path;

              const finalUrl =
                finalPath !== file.path ? toCosmoUrl(finalPath) : file.url;
              const finalName =
                finalPath !== file.path ? getFileNameFromPath(finalPath) : file.name;

              if (file.isVideo) videoCount++;
              else pictureCount++;

              newVids.push({
                id: crypto.randomUUID(),
                url: finalUrl,
                realPath: finalPath,
                title: finalName,
                repeatMode: 'none',
                repeatCount: 0,
                cols: 1,
                currentIdx: 0,
                playing: masterPlayingRef.current,
                muted: masterMutedRef.current,
                size: file.size,
                modified: file.modified,
                created: file.created,
              });
            } catch (err) {
              console.error('[Ingestion] Error processing file:', file.path, err);
            }
          }

          // Clear the converting overlay once all files are done
          setConvertingStatus(null);

          if (newVids.length > 0) {
            setVideos(prev => [...prev, ...newVids]);
            if (videoCount > 0 && pictureCount > 0) {
              addLog(
                `System: Sorted ${videoCount} videos → Video tab, ${pictureCount} images → Stills tab.`,
              );
            } else {
              addLog(
                `System: Successfully ingested ${newVids.length} ${videoCount > 0 ? 'video' : 'image'}${newVids.length > 1 ? 's' : ''}.`,
              );
            }
          }
        });
      } catch (err) {
        console.error('[Ingestion] Listener Setup Error:', err);
      }
    };

    setupListeners();

    return () => {
      window.removeEventListener('dragover', stopDefaults);
      window.removeEventListener('drop', stopDefaults);
      if (unlistenDragDrop) {
        // Safe unlisten: handle both Promise and void returns
        const result = unlistenDragDrop();
        if (result instanceof Promise) {
          result.catch((err: any) => console.error('[Ingestion] Cleanup error:', err));
        }
      }
    };
  }, [isPopout, setVideos, addLog, masterPlayingRef, masterMutedRef, setDragFile]);
}
