import { useRef, useCallback, useEffect } from 'react';
import type { VideoItem } from '../types';

interface UseSelectionManagerParams {
  videos: VideoItem[];
  filtered: VideoItem[];
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectionMode: boolean;
  setSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  addLog: (m: string) => void;
}

export function useSelectionManager({
  videos,
  filtered,
  selectedIds,
  setSelectedIds,
  selectionMode,
  setSelectionMode,
  addLog,
}: UseSelectionManagerParams) {
  const lastSelectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedIds.size === 0) {
      lastSelectedIdRef.current = null;
    }
  }, [selectedIds]);

  useEffect(() => {
    setSelectedIds(prev => {
      const validIds = new Set(videos.map(v => v.id));
      const hasStale = Array.from(prev).some(id => !validIds.has(id));
      if (hasStale) {
        return new Set(Array.from(prev).filter(id => validIds.has(id)));
      }
      return prev;
    });
  }, [videos, setSelectedIds]);

  const toggleSelect = useCallback((id: string, shiftKey?: boolean, ctrlKey?: boolean) => {
    setSelectedIds(prev => {
      let next = new Set(prev);

      if (shiftKey && lastSelectedIdRef.current && filtered.some(v => v.id === lastSelectedIdRef.current)) {
        const anchorIdx = filtered.findIndex(v => v.id === lastSelectedIdRef.current);
        const currentIdx = filtered.findIndex(v => v.id === id);
        if (anchorIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(anchorIdx, currentIdx);
          const end = Math.max(anchorIdx, currentIdx);
          const rangeIds = filtered.slice(start, end + 1).map(v => v.id);

          if (ctrlKey) {
            rangeIds.forEach(rid => next.add(rid));
          } else {
            next = new Set(rangeIds);
          }
          setSelectionMode(next.size > 0);
          return next;
        }
      }

      lastSelectedIdRef.current = id;

      if (ctrlKey) {
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      } else {
        next = new Set([id]);
      }

      setSelectionMode(next.size > 0);
      return next;
    });
  }, [filtered, setSelectedIds, setSelectionMode]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const allSelected = filtered.every(v => prev.has(v.id));
      if (allSelected && filtered.length > 0) {
        const next = new Set(prev);
        filtered.forEach(v => next.delete(v.id));
        if (next.size === 0) setSelectionMode(false);
        addLog(`SYSTEM: Deselected all ${filtered.length} visible items.`);
        return next;
      } else {
        const next = new Set(prev);
        filtered.forEach(v => next.add(v.id));
        setSelectionMode(true);
        addLog(`SYSTEM: Selected all ${filtered.length} visible items.`);
        return next;
      }
    });
  }, [filtered, addLog, setSelectedIds, setSelectionMode]);

  return {
    toggleSelect,
    handleSelectAll,
  };
}
