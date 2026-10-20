import { useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { VideoItem } from '../types';
import { isTauri } from '../utils/videoUtils';

interface UseWorkspaceSelectionProps {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  filtered: VideoItem[];
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectionMode: boolean;
  setSelectionMode: (m: boolean) => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  setImmersive: (im: boolean) => void;
  setIsSlideshowActive: (active: boolean) => void;
  rotating: boolean;
  setRotating: (r: boolean) => void;
  enableOSFullscreen: boolean;
  setIsFS: (fs: boolean) => void;
  addLog: (msg: string) => void;
  jumpToUnit: (id: string) => void;
  pendingScrollIdRef: React.MutableRefObject<string | null>;
}

export function useWorkspaceSelection({
  videos,
  setVideos,
  filtered,
  selectedIds,
  setSelectedIds,
  selectionMode,
  setSelectionMode,
  focusedId,
  setFocusedId,
  setImmersive,
  setIsSlideshowActive,
  rotating,
  setRotating,
  enableOSFullscreen,
  setIsFS,
  addLog,
  jumpToUnit,
  pendingScrollIdRef
}: UseWorkspaceSelectionProps) {
  const lastSelectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedIds.size === 0) {
      lastSelectedIdRef.current = null;
    }
  }, [selectedIds]);

  const exitSoloMode = useCallback(async () => {
    setFocusedId(null);
    setImmersive(false);
    setIsSlideshowActive(false);
    if (isTauri() && enableOSFullscreen) {
      try {
        const win = getCurrentWindow();
        if (await win.isFullscreen()) {
          await win.setFullscreen(false);
          setIsFS(false);
        }
      } catch (err) {
        console.warn("Failed to reset OS fullscreen on exit solo:", err);
      }
    }
  }, [setFocusedId, setImmersive, setIsSlideshowActive, enableOSFullscreen, setIsFS]);

  useEffect(() => {
    (window as any).__cosmoExitSolo = () => {
      if (focusedId) {
        exitSoloMode();
        return true;
      }
      return false;
    };
    return () => {
      delete (window as any).__cosmoExitSolo;
    };
  }, [focusedId, exitSoloMode]);

  useEffect(() => {
    const onPopState = () => {
      if (focusedId) {
        exitSoloMode();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [focusedId, exitSoloMode]);

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

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      lastSelectedIdRef.current = id;
      setSelectionMode(next.size > 0);
      return next;
    });
  }, [filtered, setSelectedIds, setSelectionMode]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
      setSelectionMode(false);
    } else {
      setSelectedIds(new Set(filtered.map(x => x.id)));
      setSelectionMode(true);
    }
  }, [selectedIds, filtered, setSelectedIds, setSelectionMode]);

  const handleFocus = useCallback((id: string) => {
    setFocusedId(id);
  }, [setFocusedId]);

  const handleDeepFocus = useCallback((id: string, time?: number) => {
    if (time !== undefined && typeof time === 'number') {
      setVideos(prev => prev.map(v => v.id === id ? { ...v, currentTime: time } : v));
    }
    
    if (focusedId === id) {
      pendingScrollIdRef.current = id;
      jumpToUnit(id);
      exitSoloMode();
    } else {
      setFocusedId(id);
      setImmersive(true);
      if (rotating) setRotating(false);
      if (enableOSFullscreen) {
        setIsFS(true);
      }
      addLog(`Deep Focus: Unit ${id.split('-')[0]}`);
    }
  }, [focusedId, setVideos, setFocusedId, setImmersive, enableOSFullscreen, setIsFS, rotating, setRotating, addLog, jumpToUnit, exitSoloMode, pendingScrollIdRef]);

  return {
    exitSoloMode,
    toggleSelect,
    handleSelectAll,
    handleFocus,
    handleDeepFocus
  };
}
