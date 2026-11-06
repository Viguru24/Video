import { useMemo } from 'react';
import type { VideoItem, MediaFilterMode, SortOrder, ColorTag } from '../types';
import { isValidMediaExtension, fuzzyMatchScore } from '../utils/videoUtils';
import { sortVideoItems } from '../utils/sortUtils';

interface UseFilteredVideosParams {
  videos: VideoItem[];
  mediaMode: MediaFilterMode;
  search: string;
  sortOrder: SortOrder;
  colorTagFilter?: ColorTag | 'all' | 'untagged' | null;
}

export function useFilteredVideos({ videos, mediaMode, search, sortOrder, colorTagFilter }: UseFilteredVideosParams) {
  const activeGridFolders = useMemo(() => {
    const folders = new Set<string>();
    videos.forEach(v => {
      if (v.folderFiles && v.folderFiles.length > 0) {
        if (v.realPath) folders.add(v.realPath);
      } else {
        const path = v.realPath || '';
        const separator = path.includes('\\') ? '\\' : '/';
        const lastSlashIdx = path.lastIndexOf(separator);
        if (lastSlashIdx !== -1) {
          folders.add(path.substring(0, lastSlashIdx));
        }
      }
    });
    return Array.from(folders);
  }, [videos]);

  const filtered = useMemo(() => {
    if (!Array.isArray(videos)) return [];
    const isValid = (v: VideoItem) => {
      const p = v.realPath || v.url;
      const mediaValid = p ? isValidMediaExtension(p, mediaMode) : true;
      if (!mediaValid) return false;

      if (colorTagFilter && colorTagFilter !== 'all') {
        if (colorTagFilter === 'untagged') {
          if (v.colorTag) return false;
        } else {
          if (v.colorTag !== colorTagFilter) return false;
        }
      }
      return true;
    };
    
    const query = (search || '').trim();

    if (query) {
      const scored: { item: VideoItem; score: number }[] = [];
      for (const v of videos) {
        if (!isValid(v)) continue;
        const target = `${v.title || ''} ${v.realPath || ''} ${v.url || ''}`;
        const score = fuzzyMatchScore(target, query);
        if (score > 0) {
          scored.push({ item: v, score });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.map(s => s.item);
    }

    const items = videos.filter(isValid);
    return sortVideoItems(items, sortOrder);
  }, [videos, search, mediaMode, sortOrder, colorTagFilter]);

  return {
    activeGridFolders,
    filtered,
  };
}
