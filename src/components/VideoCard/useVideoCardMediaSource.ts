import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { convertToVideoUrl, isTauri, toRealPath } from '../../utils/videoUtils';
import type { VideoItem } from '../../types';
import {
  buildFallbackMediaUrl,
  classifyLocalMediaFailure,
  classifyNonLocalMediaFailure,
  type DrivePathStatus,
  type MediaLoadErrorInfo,
} from './mediaErrorUtils';

export interface UseVideoCardMediaSourceProps {
  video: VideoItem;
  onLog?: (msg: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const EXISTING_LOCAL_RETRY_DELAYS_MS = [150, 500, 1000] as const;
const REMOTE_RETRY_DELAYS_MS = [300, 900] as const;

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
  const driveStatusRef = useRef<DrivePathStatus | null>(null);
  const sourceTokenRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const [customProtocolOverride, setCustomProtocolOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<MediaLoadErrorInfo | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (mediaRetryTimerRef.current) {
      clearTimeout(mediaRetryTimerRef.current);
      mediaRetryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      sourceTokenRef.current += 1;
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  // Reset retry state and fallbacks when media source changes
  useEffect(() => {
    sourceTokenRef.current += 1;
    mediaRetryCountRef.current = 0;
    driveStatusRef.current = null;
    clearRetryTimer();
    setIsSyncingOrRecovering(false);
    setCustomProtocolOverride(null);
    setImageFallbackSrc(null);
    setError(null);
    setErrorInfo(null);
  }, [video.id, video.realPath, video.url, clearRetryTimer]);

  // DYNAMIC QUALITY ENGINE (v4) — Native Asset Protocol + Resilient Fallbacks
  const displayUrl = useMemo(() => {
    if (customProtocolOverride) {
      return customProtocolOverride;
    }
    const url = convertToVideoUrl(video);
    let busted = url;
    if (reloadKey > 0) {
      busted = `${url}${url.includes('?') ? '&' : '?'}t=${reloadKey}`;
    } else if (video.url && video.url.includes('?t=')) {
      const tParam = video.url.split('?t=')[1];
      busted = `${url}${url.includes('?') ? '&' : '?'}t=${tParam}`;
    }
    return busted;
  }, [video, reloadKey, customProtocolOverride]);

  const effectiveImgSrc = imageFallbackSrc || displayUrl;

  const commitFinalFailure = useCallback((info: MediaLoadErrorInfo) => {
    clearRetryTimer();
    setIsSyncingOrRecovering(false);
    setError(info.code);
    setErrorInfo(info);
    onLog?.(`Unit [${video.title}] Error: ${info.code}${info.filePath ? ` (${info.filePath})` : ''}`);
  }, [clearRetryTimer, video.title, onLog]);

  const scheduleFallbackRetry = useCallback((
    type: 'video' | 'audio' | 'image',
    rawPath: string | null,
    useCosmoProtocol: boolean,
    delayMs: number,
    token: number
  ) => {
    clearRetryTimer();
    mediaRetryTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current || sourceTokenRef.current !== token) {
        return;
      }
      const now = Date.now();
      setReloadKey(now);

      if (rawPath && isTauri()) {
        const nextUrl = buildFallbackMediaUrl(rawPath, useCosmoProtocol, now, convertFileSrc);
        if (type === 'image') {
          setImageFallbackSrc(nextUrl);
        } else {
          setCustomProtocolOverride(nextUrl);
        }
      }

      if (type !== 'image' && videoRef.current) {
        try {
          videoRef.current.load();
        } catch { /* ignore media reload failure */ }
      }
    }, delayMs);
  }, [clearRetryTimer, videoRef]);

  const handleMediaSuccess = useCallback(() => {
    clearRetryTimer();
    mediaRetryCountRef.current = 0;
    driveStatusRef.current = null;
    setIsSyncingOrRecovering(false);
    setError(null);
    setErrorInfo(null);
  }, [clearRetryTimer]);

  const handleMediaError = useCallback((type: 'video' | 'audio' | 'image' = 'video') => {
    const rawPath = toRealPath(video.realPath) || toRealPath(video.url);
    const attempt = mediaRetryCountRef.current + 1;
    mediaRetryCountRef.current = attempt;
    const token = sourceTokenRef.current;

    const isDemoPath =
      rawPath?.startsWith('/demos/') ||
      rawPath?.startsWith('demos/') ||
      video.url?.startsWith('/demos/') ||
      video.url?.startsWith('demos/');
    const isLocalDiskPath = !!rawPath && isTauri() && !isDemoPath;

    if (isLocalDiskPath && rawPath) {
      setIsSyncingOrRecovering(true);
      setError(null);
      setErrorInfo(null);

      const handleLocalStatus = (status: DrivePathStatus) => {
        if (!isMountedRef.current || sourceTokenRef.current !== token) {
          return;
        }
        driveStatusRef.current = status;

        if (!status.drive_accessible && status.drive_root) {
          commitFinalFailure(classifyLocalMediaFailure(status, rawPath, video.title));
          return;
        }

        if (!status.exists) {
          // Only videos support `.temp.mp4` fallback via cosmo.localhost; give one fast attempt for that
          if (type === 'video' && attempt === 1) {
            scheduleFallbackRetry(type, rawPath, true, 150, token);
            return;
          }
          commitFinalFailure(classifyLocalMediaFailure(status, rawPath, video.title));
          return;
        }

        if (attempt <= EXISTING_LOCAL_RETRY_DELAYS_MS.length) {
          const delay = EXISTING_LOCAL_RETRY_DELAYS_MS[attempt - 1];
          const useCosmoProtocol = attempt % 2 === 1;
          scheduleFallbackRetry(type, rawPath, useCosmoProtocol, delay, token);
          return;
        }

        commitFinalFailure(classifyLocalMediaFailure(status, rawPath, video.title));
      };

      if (driveStatusRef.current) {
        handleLocalStatus(driveStatusRef.current);
        return;
      }

      invoke<DrivePathStatus>('check_path_drive_status', { path: rawPath })
        .then(handleLocalStatus)
        .catch(() => {
          if (!isMountedRef.current || sourceTokenRef.current !== token) {
            return;
          }
          if (attempt <= REMOTE_RETRY_DELAYS_MS.length) {
            scheduleFallbackRetry(type, rawPath, attempt % 2 === 1, REMOTE_RETRY_DELAYS_MS[attempt - 1], token);
            return;
          }
          commitFinalFailure(classifyNonLocalMediaFailure(video.title, rawPath));
        });
      return;
    }

    if (attempt <= REMOTE_RETRY_DELAYS_MS.length) {
      setIsSyncingOrRecovering(true);
      setError(null);
      setErrorInfo(null);
      scheduleFallbackRetry(type, rawPath, false, REMOTE_RETRY_DELAYS_MS[attempt - 1], token);
      return;
    }

    commitFinalFailure(classifyNonLocalMediaFailure(video.title, rawPath || video.url));
  }, [
    video.realPath,
    video.url,
    video.title,
    commitFinalFailure,
    scheduleFallbackRetry,
  ]);

  const handleManualRetry = useCallback(() => {
    sourceTokenRef.current += 1;
    clearRetryTimer();
    mediaRetryCountRef.current = 0;
    driveStatusRef.current = null;
    setError(null);
    setErrorInfo(null);
    setIsSyncingOrRecovering(true);
    setCustomProtocolOverride(null);
    setImageFallbackSrc(null);
    const now = Date.now();
    setReloadKey(now);
    setTimeout(() => {
      if (isMountedRef.current && videoRef.current) {
        try {
          videoRef.current.load();
        } catch { /* ignore manual media reload failure */ }
      }
    }, 50);
  }, [clearRetryTimer, videoRef]);

  const handleImageError = useCallback(() => {
    handleMediaError('image');
  }, [handleMediaError]);

  return {
    reloadKey,
    setReloadKey,
    error,
    errorInfo,
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
