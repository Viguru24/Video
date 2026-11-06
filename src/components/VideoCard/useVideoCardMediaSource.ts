import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { convertToVideoUrl, isTauri, toRealPath } from '../../utils/videoUtils';
import type { VideoItem } from '../../types';

export interface UseVideoCardMediaSourceProps {
  video: VideoItem;
  onLog?: (msg: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function useVideoCardMediaSource({
  video,
  onLog,
  videoRef,
}: UseVideoCardMediaSourceProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [imageFallbackSrc, setImageFallbackSrc] = useState<string | null>(null);
  const [isSyncingOrRecovering, setIsSyncingOrRecovering] = useState<boolean>(false);
  const mediaRetryCountRef = useRef<number>(0);
  const mediaRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customProtocolOverride, setCustomProtocolOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset retry state and fallbacks when media source changes
  useEffect(() => {
    mediaRetryCountRef.current = 0;
    if (mediaRetryTimerRef.current) {
      clearTimeout(mediaRetryTimerRef.current);
      mediaRetryTimerRef.current = null;
    }
    setIsSyncingOrRecovering(false);
    setCustomProtocolOverride(null);
    setImageFallbackSrc(null);
    setError(null);
  }, [video.id, video.realPath, video.url]);

  // DYNAMIC QUALITY ENGINE (v4) — Native Asset Protocol + Resilient Fallbacks
  const displayUrl = useMemo(() => {
    if (customProtocolOverride) {
      return customProtocolOverride;
    }
    const url = convertToVideoUrl(video);
    let busted = url;
    if (video.url && video.url.includes('?t=')) {
      const tParam = video.url.split('?t=')[1];
      busted = `${url}${url.includes('?') ? '&' : '?'}t=${tParam}`;
    } else if (reloadKey > 0) {
      busted = `${url}${url.includes('?') ? '&' : '?'}t=${reloadKey}`;
    }
    return busted;
  }, [video.realPath, video.url, reloadKey, customProtocolOverride]);

  const effectiveImgSrc = imageFallbackSrc || displayUrl;

  const handleMediaSuccess = useCallback(() => {
    if (mediaRetryTimerRef.current) {
      clearTimeout(mediaRetryTimerRef.current);
      mediaRetryTimerRef.current = null;
    }
    mediaRetryCountRef.current = 0;
    setIsSyncingOrRecovering(false);
    setError(null);
  }, []);

  const handleMediaError = useCallback((type: 'video' | 'audio' | 'image' = 'video') => {
    const rawPath = toRealPath(video.realPath) || toRealPath(video.url);
    const attempt = mediaRetryCountRef.current + 1;
    mediaRetryCountRef.current = attempt;

    if (attempt <= 12) {
      setIsSyncingOrRecovering(true);
      setError(null);

      const delays = [400, 800, 1200, 1600, 2200, 3000, 3500, 4000, 5000, 5000, 5000, 5000];
      const delay = delays[Math.min(attempt - 1, delays.length - 1)];

      if (mediaRetryTimerRef.current) {
        clearTimeout(mediaRetryTimerRef.current);
      }

      mediaRetryTimerRef.current = setTimeout(() => {
        const now = Date.now();
        setReloadKey(now);

        if (rawPath && isTauri()) {
          if (attempt % 2 === 1) {
            const cosmoUrl = `http://cosmo.localhost/${encodeURIComponent(rawPath)}?t=${now}`;
            if (type === 'image') {
              setImageFallbackSrc(cosmoUrl);
            } else {
              setCustomProtocolOverride(cosmoUrl);
            }
          } else {
            const assetUrl = `${convertFileSrc(rawPath)}?t=${now}`;
            if (type === 'image') {
              setImageFallbackSrc(assetUrl);
            } else {
              setCustomProtocolOverride(assetUrl);
            }
          }
        }

        if (type !== 'image' && videoRef.current) {
          try {
            videoRef.current.load();
          } catch {}
        }
      }, delay);
      return;
    }

    setIsSyncingOrRecovering(false);
    setError("LOAD ERROR");
    onLog?.(`Unit [${video.title}] Error: LOAD ERROR after ${attempt} recovery attempts`);
  }, [video.realPath, video.url, video.title, onLog, videoRef]);

  const handleManualRetry = useCallback(() => {
    mediaRetryCountRef.current = 0;
    setError(null);
    setIsSyncingOrRecovering(true);
    setCustomProtocolOverride(null);
    setImageFallbackSrc(null);
    const now = Date.now();
    setReloadKey(now);
    setTimeout(() => {
      if (videoRef.current) {
        try {
          videoRef.current.load();
        } catch {}
      }
    }, 100);
  }, [videoRef]);

  const handleImageError = useCallback(() => {
    handleMediaError('image');
  }, [handleMediaError]);

  return {
    reloadKey,
    setReloadKey,
    error,
    setError,
    isSyncingOrRecovering,
    displayUrl,
    effectiveImgSrc,
    handleMediaSuccess,
    handleMediaError,
    handleManualRetry,
    handleImageError
  };
}
