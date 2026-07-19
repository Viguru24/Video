import type { VideoItem } from '../types';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';

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
  if (absolutePathOrUrl.startsWith('/demos/') || absolutePathOrUrl.startsWith('demos/')) {
    return absolutePathOrUrl;
  }

  const isLocalMigration = 
    absolutePathOrUrl.includes('cosmo.localhost/') || 
    absolutePathOrUrl.includes('asset.localhost/') || 
    absolutePathOrUrl.includes('tauri.localhost/') || 
    absolutePathOrUrl.startsWith('cosmo://') || 
    absolutePathOrUrl.startsWith('local://');

  if (!isLocalMigration) {
    if (absolutePathOrUrl.startsWith('blob:')) {
      return absolutePathOrUrl;
    }
    if (absolutePathOrUrl.startsWith('http://') || absolutePathOrUrl.startsWith('https://')) {
      return absolutePathOrUrl;
    }
  }

  const realPath = toRealPath(absolutePathOrUrl) || absolutePathOrUrl;

  if (isTauri()) {
    try {
      return convertFileSrc(realPath);
    } catch (e) {
      console.warn("Tauri convertFileSrc failed, falling back to path:", e);
    }
  }
  return realPath;
}

/**
 * Convert any URL format back to a clean absolute disk path.
 * Handles: asset.localhost URLs, local://, cosmo://, http:// blob URLs, plain paths.
 * Returns null if a real path cannot be extracted (e.g. remote http URL).
 */
export function toRealPath(urlOrPath: string): string | null {
  if (!urlOrPath) return null;
  const clean = urlOrPath.split('?')[0];
  if (clean.startsWith('/demos/') || clean.startsWith('demos/')) {
    const appDataDir = localStorage.getItem('cosmo-app-data-dir');
    if (appDataDir) {
      const parts = clean.split('/');
      const filename = parts[parts.length - 1];
      const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent || '');
      const separator = isWindows ? '\\' : '/';
      return `${appDataDir}${separator}demos${separator}${filename}`;
    }
    return null;
  }

  if (/^[A-Za-z]:[/\\]/.test(clean) || clean.startsWith('/')) return clean.replace(/\x00/g, '').trim();

  if (clean.startsWith('local://')) {
    try {
      return decodeURIComponent(clean.slice('local://'.length)).replace(/\x00/g, '').trim();
    } catch {
      return null;
    }
  }

  if (clean.includes('cosmo.localhost/')) {
    const encoded = clean.split('cosmo.localhost/')[1] || '';
    const withoutSubroute = encoded
      .replace(/^localhost[/\\]/i, '')
      .replace(/^media[/\\]/i, '')
      .replace(/^video[/\\]/i, '');
    try {
      return decodeURIComponent(withoutSubroute).replace(/\x00/g, '').trim();
    } catch {
      return null;
    }
  }

  if (clean.startsWith('cosmo://')) {
    const rawPath = clean.slice('cosmo://'.length);
    const withoutSubroute = rawPath
      .replace(/^localhost[/\\]/i, '')
      .replace(/^media[/\\]/i, '')
      .replace(/^video[/\\]/i, '');
    try {
      return decodeURIComponent(withoutSubroute).replace(/\x00/g, '').trim();
    } catch {
      return null;
    }
  }

  if (clean.includes('asset.localhost/')) {
    const encoded = clean.split('asset.localhost/')[1] || '';
    try {
      const decoded = decodeURIComponent(encoded).replace(/\x00/g, '').trim();
      return decoded || null;
    } catch {
      return null;
    }
  }

  if (clean.includes('tauri.localhost/')) {
    const encoded = clean.split('tauri.localhost/')[1] || '';
    try {
      const decoded = decodeURIComponent(encoded).replace(/\x00/g, '').trim();
      return decoded || null;
    } catch {
      return null;
    }
  }

  if (clean.startsWith('asset://localhost/')) {
    const encoded = clean.slice('asset://localhost/'.length);
    try {
      const decoded = decodeURIComponent(encoded).replace(/\x00/g, '').trim();
      return decoded || null;
    } catch {
      return null;
    }
  }

  if (clean.startsWith('asset://')) {
    const encoded = clean.slice('asset://'.length);
    try {
      const decoded = decodeURIComponent(encoded).replace(/\x00/g, '').trim();
      return decoded || null;
    } catch {
      return null;
    }
  }

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
  const videoExts = ['mp4', 'webm', 'mkv', 'mov', 'm4v', 'avi', 'flv', 'wmv', 'asf', '3gp',
                     'ts', 'mts', 'm2ts', 'vob', 'mpg', 'mpeg', 'ogv', 'divx', 'rm', 'rmvb'];
  const ext = cleanPath.split('.').pop()?.toLowerCase();
  return ext ? videoExts.includes(ext) : false;
}

/**
 * Check if a file extension is a valid picture format
 */
export function isValidPictureExtension(path: string): boolean {
  const cleanPath = path.split('?')[0].split('#')[0];
  const picExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff',
                   'heic', 'heif', 'avif', 'jxl', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'tga'];
  const ext = cleanPath.split('.').pop()?.toLowerCase();
  return ext ? picExts.includes(ext) : false;
}

/**
 * Check if a file extension is valid based on the current mode
 */
export function isValidMediaExtension(path: string, mode: 'all' | 'video' | 'picture'): boolean {
  if (mode === 'all') {
    return isValidVideoExtension(path) || isValidPictureExtension(path);
  }
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

// ─── Native formats: Cosmo can display these directly, no conversion needed ────
export const NATIVE_IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff',
]);
export const NATIVE_VIDEO_EXTS = new Set([
  'mp4', 'webm', 'mov', 'm4v',
]);

/** Returns true if the file must be converted before Cosmo can display it */
export function requiresConversion(path: string, isVideo: boolean): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return isVideo ? !NATIVE_VIDEO_EXTS.has(ext) : !NATIVE_IMAGE_EXTS.has(ext);
}

/**
 * Converts a non-native media file to PNG (image) or MP4 (video) via the Rust backend.
 * Returns the converted file path on success, or the original path as a fallback.
 */
export async function maybeConvertMedia(
  path: string,
  isVideo: boolean,
  addLog: (msg: string) => void,
): Promise<string> {
  if (!requiresConversion(path, isVideo)) return path;
  try {
    const ext = path.split('.').pop()?.toUpperCase() ?? '';
    const target = isVideo ? 'MP4' : 'PNG';
    addLog(`System: Converting ${ext} → ${target}: ${getFileNameFromPath(path)}`);
    const newPath = await invoke<string>('convert_media_to_standard', {
      srcPath: path,
      mediaType: isVideo ? 'video' : 'image',
    });
    addLog(`System: ✓ Saved as ${getFileNameFromPath(newPath)}`);
    return newPath;
  } catch (e) {
    addLog(`System: Conversion failed for ${getFileNameFromPath(path)}: ${e}`);
    return path; // graceful fallback — show in grid even if unconverted
  }
}

/**
 * Extract clean base prefix by stripping trailing sequential numbers,
 * crop suffixes, and upscale suffixes recursively.
 */
export function extractBasePrefix(name: string): string {
  let current = name;
  while (true) {
    const prevLen = current.length;
    
    // Strip trailing _NNN
    current = current.replace(/_(\d+)$/, '');
    
    // Strip trailing NNN directly (e.g. Isabel0001 -> Isabel)
    current = current.replace(/(\d+)$/, '');
    
    // Strip trailing _crop or _upscaled or _upscale (case insensitive)
    current = current.replace(/_crop$/i, '');
    current = current.replace(/_upscaled$/i, '');
    current = current.replace(/_upscale$/i, '');
    
    // Strip trailing underscore if left over
    current = current.replace(/_$/, '');

    if (current.length === prevLen) {
      break;
    }
  }
  return current;
}

/**
 * Trigger popout player window for a given media asset.
 */
export async function triggerPopOut(path: string, title: string): Promise<void> {
  if (!isTauri()) {
    // Web fallback
    const encodedUrl = encodeURIComponent(path);
    const win = window.open(`?popout=true&url=${encodedUrl}`, `pop-${Date.now()}`, 'width=850,height=500,resizable=yes,noopener,noreferrer');
    if (win) {
      win.focus();
    }
    return;
  }
  
  localStorage.setItem('cosmo-popout-active-url', path);
  localStorage.setItem('cosmo-popout-active-title', title);
  await invoke('pop_out', { url: path, title });
}

/**
 * Generate a cryptographically secure UUID (v4) if supported by the browser,
 * otherwise fall back to a robust pseudo-random UUID generator.
 * This prevents runtime crashes in contexts where `crypto.randomUUID` is undefined
 * (e.g. non-secure origins under WebView2 / packaged MSIX container).
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('').replace(
      /^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'
    );
  }
  // Final Math.random fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}