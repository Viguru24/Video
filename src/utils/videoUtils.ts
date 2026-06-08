import type { VideoItem } from '../types';
import { convertFileSrc } from '@tauri-apps/api/core';

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
};

/**
 * Convert a file path to a URL that can be used in video elements
 * Handles both local files (via Tauri's asset protocol), blobs and remote URLs
 * 
 * @param video - Video item containing url and optional realPath
 * @returns Converted URL string
 */
export function toCosmoUrl(absolutePathOrUrl: string): string {
  if (!absolutePathOrUrl) return '';

  // Try to resolve to a real path first in case we got passed a URL (like an old asset.localhost URL or cosmo:// URL)
  const resolvedPath = toRealPath(absolutePathOrUrl);
  const path = resolvedPath || absolutePathOrUrl;

  if (path.startsWith('http') || path.startsWith('asset:') || path.startsWith('cosmo:') || path.startsWith('blob:')) {
    // Migrate old cosmo:// or http://cosmo.localhost/ URLs to native asset protocol for development/CORS compliance
    if ((path.startsWith('cosmo://') || path.includes('cosmo.localhost/')) && isTauri()) {
      const cleanPath = toRealPath(path);
      if (cleanPath) {
        try {
          return convertFileSrc(cleanPath);
        } catch (e) {
          console.warn("Tauri convertFileSrc failed during migration:", e);
        }
      }
    }
    
    // Extra safety: if the unresolved path is a picture and starts with any protocol, format it
    if (isValidPictureExtension(path) && isTauri()) {
      try {
        return convertFileSrc(path);
      } catch (e) {
        // Fallback to path
      }
    }
    return path;
  }

  if (isTauri()) {
    try {
      // Route all media files through native asset protocol to bypass CORS and scheme blockers.
      // Built-in asset protocol natively supports progressive seeking and CORS in Tauri v2.
      return convertFileSrc(path);
    } catch (e) {
      console.warn("Tauri convertFileSrc failed, falling back to path:", e);
    }
  }
  return path;
}

/**
 * Convert any URL format back to a clean absolute disk path.
 * Handles: asset.localhost URLs, local://, cosmo://, http:// blob URLs, plain paths.
 * Returns null if a real path cannot be extracted (e.g. remote http URL).
 */
export function toRealPath(urlOrPath: string): string | null {
  if (!urlOrPath) return null;

  // Strip cache-busting query strings first
  const clean = urlOrPath.split('?')[0];

  // Already a plain absolute path (Windows or Unix)
  if (/^[A-Za-z]:[/\\]/.test(clean) || clean.startsWith('/')) return clean.replace(/\x00/g, '').trim();

  // local:// scheme — strip prefix
  if (clean.startsWith('local://')) {
    return decodeURIComponent(clean.slice('local://'.length)).replace(/\x00/g, '').trim();
  }

  // http://cosmo.localhost/ or https://cosmo.localhost/ format
  if (clean.includes('cosmo.localhost/')) {
    const encoded = clean.split('cosmo.localhost/')[1] || '';
    const withoutSubroute = encoded
      .replace(/^localhost[/\\]/i, '')
      .replace(/^media[/\\]/i, '')
      .replace(/^video[/\\]/i, '');
    return decodeURIComponent(withoutSubroute).replace(/\x00/g, '').trim();
  }

  // cosmo:// scheme — strip prefix
  if (clean.startsWith('cosmo://')) {
    const rawPath = clean.slice('cosmo://'.length);
    const withoutSubroute = rawPath
      .replace(/^localhost[/\\]/i, '')
      .replace(/^media[/\\]/i, '')
      .replace(/^video[/\\]/i, '');
    return decodeURIComponent(withoutSubroute).replace(/\x00/g, '').trim();
  }

  // Tauri asset protocol: http://asset.localhost/C%3A%5CPath%5Cfile.jpg
  if (clean.includes('asset.localhost/')) {
    const encoded = clean.split('asset.localhost/')[1] || '';
    const decoded = decodeURIComponent(encoded).replace(/\x00/g, '').trim();
    return decoded || null;
  }

  // Tauri asset protocol alternative: asset://localhost/... or asset://...
  if (clean.startsWith('asset://localhost/')) {
    const encoded = clean.slice('asset://localhost/'.length);
    const decoded = decodeURIComponent(encoded).replace(/\x00/g, '').trim();
    return decoded || null;
  }

  if (clean.startsWith('asset://')) {
    const encoded = clean.slice('asset://'.length);
    const decoded = decodeURIComponent(encoded).replace(/\x00/g, '').trim();
    return decoded || null;
  }

  // Unrecognised remote URL
  return null;
}

/**
 * Convert a file path to a URL that can be used in video elements
 * Handles both local files (via Tauri's asset protocol) and remote URLs
 *
 * @param video - Video item containing url and optional realPath
 * @returns Converted URL string
 */
export function convertToVideoUrl(video: Pick<VideoItem, 'url' | 'realPath'>): string {
  const path = toRealPath(video.realPath) || toRealPath(video.url);
  if (path) {
    return toCosmoUrl(path);
  }
  return video.url;
}

/**
 * Check if a file extension is a valid video format
 * Supports common video formats including MP4, WebM, MKV, MOV, etc.
 * 
 * @param path - File path to check
 * @returns true if the file has a valid video extension
 */
export function isValidVideoExtension(path: string): boolean {
  const cleanPath = path.split('?')[0].split('#')[0];
  const videoExts = ['mp4', 'webm', 'mkv', 'mov', 'm4v', 'avi', 'flv', 'wmv', 'asf', '3gp'];
  const ext = cleanPath.split('.').pop()?.toLowerCase();
  return ext ? videoExts.includes(ext) : false;
}

/**
 * Check if a file extension is a valid picture format
 */
export function isValidPictureExtension(path: string): boolean {
  const cleanPath = path.split('?')[0].split('#')[0];
  const picExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff'];
  const ext = cleanPath.split('.').pop()?.toLowerCase();
  return ext ? picExts.includes(ext) : false;
}

/**
 * Check if a file extension is valid based on the current mode
 */
export function isValidMediaExtension(path: string, mode: 'video' | 'picture'): boolean {
  return mode === 'video' ? isValidVideoExtension(path) : isValidPictureExtension(path);
}

/**
 * Extract filename from a file path
 * Handles both Windows and Unix-style paths
 * 
 * @param path - Full file path
 * @returns Filename without directory path, or 'Video' if extraction fails
 */
export function getFileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || 'Video';
}

/**
 * Shows a confirmation dialog. Falls back to window.confirm in non-Tauri or error environments.
 */
export async function showConfirm(
  message: string,
  options?: { title?: string; kind?: 'info' | 'warning' | 'error' }
): Promise<boolean> {
  if (typeof window !== 'undefined' && (window as any).__customConfirmHandler) {
    return (window as any).__customConfirmHandler(message, options);
  }
  if (isTauri()) {
    try {
      const { confirm } = await import('@tauri-apps/plugin-dialog');
      return await confirm(message, options);
    } catch (e) {
      console.warn("Tauri confirm failed, falling back to window.confirm:", e);
    }
  }
  return window.confirm(message);
}

/**
 * Normalize a path for comparison on Windows (convert backslashes to forward slashes, lowercase, and trim)
 */
export function normalizePath(path: string | null | undefined): string {
  if (!path) return '';
  return path.trim().replace(/\\/g, '/').toLowerCase();
}

/**
 * Compare two file paths robustly on Windows
 */
export function pathsEqual(path1: string | null | undefined, path2: string | null | undefined): boolean {
  if (!path1 || !path2) return false;
  return normalizePath(path1) === normalizePath(path2);
}