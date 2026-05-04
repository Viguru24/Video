import { convertFileSrc } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';

/**
 * Convert a file path to a URL that can be used in video elements
 * Handles both local files (via Tauri's asset protocol) and remote URLs
 * 
 * @param video - Video item containing url and optional realPath
 * @returns Converted URL string
 */
export function convertToVideoUrl(video: Pick<VideoItem, 'url' | 'realPath'>): string {
  if (video.realPath) {
    return convertFileSrc(video.realPath);
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
  const videoExts = ['mp4', 'webm', 'mkv', 'mov', 'm4v', 'avi', 'flv', 'wmv', 'asf'];
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? videoExts.includes(ext) : false;
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