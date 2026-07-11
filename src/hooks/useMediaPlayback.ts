import { useCallback } from 'react';
import type { VideoItem, RepeatMode } from '../types';
import { isAudioFile } from '../components/MusicPlayerWidget';
import { useStore } from '../store/useStore';

interface UseMediaPlaybackProps {
  globalRepeat: RepeatMode;
  addLog: (m: string) => void;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  focusedId: string | null;
  filtered: VideoItem[];
  setFocusedId: (id: string | null) => void;
  masterMuted: boolean;
  setNavDirection: (dir: 1 | -1) => void;
}

export function useMediaPlayback({
  globalRepeat,
  addLog,
  setVideos,
  focusedId,
  filtered,
  setFocusedId,
  masterMuted,
  setNavDirection
}: UseMediaPlaybackProps) {

  const handleVideoEnded = useCallback((id: string) => {
    const endedVideo = filtered.find(v => v.id === id);
    if (!endedVideo) return;
    
    const isEndedAudio = isAudioFile(endedVideo.realPath || endedVideo.url || '');
    let currentMode = (endedVideo.repeatMode && endedVideo.repeatMode !== 'none')
      ? endedVideo.repeatMode
      : globalRepeat;

    if (currentMode as any === 'all') {
      currentMode = 'folder';
    }

    const hasFolderFiles = endedVideo.folderFiles && endedVideo.folderFiles.length > 0;
    if (currentMode === 'always' && hasFolderFiles) {
      currentMode = 'folder';
    }

    // 1. Repeat Once (or Repeat One/Always)
    if (currentMode === 'always' || currentMode === 'once') {
      setVideos(prev => prev.map(v => {
        if (v.id === id) {
          const nextCount = currentMode === 'once' ? (v.repeatCount || 0) + 1 : 0;
          if (currentMode === 'once' && nextCount > 1) {
            return { ...v, playing: false, repeatCount: 0 };
          }
          return { ...v, playing: true, currentTime: 0, repeatCount: nextCount };
        }
        return v;
      }));
      return;
    }

    // 2. Don't Repeat ('none')
    if (currentMode === 'none') {
      setVideos(prev => prev.map(v => v.id === id ? { ...v, playing: false, repeatCount: 0 } : v));
      addLog(`Playback ended: [${endedVideo.title}] (Repeat Mode: None)`);
      return;
    }

    // 3. Repeat All ('folder')
    if (currentMode === 'folder') {
      if (hasFolderFiles) {
        setVideos(prev => prev.map(v => {
          if (v.id !== id) return v;
          const nextIdx = ((v.currentIdx || 0) + 1) % v.folderFiles.length;
          const nextFile = v.folderFiles[nextIdx];
          addLog(`Folder Cycle [${v.title}] -> ${nextFile.name}`);
          return { 
            ...v, 
            currentIdx: nextIdx, 
            url: nextFile.url, 
            realPath: nextFile.path, 
            title: nextFile.name,
            playing: true,
            currentTime: 0
          };
        }));
        return;
      }

      if ((focusedId && id === focusedId) || isEndedAudio) {
        const currentIdx = filtered.findIndex(v => v.id === id);
        if (currentIdx !== -1) {
          if (filtered.length > 1) {
            const nextIdx = (currentIdx + 1) % filtered.length;
            const nextVideo = filtered[nextIdx];
            if (nextVideo) {
              if (focusedId && id === focusedId) {
                setNavDirection(1);
                setFocusedId(nextVideo.id);
              }
              
              setVideos(prev => prev.map(v => {
                if (v.id === nextVideo.id) {
                  return { ...v, playing: true, muted: masterMuted, currentTime: 0 };
                }
                if (v.id === id) {
                  return { ...v, playing: false, muted: true };
                }
                return v;
              }));

              if (isEndedAudio) {
                useStore.getState().setCurrentPlayingSongId(nextVideo.id);
              }
              
              addLog(`Sequence (Repeat All): [${filtered[currentIdx].title}] ended. Playing next sibling [${nextVideo.title}]`);
              return;
            }
          } else {
            const videoEl = document.querySelector(`[data-id="${id}"] video`) as HTMLVideoElement;
            if (videoEl) {
              videoEl.currentTime = 0;
              videoEl.play().catch(() => {});
            }
            setVideos(prev => prev.map(v => v.id === id ? { ...v, playing: true, currentTime: 0 } : v));
            return;
          }
        }
      }

      setVideos(prev => prev.map(v => {
        if (v.id !== id) return v;
        
        if (v.folderFiles && v.folderFiles.length > 0) {
          const nextIdx = ((v.currentIdx || 0) + 1) % v.folderFiles.length;
          const nextFile = v.folderFiles[nextIdx];
          addLog(`Folder Cycle [${v.title}] -> ${nextFile.name}`);
          return { 
            ...v, 
            currentIdx: nextIdx, 
            url: nextFile.url, 
            realPath: nextFile.path, 
            title: nextFile.name,
            playing: true,
            currentTime: 0
          };
        } else {
          const videoEl = document.querySelector(`[data-id="${id}"] video`) as HTMLVideoElement;
          if (videoEl) {
            videoEl.currentTime = 0;
            videoEl.play().catch(() => {});
          }
          return { ...v, playing: true, currentTime: 0 };
        }
      }));
    }
  }, [globalRepeat, addLog, setVideos, focusedId, filtered, setFocusedId, masterMuted, setNavDirection]);

  return { handleVideoEnded };
}
