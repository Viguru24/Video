import type { VideoItem, SortOption } from '../types';
import { isValidVideoExtension } from './videoUtils';

/**
 * Normalizes any timestamp (seconds or milliseconds, string or number) to milliseconds.
 * Returns 0 if invalid or non-positive.
 */
export function normalizeTimestamp(t?: number | string | null): number {
  if (!t) return 0;
  const num = typeof t === 'string' ? parseFloat(t) : t;
  if (isNaN(num) || num <= 0) return 0;
  // If timestamp is in seconds (e.g. 10 digits < 10000000000), convert to ms
  if (num < 10000000000) {
    return num * 1000;
  }
  return num;
}

/**
 * Compares two video items according to the given sort option.
 */
export function compareVideoItems(a: VideoItem, b: VideoItem, sortOrder: SortOption): number {
  if (sortOrder === 'custom') return 0;

  const nameCompare = (a.title || '').localeCompare(
    b.title || '',
    undefined,
    { numeric: true, sensitivity: 'base' }
  );

  let diff = 0;
  switch (sortOrder) {
    case 'videos-first': {
      const pathA = a.realPath || a.url || '';
      const pathB = b.realPath || b.url || '';
      const isVideoA = isValidVideoExtension(pathA);
      const isVideoB = isValidVideoExtension(pathB);
      if (isVideoA && !isVideoB) diff = -1;
      else if (!isVideoA && isVideoB) diff = 1;
      else diff = 0;
      break;
    }
    case 'pictures-first': {
      const pathA = a.realPath || a.url || '';
      const pathB = b.realPath || b.url || '';
      const isVideoA = isValidVideoExtension(pathA);
      const isVideoB = isValidVideoExtension(pathB);
      if (!isVideoA && isVideoB) diff = -1;
      else if (isVideoA && !isVideoB) diff = 1;
      else diff = 0;
      break;
    }
    case 'name-asc':
      diff = nameCompare;
      break;
    case 'name-desc':
      diff = -nameCompare;
      break;
    case 'size-asc':
      diff = (a.size || 0) - (b.size || 0);
      break;
    case 'size-desc':
      diff = (b.size || 0) - (a.size || 0);
      break;
    case 'modified-newest': {
      const timeA = normalizeTimestamp(a.modified) || normalizeTimestamp(a.created);
      const timeB = normalizeTimestamp(b.modified) || normalizeTimestamp(b.created);
      diff = timeB - timeA;
      break;
    }
    case 'modified-oldest': {
      const timeA = normalizeTimestamp(a.modified) || normalizeTimestamp(a.created);
      const timeB = normalizeTimestamp(b.modified) || normalizeTimestamp(b.created);
      diff = timeA - timeB;
      break;
    }
    case 'created-newest': {
      const timeA = normalizeTimestamp(a.created) || normalizeTimestamp(a.modified);
      const timeB = normalizeTimestamp(b.created) || normalizeTimestamp(b.modified);
      diff = timeB - timeA;
      break;
    }
    case 'created-oldest': {
      const timeA = normalizeTimestamp(a.created) || normalizeTimestamp(a.modified);
      const timeB = normalizeTimestamp(b.created) || normalizeTimestamp(b.modified);
      diff = timeA - timeB;
      break;
    }
    default:
      diff = 0;
  }

  // Stable sort tie-breaker
  if (diff === 0) {
    if (nameCompare === 0) {
      return (a.id || '').localeCompare(b.id || '');
    }
    // For descending and newest-first sorts, break ties with descending alphanumeric order
    const isDescending = sortOrder.endsWith('-desc') || sortOrder === 'modified-newest' || sortOrder === 'created-newest';
    return isDescending ? -nameCompare : nameCompare;
  }
  return diff;
}

/**
 * Returns a new array sorted by the specified SortOption.
 */
export function sortVideoItems(items: VideoItem[], sortOrder: SortOption): VideoItem[] {
  if (!items || items.length <= 1 || sortOrder === 'custom') return items;
  return [...items].sort((a, b) => compareVideoItems(a, b, sortOrder));
}
