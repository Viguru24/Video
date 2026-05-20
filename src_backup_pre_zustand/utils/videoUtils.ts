import type { VideoItem } from '../types';
import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Convert a file path to a URL that can be used in video elements
 * Handles both local files (via Tauri's asset protocol) and remote URLs
 * 
 * @param video - Video item containing url and optional realPath
 * @returns Converted URL string
 */
export function toCosmoUrl(absolutePath: string): string {
  if (absolutePath.startsWith('http') || absolutePath.startsWith('asset:')) return absolutePath;
  return convertFileSrc(absolutePath);
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
    const cosmo = toCosmoUrl(video.realPath);
    console.log(`[videoUtils] Converting realPath ${video.realPath} to ${cosmo}`);
    return cosmo;
  }
  console.log(`[videoUtils] No realPath, returning url: ${video.url}`);
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
  const videoExts = ['mp4', 'webm', 'mkv', 'mov', 'm4v', 'avi', 'flv', 'wmv', 'asf', '3gp'];
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? videoExts.includes(ext) : false;
}

/**
 * Check if a file extension is a valid picture format
 */
export function isValidPictureExtension(path: string): boolean {
  const picExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff'];
  const ext = path.split('.').pop()?.toLowerCase();
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