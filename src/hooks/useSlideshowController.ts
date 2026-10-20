import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { VideoItem } from '../types';
import { 
  isValidPictureExtension, 
  convertToVideoUrl, 
  toCosmoUrl 
} from '../utils/videoUtils';

interface UseSlideshowControllerProps {
  isSlideshowActive: boolean;
  setIsSlideshowActive: (active: boolean) => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  filtered: VideoItem[];
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  masterMuted: boolean;
  slideshowInterval: number;
  isFocusedImage?: boolean;
  isFocusedVideo?: boolean;
  setImmersive: (val: boolean) => void;
  setToast: (msg: string | null) => void;
  addLog: (msg: string) => void;
  setIsCropping: (val: boolean) => void;
  setShowSaveCropOptions: (val: boolean) => void;
  setShowSaveUpscaleOptions: (val: boolean) => void;
  setShowResizeModal: (val: boolean) => void;
  setColorAdjustId: (id: string | null) => void;
  setGlobalControl: (ctl: string | null) => void;
  setNavDirection: (dir: 1 | -1) => void;
}

export function useSlideshowController({
  isSlideshowActive,
  setIsSlideshowActive,
  focusedId,
  setFocusedId,
  filtered,
  videos,
  setVideos,
  masterMuted,
  slideshowInterval,
  isFocusedImage,
  isFocusedVideo,
  setImmersive,
  setToast,
  addLog,
  setIsCropping,
  setShowSaveCropOptions,
  setShowSaveUpscaleOptions,
  setShowResizeModal,
  setColorAdjustId,
  setGlobalControl,
  setNavDirection
}: UseSlideshowControllerProps) {

  const handleNavigateSibling = useCallback((direction: 1 | -1) => {
    if (filtered.length <= 1 || !focusedId) return;
    const currentIdx = filtered.findIndex(v => v.id === focusedId);
    if (currentIdx === -1) return;
    const nextIdx = (currentIdx + direction + filtered.length) % filtered.length;
    const nextVideo = filtered[nextIdx];
    if (nextVideo) {
      setIsCropping(false);
      setShowSaveCropOptions(false);
      setShowSaveUpscaleOptions(false);
      setShowResizeModal(false);
      setColorAdjustId(null);
      setGlobalControl(null);
      setNavDirection(direction);
      setFocusedId(nextVideo.id);

      const nextPath = nextVideo.realPath || nextVideo.url || '';
      if (!isValidPictureExtension(nextPath)) {
        setVideos(prev => prev.map(v =>
          v.id === nextVideo.id ? { ...v, playing: true, muted: masterMuted, currentTime: 0 } :
          v.id === focusedId ? { ...v, playing: false, muted: true } : v
        ));
      }
      addLog(`Folder Navigate [${filtered[currentIdx].title}] → ${nextVideo.title}`);
    }
  }, [
    filtered, 
    focusedId, 
    masterMuted, 
    setFocusedId, 
    setVideos, 
    addLog, 
    setIsCropping, 
    setShowSaveCropOptions, 
    setShowSaveUpscaleOptions, 
    setShowResizeModal, 
    setColorAdjustId, 
    setGlobalControl,
    setNavDirection
  ]);

  // Reset slideshow if exiting Solo mode
  useEffect(() => {
    if (!focusedId) {
      setIsSlideshowActive(false);
    }
  }, [focusedId, setIsSlideshowActive]);

  // Pause other media playing in the background when slideshow starts
  useEffect(() => {
    if (isSlideshowActive) {
      setVideos(prev => prev.map(v => {
        if (v.id === focusedId) {
          const firstPath = v.realPath || v.url || '';
          if (!isValidPictureExtension(firstPath)) {
            return { ...v, playing: true };
          }
          return v;
        }
        return { ...v, playing: false };
      }));
    }
  }, [isSlideshowActive, focusedId, setVideos]);

  // Slideshow Notification & Immersive Trigger
  const wasSlideshowActiveRef = useRef(false);
  useEffect(() => {
    if (isSlideshowActive && !wasSlideshowActiveRef.current) {
      setImmersive(true);
      setToast("Slideshow started");
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      wasSlideshowActiveRef.current = true;
      return () => clearTimeout(timer);
    } else if (!isSlideshowActive && wasSlideshowActiveRef.current) {
      setImmersive(false);
      wasSlideshowActiveRef.current = false;
    }
  }, [isSlideshowActive, setImmersive, setToast]);

  // Slideshow Auto-Focus Trigger
  useEffect(() => {
    if (isSlideshowActive && !focusedId && filtered.length > 0) {
      const firstItem = filtered[0];
      setFocusedId(firstItem.id);
      setImmersive(true);
      const firstPath = firstItem.realPath || firstItem.url || '';
      if (!isValidPictureExtension(firstPath)) {
        setVideos(prev => prev.map(v => v.id === firstItem.id ? { ...v, playing: true, currentTime: 0 } : v));
      }
      addLog(`Slideshow: Starting fullscreen slideshow with [${firstItem.title}]`);
    }
  }, [isSlideshowActive, focusedId, filtered, setFocusedId, setVideos, setImmersive, addLog]);

  // Slideshow Timer Effect
  useEffect(() => {
    if (!isSlideshowActive || !focusedId) return;
    if (!isFocusedImage || isFocusedVideo) return;

    const timer = setInterval(() => {
      handleNavigateSibling(1);
    }, Math.max(1, slideshowInterval) * 1000);

    return () => clearInterval(timer);
  }, [isSlideshowActive, focusedId, slideshowInterval, handleNavigateSibling, isFocusedImage, isFocusedVideo]);

  // Pre-Cache Engine
  const cachedAssetUrls = useMemo(() => {
    if (!focusedId) return [];

    const focusedVideo = videos.find(v => v.id === focusedId);
    if (!focusedVideo) return [];

    const urls: string[] = [];

    if (filtered.length > 1) {
      const currentIdx = filtered.findIndex(v => v.id === focusedId);
      if (currentIdx !== -1) {
        const indicesToCache = [
          (currentIdx - 2 + filtered.length) % filtered.length,
          (currentIdx - 1 + filtered.length) % filtered.length,
          (currentIdx + 1) % filtered.length,
          (currentIdx + 2) % filtered.length,
        ];
        indicesToCache.forEach(idx => {
          const video = filtered[idx];
          if (video) {
            const path = video.realPath || video.url;
            if (isValidPictureExtension(path)) {
              const url = convertToVideoUrl(video);
              if (url) urls.push(url);
            }
          }
        });
      }
    }

    if (focusedVideo.folderFiles && focusedVideo.folderFiles.length > 1) {
      const currentIdx = focusedVideo.currentIdx || 0;
      const folderFiles = focusedVideo.folderFiles;
      
      const subIndicesToCache = [
        (currentIdx - 2 + folderFiles.length) % folderFiles.length,
        (currentIdx - 1 + folderFiles.length) % folderFiles.length,
        (currentIdx + 1) % folderFiles.length,
        (currentIdx + 2) % folderFiles.length,
      ];
      
      subIndicesToCache.forEach(idx => {
        const file = folderFiles[idx];
        if (file) {
          const path = file.path || file.url;
          if (isValidPictureExtension(path)) {
            const url = toCosmoUrl(path);
            if (url) urls.push(url);
          }
        }
      });
    }

    return Array.from(new Set(urls));
  }, [focusedId, filtered, videos]);

  return {
    handleNavigateSibling,
    cachedAssetUrls
  };
}
