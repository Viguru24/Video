import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { 
  toCosmoUrl, 
  isValidMediaExtension, 
  getFileNameFromPath 
} from '../utils/videoUtils';
import type { VideoItem } from '../types';

interface UseIngestionProps {
  mediaMode: 'video' | 'picture';
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addLog: (msg: string) => void;
  masterPlayingRef: React.MutableRefObject<boolean>;
  masterMutedRef: React.MutableRefObject<boolean>;
  setDragFile: (dragging: boolean) => void;
  isPopout?: boolean;
}

/**
 * Custom hook to manage the media ingestion pipeline.
 * Handles OS-level drag-and-drop events and folder expansion.
 */
export function useIngestion({
  mediaMode,
  setVideos,
  addLog,
  masterPlayingRef,
  masterMutedRef,
  setDragFile,
  isPopout = false
}: UseIngestionProps) {
  const mediaModeRef = useRef(mediaMode);
  
  // Keep the ref in sync with the state to avoid re-initializing the listener
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
          // Debug log for stability verification
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
          const paths = event.payload.paths ? [...event.payload.paths].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })) : [];
          if (paths.length === 0) return;
          
          addLog(`System: Intercepting ${paths.length} drop assets...`);
          
          const newVids: VideoItem[] = [];
          const processedFolders = new Set<string>();
          let videoCount = 0;
          let pictureCount = 0;
          
          for (const path of paths) {
            try {
                // Check if path is a directory (by asking backend for its videos)
                let folderVids: { name: string, url: string }[] = [];
                let isDirectory = false;
                
                try {
                  // Always ingest ALL media types — the UI filters by mediaMode automatically
                  folderVids = await invoke<{ name: string, url: string }[]>('get_folder_videos', { 
                    path, 
                    mode: 'all'
                  });
                  isDirectory = true;
                } catch (e) {
                  isDirectory = false;
                }

                if (isDirectory && folderVids && folderVids.length > 0) {
                  if (processedFolders.has(path)) continue;
                  processedFolders.add(path);
                  
                  // Sort directory contents alphabetically using natural numeric sorting
                  folderVids.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

                  addLog(`Ingesting Folder: ${path} (${folderVids.length} items)`);
                  const folderWithUrls = folderVids.map(v => ({ 
                    ...v, 
                    url: toCosmoUrl(v.url),
                    path: v.url 
                  }));

                  // EXPLOSIVE INGESTION: Add every file in the folder as an individual card
                  folderWithUrls.forEach((file) => {
                    const isVideo = isValidMediaExtension((file as any).path || file.url, 'video');
                    if (isVideo) videoCount++; else pictureCount++;
                    
                    newVids.push({ 
                      id: crypto.randomUUID(), 
                      url: file.url, 
                      realPath: (file as any).path || file.url, 
                      title: file.name, 
                      repeatMode: 'none', 
                      repeatCount: 0, 
                      cols: 1, 
                      currentIdx: 0, 
                      playing: masterPlayingRef.current, 
                      muted: masterMutedRef.current 
                    });
                  });
                  continue;
                }
                
                // Individual File Ingestion
                const isVideo = isValidMediaExtension(path, 'video');
                const isPicture = isValidMediaExtension(path, 'picture');
                if (isVideo || isPicture) {
                  if (isVideo) videoCount++; else pictureCount++;
                  const filename = getFileNameFromPath(path);
                  newVids.push({ 
                    id: crypto.randomUUID(), 
                    url: toCosmoUrl(path), 
                    realPath: path, 
                    title: filename, 
                    repeatMode: 'none', 
                    repeatCount: 0, 
                    cols: 1, 
                    currentIdx: 0,
                    playing: masterPlayingRef.current, 
                    muted: masterMutedRef.current 
                  });
                }
            } catch (err) { 
              console.error("[Ingestion] Error processing path:", path, err); 
            }
          }
          
          if (newVids.length > 0) {
            setVideos(prev => [...prev, ...newVids]);
            // Show a detailed breakdown if both types were ingested
            if (videoCount > 0 && pictureCount > 0) {
              addLog(`System: Sorted ${videoCount} videos → Video tab, ${pictureCount} images → Stills tab.`);
            } else {
              addLog(`System: Successfully ingested ${newVids.length} ${videoCount > 0 ? 'videos' : 'images'}.`);
            }
          }
        });
        
      } catch (err) { 
        console.error("[Ingestion] Listener Setup Error:", err); 
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
          result.catch((err: any) => console.error("[Ingestion] Cleanup error:", err));
        }
      }
    };
  }, [isPopout, setVideos, addLog, masterPlayingRef, masterMutedRef, setDragFile]);
}
