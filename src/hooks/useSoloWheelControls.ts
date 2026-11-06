import { useRef, useEffect } from 'react';
import type { VideoItem } from '../types';
import { useStore } from '../store/useStore';

interface UseSoloWheelControlsParams {
  focusedId: string | null;
  videos: VideoItem[];
  handleUpdate: (idOrIds: string | string[], updates: any) => void;
  handleNavigateSibling: (dir: 1 | -1) => void;
  addLog: (m: string) => void;
  setGlobalVolume: React.Dispatch<React.SetStateAction<number>>;
  onUpdateVideo: (idOrIds: string | string[], updates: any) => void;
}

export function useSoloWheelControls({
  focusedId,
  videos,
  handleUpdate,
  handleNavigateSibling,
  addLog,
  setGlobalVolume,
  onUpdateVideo,
}: UseSoloWheelControlsParams) {
  const soloOverlayRef = useRef<HTMLDivElement>(null);
  const soloVolumeContainerRef = useRef<HTMLDivElement>(null);
  const lastSoloWheelTime = useRef(0);

  useEffect(() => {
    if (!focusedId) return;

    const handleSoloWheel = (e: WheelEvent) => {
      if (e.altKey || e.ctrlKey || e.shiftKey) return;
      const overlay = soloOverlayRef.current;
      if (!overlay || !overlay.contains(e.target as Node)) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      const now = Date.now();
      if (now - lastSoloWheelTime.current > 180) {
        lastSoloWheelTime.current = now;
        const direction = e.deltaY > 0 ? 1 : -1;
        const video = videos.find(v => v.id === focusedId);
        if (video) {
          if (video.folderFiles && video.folderFiles.length > 1) {
            const currentIdx = video.currentIdx || 0;
            const nextIdx = (currentIdx + direction + video.folderFiles.length) % video.folderFiles.length;
            const nextFile = video.folderFiles[nextIdx];
            if (nextFile) {
              handleUpdate(video.id, {
                currentIdx: nextIdx,
                url: nextFile.url,
                realPath: (nextFile as any).path || nextFile.url,
                title: nextFile.name
              });
              addLog(`Folder Sibling Navigate [${video.title}] → ${nextFile.name}`);
            }
          } else {
            handleNavigateSibling(direction);
          }
        }
      }
    };

    window.addEventListener('wheel', handleSoloWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener('wheel', handleSoloWheel, { capture: true });
    };
  }, [focusedId, videos, handleUpdate, addLog, handleNavigateSibling]);

  useEffect(() => {
    const el = soloVolumeContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const change = e.deltaY < 0 ? 0.05 : -0.05;
      setGlobalVolume(prev => Math.max(0, Math.min(1, prev + change)));
      
      const state = useStore.getState();
      if (state.masterMuted) {
        state.setMasterMuted(false);
      }
      
      const currentFocusedVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
      if (currentFocusedVideo && currentFocusedVideo.muted) {
        onUpdateVideo(currentFocusedVideo.id, { muted: false });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [focusedId, videos, onUpdateVideo, setGlobalVolume]);

  return {
    soloOverlayRef,
    soloVolumeContainerRef,
  };
}
