import { useState, useEffect, useRef, useMemo } from 'react';
import type { VideoItem } from '../types';
import { 
  isValidPictureExtension, 
  convertToVideoUrl, 
  toCosmoUrl 
} from '../utils/videoUtils';

interface UseSlideshowSyncParams {
  focusedId: string | null;
  filtered: VideoItem[];
  videos: VideoItem[];
  isFocusedImage: boolean;
  isFocusedVideo: boolean;
  slideshowInterval: number;
  setFocusedId: (id: string | null) => void;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  setImmersive: (val: boolean) => void;
  handleNavigateSibling: (dir: 1 | -1) => void;
  setToast: (m: string | null) => void;
  addLog: (m: string) => void;
}

export function useSlideshowSync({
  focusedId,
  filtered,
  videos,
  isFocusedImage,
  isFocusedVideo,
  slideshowInterval,
  setFocusedId,
  setVideos,
  setImmersive,
  handleNavigateSibling,
  setToast,
  addLog,
}: UseSlideshowSyncParams) {
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);

  // Reset slideshow if exiting Solo mode
  useEffect(() => {
    if (!focusedId) {
      setIsSlideshowActive(false);
    }
  }, [focusedId]);

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

  // Slideshow Timer Effect: Only applies to static images
  useEffect(() => {
    if (!isSlideshowActive || !focusedId) return;
    if (!isFocusedImage || isFocusedVideo) return;

    const timer = setInterval(() => {
      handleNavigateSibling(1);
    }, Math.max(1, slideshowInterval) * 1000);

    return () => clearInterval(timer);
  }, [isSlideshowActive, focusedId, slideshowInterval, handleNavigateSibling, isFocusedImage, isFocusedVideo]);

  // Pre-Cache Engine: Retrieves URLs for the next 2 and previous 2 images
  const cachedAssetUrls = useMemo(() => {
    if (!focusedId) return [];

    const currentVid = videos.find(v => v.id === focusedId);
    if (!currentVid) return [];

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

    if (currentVid.folderFiles && currentVid.folderFiles.length > 1) {
      const currentIdx = currentVid.currentIdx || 0;
      const folderFiles = currentVid.folderFiles;
      
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
    isSlideshowActive,
    setIsSlideshowActive,
    cachedAssetUrls,
  };
}
