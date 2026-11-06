import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isValidMediaExtension } from '../../utils/videoUtils';
import { normalizeTimestamp } from '../../utils/sortUtils';
import type { BrowserItem } from './BrowserItemCard';

export interface UseBrowserDirectoryProps {
  inAppBrowserPath: string;
  showInAppBrowser: boolean;
  mediaFilter: 'all' | 'video' | 'picture';
  searchQuery: string;
  sortBy: 'name' | 'date' | 'size';
  sortOrder: 'asc' | 'desc';
  limit: number;
}

export function useBrowserDirectory({
  inAppBrowserPath,
  showInAppBrowser,
  mediaFilter,
  searchQuery,
  sortBy,
  sortOrder,
  limit
}: UseBrowserDirectoryProps) {
  const [items, setItems] = useState<BrowserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedPathsRef = useRef<Set<string>>(new Set());

  // Compute media counts for the current directory
  const mediaCounts = useMemo(() => {
    let videos = 0;
    let pictures = 0;
    let dirs = 0;
    for (const item of items) {
      if (item.is_dir) {
        dirs++;
      } else if (isValidMediaExtension(item.path, 'video')) {
        videos++;
      } else if (isValidMediaExtension(item.path, 'picture')) {
        pictures++;
      }
    }
    return {
      all: videos + pictures,
      video: videos,
      picture: pictures,
      dirs
    };
  }, [items]);

  // Filter items by active media filter (video / picture / all) and search query
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter(item => {
      if (query && !item.name.toLowerCase().includes(query)) {
        return false;
      }
      if (item.is_dir) return true;
      if (mediaFilter === 'video') {
        return isValidMediaExtension(item.path, 'video');
      }
      if (mediaFilter === 'picture') {
        return isValidMediaExtension(item.path, 'picture');
      }
      return item.is_media;
    });
  }, [items, mediaFilter, searchQuery]);

  const sortedItems = useMemo(() => {
    const dirs = filteredItems.filter(x => x.is_dir);
    const files = filteredItems.filter(x => !x.is_dir);

    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    files.sort((a: any, b: any) => {
      const nameCompare = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = nameCompare;
      } else if (sortBy === 'date') {
        const timeA = normalizeTimestamp(a.modified) || normalizeTimestamp(a.created);
        const timeB = normalizeTimestamp(b.modified) || normalizeTimestamp(b.created);
        comparison = timeA - timeB;
      } else if (sortBy === 'size') {
        comparison = (a.size || 0) - (b.size || 0);
      }
      if (comparison === 0) {
        return sortOrder === 'asc' ? nameCompare : -nameCompare;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return [...dirs, ...files];
  }, [filteredItems, sortBy, sortOrder]);

  const visibleItems = useMemo(() => {
    return sortedItems.slice(0, limit);
  }, [sortedItems, limit]);

  const loadContents = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<BrowserItem[]>('list_directory_contents', { dirPath: path });
      const filtered = result.filter(item => item.is_dir || item.is_media);
      loadedPathsRef.current = new Set(filtered.map(x => x.path));
      setItems(filtered);
    } catch (err: any) {
      console.error("Failed to load directory contents:", err);
      setError(err.toString());
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showInAppBrowser && inAppBrowserPath) {
      loadContents(inAppBrowserPath);
    }
  }, [showInAppBrowser, inAppBrowserPath, loadContents]);

  // Tell Rust to watch the directory when the viewed path changes
  useEffect(() => {
    if (showInAppBrowser && inAppBrowserPath) {
      invoke('watch_directory', { dirPath: inAppBrowserPath }).catch(err => {
        console.error("Failed to watch directory:", err);
      });
    }
  }, [showInAppBrowser, inAppBrowserPath]);

  // Listen to directory mutation events from Rust
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isActive = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const setupListener = async () => {
      const unlistenFn = await listen<string>('directory-changed', (event) => {
        if (isActive && event.payload === inAppBrowserPath) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (isActive) {
              loadContents(inAppBrowserPath);
            }
          }, 350);
        }
      });
      if (isActive) {
        unsubscribe = unlistenFn;
      } else {
        unlistenFn();
      }
    };

    if (showInAppBrowser && inAppBrowserPath) {
      setupListener();
    }

    return () => {
      isActive = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [showInAppBrowser, inAppBrowserPath, loadContents]);

  return {
    items,
    loading,
    error,
    mediaCounts,
    filteredItems,
    sortedItems,
    visibleItems,
    loadContents
  };
}
