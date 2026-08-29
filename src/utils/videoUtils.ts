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
    return `http://cosmo.localhost/${encodeURIComponent(realPath)}`;
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

/**
 * Safely sets an item in localStorage without throwing QuotaExceededError when data is large (e.g. 12MB datasets).
 */
export function safeSetLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[Storage Warning] localStorage quota exceeded for key '${key}' (${(value.length / 1024 / 1024).toFixed(2)} MB). Saved via Tauri disk persistence instead.`, err);
  }
}

/**
 * Normalizes any disk path or custom URL into a canonical lowercase forward-slash key
 * for 100% reliable deduplication across the entire application.
 */
export function normalizeMediaKey(urlOrPath: string): string {
  if (!urlOrPath) return '';
  const real = toRealPath(urlOrPath) || urlOrPath;
  return real
    .replace(/\x00/g, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Checks if a given media path/URL already exists anywhere in the active workspace.
 * Checks individual tiles, realPaths, displayUrls, and inside folder unit children.
 */
export function isMediaAlreadyInWorkspace(candidatePathOrUrl: string, videos: VideoItem[]): boolean {
  if (!candidatePathOrUrl || !videos || videos.length === 0) return false;
  const targetKey = normalizeMediaKey(candidatePathOrUrl);
  if (!targetKey) return false;

  for (const v of videos) {
    if (v.realPath && normalizeMediaKey(v.realPath) === targetKey) return true;
    if (v.url && normalizeMediaKey(v.url) === targetKey) return true;
    if (v.folderFiles && v.folderFiles.length > 0) {
      for (const f of v.folderFiles) {
        if (f.path && normalizeMediaKey(f.path) === targetKey) return true;
        if (f.url && normalizeMediaKey(f.url) === targetKey) return true;
      }
    }
  }
  return false;
}

/**
 * Smart Fuzzy Search & Scoring Algorithm
 * Supports:
 * - Direct substring matching (High Priority)
 * - Multi-token word matching in any order (e.g. "astrid boy" -> "Astrid S - Such A Boy")
 * - Decade/Era aliases (e.g. "70" -> "70s", "1970", "1970s", "seventies")
 * - Typo tolerance via Levenshtein edit distance
 * - Subsequence matching
 */
export function fuzzyMatchScore(target: string, query: string): number {
  if (!query || !target) return 0;
  
  const cleanTarget = target.toLowerCase().trim();
  const cleanQuery = query.toLowerCase().trim();

  // 1. Exact match
  if (cleanTarget === cleanQuery) return 10000;

  // 2. Starts with query
  if (cleanTarget.startsWith(cleanQuery)) return 5000;

  // 3. Exact Substring match
  if (cleanTarget.includes(cleanQuery)) {
    return 3000 + (cleanQuery.length / cleanTarget.length) * 500;
  }

  // 4. Era / Decade expansion (e.g. "70" <-> "70s", "1970", "1970s")
  const eraMap: Record<string, string[]> = {
    '70': ['70s', "70's", '1970', '1970s', 'seventies'],
    '70s': ['70', "70's", '1970', '1970s', 'seventies'],
    '80': ['80s', "80's", '1980', '1980s', 'eighties'],
    '80s': ['80', "80's", '1980', '1980s', 'eighties'],
    '90': ['90s', "90's", '1990', '1990s', 'nineties'],
    '90s': ['90', "90's", '1990', '1990s', 'nineties'],
    '00': ['00s', "00's", '2000', '2000s', 'two thousands'],
    '00s': ['00', "00's", '2000', '2000s', 'two thousands'],
    '60': ['60s', "60's", '1960', '1960s', 'sixties'],
    '60s': ['60', "60's", '1960', '1960s', 'sixties'],
  };

  const tokens = cleanQuery.split(/[\s,._\-+()[\]{}]+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  let allTokensMatched = true;
  let tokenScore = 0;

  for (const token of tokens) {
    let tokenFound = false;

    // Direct token substring
    if (cleanTarget.includes(token)) {
      tokenFound = true;
      tokenScore += 500;
    } else {
      // Era check
      const aliases = eraMap[token] || [];
      for (const alias of aliases) {
        if (cleanTarget.includes(alias)) {
          tokenFound = true;
          tokenScore += 450;
          break;
        }
      }
    }

    // Fuzzy token check (typo tolerance)
    if (!tokenFound && token.length >= 3) {
      const targetWords = cleanTarget.split(/[\s,._\-+()[\]{}]+/).filter(Boolean);
      for (const word of targetWords) {
        if (isFuzzyWordMatch(token, word)) {
          tokenFound = true;
          tokenScore += 250;
          break;
        }
      }
    }

    if (!tokenFound) {
      allTokensMatched = false;
      break;
    }
  }

  if (allTokensMatched) {
    return 1000 + tokenScore;
  }

  // 5. Subsequence Match Fallback (e.g. "dms" -> "dimash")
  if (cleanQuery.length >= 3 && isSubsequence(cleanQuery, cleanTarget)) {
    return 200 + cleanQuery.length * 10;
  }

  return 0;
}

function isFuzzyWordMatch(queryWord: string, targetWord: string): boolean {
  if (Math.abs(queryWord.length - targetWord.length) > 2) return false;
  const maxDistance = queryWord.length >= 6 ? 2 : 1;
  return levenshteinDistance(queryWord, targetWord) <= maxDistance;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function isSubsequence(sub: string, str: string): boolean {
  let subIdx = 0;
  for (let i = 0; i < str.length && subIdx < sub.length; i++) {
    if (str[i] === sub[subIdx]) {
      subIdx++;
    }
  }
  return subIdx === sub.length;
}