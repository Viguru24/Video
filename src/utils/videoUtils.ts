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
export function toCosmoUrl(absolutePath: string): string {
  if (absolutePath.startsWith('http') || absolutePath.startsWith('asset:') || absolutePath.startsWith('blob:')) return absolutePath;
  if (isTauri()) {
    try {
      return convertFileSrc(absolutePath);
    } catch (e) {
      console.warn("Tauri convertFileSrc failed, falling back to absolutePath:", e);
    }
  }
  return absolutePath;
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

  // cosmo:// scheme — strip prefix
  if (clean.startsWith('cosmo://')) {
    return decodeURIComponent(clean.slice('cosmo://'.length)).replace(/\x00/g, '').trim();
  }

  // Tauri asset protocol: http://asset.localhost/C%3A%5CPath%5Cfile.jpg
  if (clean.includes('asset.localhost/')) {
    const encoded = clean.split('asset.localhost/')[1] || '';
    const decoded = decodeURIComponent(encoded).replace(/\x00/g, '').trim();
    // On Windows the path starts with a drive letter after decoding
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
  if (video.realPath) {
    return toCosmoUrl(video.realPath);
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