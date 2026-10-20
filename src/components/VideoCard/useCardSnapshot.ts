import React, { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SNAPSHOT_TOAST_DURATION } from '../../constants';
import { isTauri, toCosmoUrl, showConfirm, toRealPath } from '../../utils/videoUtils';
import type { VideoItem } from '../../types';

interface UseCardSnapshotProps {
  video: VideoItem;
  snapshotDir?: string;
  setSnapshotDir?: (dir: string) => void;
  onLog: (msg: string) => void;
  onAddVideo?: (newVideo: VideoItem) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isImage: boolean;
  setSnapshotToast: React.Dispatch<React.SetStateAction<number | null>>;
}

export function useCardSnapshot({
  video,
  snapshotDir,
  setSnapshotDir,
  onLog,
  onAddVideo,
  videoRef,
  isImage,
  setSnapshotToast,
}: UseCardSnapshotProps) {
  const takeSnapshot = useCallback(async () => {
    try {
      if (isImage) {
        let dirToUse = snapshotDir;
        if (isTauri() && (!dirToUse || dirToUse.trim() === "")) {
          onLog("SYSTEM: No snapshot directory set. Please select a destination.");
          const newDir = await invoke<string | null>('select_folder_cmd');
          if (newDir) {
            dirToUse = newDir;
            if (setSnapshotDir) setSnapshotDir(newDir);
            await invoke('save_persistence', { key: 'cosmo-snap-dir', data: newDir });
            onLog(`SNAPSHOT DESTINATION SET: ${newDir}`);
          } else {
            onLog("ERROR: Snapshot aborted (No directory selected)");
            return;
          }
        }
        const imgEl = document.querySelector(`[data-id="${video.id}"] img`) as HTMLImageElement;
        if (imgEl) {
          const rotation = video.rotation || 0;
          const normalizedRotation = ((rotation % 360) + 360) % 360;
          const isLandscape = normalizedRotation === 90 || normalizedRotation === 270;

          const c = document.createElement('canvas');
          c.width = isLandscape ? imgEl.naturalHeight : imgEl.naturalWidth;
          c.height = isLandscape ? imgEl.naturalWidth : imgEl.naturalHeight;
          
          const ctx = c.getContext('2d');
          if (!ctx) return;
          
          ctx.translate(c.width / 2, c.height / 2);
          ctx.rotate((normalizedRotation * Math.PI) / 180);
          ctx.drawImage(imgEl, -imgEl.naturalWidth / 2, -imgEl.naturalHeight / 2, imgEl.naturalWidth, imgEl.naturalHeight);
          
          const base64 = c.toDataURL('image/png');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const fileName = `Cosmo_${video.title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;

          if (isTauri()) {
            const path = await invoke<string>('save_snapshot', { base64Data: base64, fileName, customDir: dirToUse });
            onLog(`SUCCESS: Snapshot saved to: ${path}`);
            
            if (onAddVideo) {
              onAddVideo({
                id: `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                title: fileName.replace('.png', ''),
                url: toCosmoUrl(path),
                realPath: path,
                currentTime: 0,
                repeatMode: 'none',
                playing: false,
                muted: true
              });
            }
          } else {
            const link = document.createElement('a');
            link.download = fileName;
            link.href = base64;
            link.click();
            onLog(`SUCCESS: Snapshot downloaded as ${fileName}`);
          }
          const toastId = Date.now();
          setSnapshotToast(toastId);
          setTimeout(() => setSnapshotToast(current => current === toastId ? null : current), SNAPSHOT_TOAST_DURATION);
        }
        return;
      }

      const v = videoRef.current;
      const currentTimeSecs = v ? v.currentTime : (video.currentTime || 0);
      let realFilePath = video.realPath || '';
      
      // Fallback for bundled demo videos so they can be snapshotted successfully
      if (!realFilePath && (video.url?.startsWith('/demos/') || video.url?.startsWith('demos/'))) {
        realFilePath = toRealPath(video.url) || '';
      }

      let dirToUse = snapshotDir;
      if (isTauri() && (!dirToUse || dirToUse.trim() === '')) {
        onLog('SYSTEM: No snapshot directory set. Please select a destination.');
        const newDir = await invoke<string | null>('select_folder_cmd');
        if (newDir) {
          dirToUse = newDir;
          if (setSnapshotDir) setSnapshotDir(newDir);
          await invoke('save_persistence', { key: 'cosmo-snap-dir', data: newDir });
          onLog(`SNAPSHOT DESTINATION SET: ${newDir}`);
        } else {
          onLog('ERROR: Snapshot aborted (No directory selected)');
          return;
        }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Cosmo_${video.title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;

      if (isTauri()) {
        try {
          if (!realFilePath) {
            throw new Error("No physical file path available.");
          }
          const path = await invoke<string>('snapshot_video_frame', {
            realPath: realFilePath,
            timestampSecs: currentTimeSecs,
            fileName,
            customDir: dirToUse || null,
          });

          onLog(`SUCCESS: Snapshot saved to: ${path}`);

          if (onAddVideo) {
            onAddVideo({
              id: `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: fileName.replace('.png', ''),
              url: toCosmoUrl(path),
              realPath: path,
              currentTime: 0,
              repeatMode: 'none',
              playing: false,
              muted: true
            });
          }
        } catch (err: any) {
          onLog(`SYSTEM: Native snapshot failed (${err.message || err}). Trying Canvas client-side fallback...`);
          if (v && v.videoWidth > 0) {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              const ctx = canvas.getContext('2d');
              if (!ctx) throw new Error("Could not create canvas context");
              ctx.drawImage(v, 0, 0, v.videoWidth, v.videoHeight);
              const base64 = canvas.toDataURL('image/png');
              const path = await invoke<string>('save_snapshot', {
                base64Data: base64,
                fileName,
                customDir: dirToUse || null
              });
              onLog(`SUCCESS (Canvas Fallback): Snapshot saved to: ${path}`);
              if (onAddVideo) {
                onAddVideo({
                  id: `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  title: fileName.replace('.png', ''),
                  url: toCosmoUrl(path),
                  realPath: path,
                  currentTime: 0,
                  repeatMode: 'none',
                  playing: false,
                  muted: true
                });
              }
            } catch (fallbackErr: any) {
              onLog(`ERROR: Snapshot failed entirely: ${fallbackErr.message || fallbackErr}`);
            }
          } else {
            onLog('ERROR: Video is not ready or has zero dimension');
          }
        }
      } else {
        if (v && v.videoWidth > 0) {
          const c = document.createElement('canvas');
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.drawImage(v, 0, 0);
            const link = document.createElement('a');
            link.download = fileName;
            link.href = c.toDataURL('image/png');
            link.click();
            onLog(`SUCCESS: Snapshot downloaded as ${fileName}`);
          }
        } else {
          onLog('ERROR: Video not ready for snapshot');
          return;
        }
      }

      const toastId = Date.now();
      setSnapshotToast(toastId);
      setTimeout(() => {
        setSnapshotToast(current => current === toastId ? null : current);
      }, SNAPSHOT_TOAST_DURATION);

    } catch (err) {
      const errMsg = String(err);
      const isDirError = errMsg.toLowerCase().includes('could not') ||
                         errMsg.toLowerCase().includes('directory') ||
                         errMsg.toLowerCase().includes('i/o') ||
                         errMsg.toLowerCase().includes('create snapshot');

      if (isDirError && isTauri()) {
        const badDir = snapshotDir || 'the snapshot folder';
        const pick = await showConfirm(
          `The snapshot folder is not accessible:\n\n"${badDir}"\n\nWould you like to choose a new location?`,
          { title: 'Snapshot Folder Not Found', kind: 'warning' }
        );

        if (pick) {
          const newDir = await invoke<string | null>('select_folder_cmd');
          if (newDir) {
            if (setSnapshotDir) setSnapshotDir(newDir);
            await invoke('save_persistence', { key: 'cosmo-snap-dir', data: newDir });
            onLog(`SNAPSHOT DESTINATION SET: ${newDir}`);
            try {
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const retryFileName = `Cosmo_${video.title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.png`;
              const v2 = videoRef.current;
              const retryTimeSecs = v2 ? v2.currentTime : (video.currentTime || 0);
              const path = await invoke<string>('snapshot_video_frame', {
                realPath: video.realPath || '',
                timestampSecs: retryTimeSecs,
                fileName: retryFileName,
                customDir: newDir,
              });
              onLog(`SUCCESS: Snapshot saved to: ${path}`);
              const toastId = Date.now();
              setSnapshotToast(toastId);
              setTimeout(() => setSnapshotToast(c => c === toastId ? null : c), SNAPSHOT_TOAST_DURATION);
            } catch (retryErr) {
              onLog(`ERROR: Snapshot retry failed - ${retryErr}`);
            }
          } else {
            if (setSnapshotDir) setSnapshotDir('');
            await invoke('save_persistence', { key: 'cosmo-snap-dir', data: '' });
            onLog('SYSTEM: Snapshot cancelled — no folder selected.');
          }
        } else {
          if (setSnapshotDir) setSnapshotDir('');
          await invoke('save_persistence', { key: 'cosmo-snap-dir', data: '' });
          onLog('SYSTEM: Snapshot folder cleared — you will be prompted to choose one next time.');
        }
      } else {
        onLog(`CRITICAL ERROR: Snapshot failed - ${errMsg}`);
      }
    }
  }, [video.title, video.id, video.realPath, video.rotation, video.currentTime, video.url, snapshotDir, setSnapshotDir, onLog, isImage, onAddVideo, videoRef, setSnapshotToast]);

  return { takeSnapshot };
}
