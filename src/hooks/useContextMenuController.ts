import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { 
  isValidPictureExtension, 
  getFileNameFromPath, 
  toRealPath 
} from '../utils/videoUtils';

interface UseContextMenuControllerProps {
  videos: VideoItem[];
  focusedId: string | null;
}

export function useContextMenuController({
  videos,
  focusedId
}: UseContextMenuControllerProps) {
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [menuMetadata, setMenuMetadata] = useState<any | null>(null);
  const metadataCache = useRef<Record<string, any>>({});

  const getInstantMetadata = useCallback((video: VideoItem) => {
    const effectivePath = (video.folderFiles && video.currentIdx !== undefined)
      ? video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url
      : video.realPath || video.url;

    const pathClean = effectivePath || video.url || '';
    if (metadataCache.current[pathClean]) {
      return metadataCache.current[pathClean];
    }

    const ext = pathClean.split('?')[0].split('.').pop() || 'MEDIA';
    const isImg = isValidPictureExtension(pathClean);

    let domW = video.width || 0;
    let domH = video.height || 0;
    if (!domW || !domH) {
      const mediaEl = document.querySelector(`[data-id="${video.id}"] img, [data-id="${video.id}"] video, .solo-container .media-wrapper img, .solo-container .media-wrapper video`) as HTMLImageElement | HTMLVideoElement | null;
      if (mediaEl) {
        const isVid = mediaEl.tagName.toLowerCase() === 'video';
        domW = isVid ? (mediaEl as HTMLVideoElement).videoWidth : (mediaEl as HTMLImageElement).naturalWidth;
        domH = isVid ? (mediaEl as HTMLVideoElement).videoHeight : (mediaEl as HTMLImageElement).naturalHeight;
      }
    }

    return {
      name: (video.folderFiles && video.currentIdx !== undefined)
        ? (video.folderFiles[video.currentIdx]?.name || video.title)
        : (video.title || getFileNameFromPath(pathClean)),
      format: ext.toUpperCase(),
      size: video.size ? (video.size < 1024 * 1024 ? `${(video.size / 1024).toFixed(1)} KB` : `${(video.size / (1024 * 1024)).toFixed(1)} MB`) : 'Standard',
      width: domW || undefined,
      height: domH || undefined,
      duration: isImg ? 'Static' : undefined,
      path: pathClean
    };
  }, []);

  const fetchMenuMetadata = useCallback(async (video: VideoItem) => {
    const effectivePath = (video.folderFiles && video.currentIdx !== undefined)
      ? video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url
      : video.realPath || video.url;

    const pathClean = effectivePath || video.url || '';
    const isImg = isValidPictureExtension(pathClean);

    const initialMeta = getInstantMetadata(video);
    setMenuMetadata(initialMeta);

    if (pathClean && !metadataCache.current[pathClean]) {
      if (pathClean.startsWith('/demos/')) {
        const demoMeta = {
          ...initialMeta,
          width: 1920,
          height: 1080,
          duration: isImg ? 'Static' : '0:05',
          size: isImg ? '110 KB' : '500 KB'
        };
        metadataCache.current[pathClean] = demoMeta;
        setMenuMetadata(demoMeta);
      } else {
        try {
          const targetPath = toRealPath(pathClean) || pathClean;
          const data = await invoke<any>('get_video_metadata', { path: targetPath });
          if (data) {
            metadataCache.current[pathClean] = data;
            setMenuMetadata((curr: any) => ({
              ...curr,
              ...data,
              width: data.width || curr?.width,
              height: data.height || curr?.height
            }));
          }
        } catch (e: any) {
          console.error("Failed to fetch metadata", e);
        }
      }
    }
  }, [getInstantMetadata]);

  const handleContext = useCallback(async (id: string, x: number, y: number) => {
    const video = videos.find(v => v.id === id);
    if (!video) {
      setMenu({ x, y, id });
      setMenuMetadata(null);
      return;
    }

    const instant = getInstantMetadata(video);
    setMenuMetadata(instant);
    setMenu({ x, y, id });
    await fetchMenuMetadata(video);
  }, [videos, getInstantMetadata, fetchMenuMetadata]);

  const activeSoloVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
  const activeSoloKey = activeSoloVideo 
    ? `${activeSoloVideo.id}_${activeSoloVideo.currentIdx ?? 0}_${activeSoloVideo.realPath ?? activeSoloVideo.url ?? ''}`
    : null;

  useEffect(() => {
    if (focusedId && menu && activeSoloVideo && menu.id !== focusedId) {
      setMenu(prev => prev ? { ...prev, id: focusedId } : null);
      fetchMenuMetadata(activeSoloVideo);
    }
  }, [activeSoloKey, focusedId, activeSoloVideo, menu, fetchMenuMetadata]);

  return {
    menu,
    setMenu,
    menuMetadata,
    setMenuMetadata,
    metadataCache,
    handleContext,
    getInstantMetadata,
    fetchMenuMetadata
  };
}
