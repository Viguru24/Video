import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';

interface UseAppWorkspaceDropParams {
  videos: VideoItem[];
  handleIngestPaths: (paths: string[]) => Promise<void>;
  addLog: (m: string) => void;
  setToast: (m: string | null) => void;
}

export function useAppWorkspaceDrop({
  videos,
  handleIngestPaths,
  addLog,
  setToast,
}: UseAppWorkspaceDropParams) {
  const handleWorkspaceDrop = useCallback(async (e: React.DragEvent) => {
    const internalPath = e.dataTransfer.getData('application/cosmo-file');
    if (internalPath) {
      e.preventDefault();
      e.stopPropagation();

      const normalizePath = (p: string) => (p ? p.replace(/\\/g, '/').toLowerCase() : '');
      const normalizedInternal = normalizePath(internalPath);
      const isAlreadyInWorkspace = videos.some(
        (v) =>
          normalizePath(v.realPath || '') === normalizedInternal ||
          (v.folderFiles && v.folderFiles.some((f) => normalizePath(f.path || '') === normalizedInternal))
      );

      if (isAlreadyInWorkspace || e.altKey || e.ctrlKey) {
        try {
          addLog(`Duplicating file on disk: ${internalPath}`);
          setToast(`Creating physical duplicate...`);
          const newPath = await invoke<string>('duplicate_file_on_disk', { srcPath: internalPath });
          addLog(`Successfully duplicated file: ${newPath}`);
          handleIngestPaths([newPath]);
        } catch (err) {
          console.error('Duplicate via drag-drop failed:', err);
          addLog(`ERROR: Failed to duplicate - ${err}`);
          setToast(`Duplicate failed: ${err}`);
          setTimeout(() => setToast(null), 4000);
        }
      } else {
        handleIngestPaths([internalPath]);
      }
    } else {
      e.preventDefault();
    }
  }, [videos, handleIngestPaths, addLog, setToast]);

  return { handleWorkspaceDrop };
}
