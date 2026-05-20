import { useEffect } from 'react';
import type { VideoItem, RepeatMode } from '../types';
import { isValidPictureExtension } from '../utils/videoUtils';

interface KeyboardShortcutsProps {
  focusedId: string | null;
  filtered: VideoItem[];
  videos: VideoItem[];
  selectedIds: Set<string>;
  confirmDeletion: boolean;
  immersive: boolean;
  menu: any;
  showSettings: boolean;
  showCollections: boolean;
  showLogs: boolean;
  showSymphonyWorkshop: boolean;
  showHelp: boolean;
  isPopout?: boolean;
  
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  onToggleFocus: (id: string | null) => void;
  toggleMasterPlay: () => void;
  toggleMasterMute: () => void;
  setGlobalRepeat: (updater: (prev: RepeatMode) => RepeatMode) => void;
  setGlobalControl: (cmd: string) => void;
  setZoom: (updater: number | ((prev: number) => number)) => void;
  setMenu: (menu: any) => void;
  setImmersive: (val: boolean) => void;
  setShowSettings: (val: boolean) => void;
  setShowCollections: (val: boolean) => void;
  setShowLogs: (val: boolean) => void;
  setShowSymphonyWorkshop: (val: boolean) => void;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedIds: (ids: Set<string>) => void;
  setSelectionMode: (val: boolean) => void;
  handleDecommission: (id: string) => void;
  handleAnnihilate: (id: string) => void;
  handleBatchRemove: () => void;
  addLog: (msg: string) => void;
  onNavigateSibling?: (direction: 1 | -1) => void;
  jumpToUnit?: (id: string) => void;
  onDeepFocus?: (id: string, time?: number) => void;
}

/**
 * Custom hook to manage global keyboard shortcuts and input orchestration.
 */
export function useKeyboardShortcuts({
  focusedId,
  filtered,
  videos,
  selectedIds,
  confirmDeletion,
  immersive,
  menu,
  showSettings,
  showCollections,
  showLogs,
  showSymphonyWorkshop,
  showHelp,
  isPopout = false,
  onUpdateVideo,
  onToggleFocus,
  toggleMasterPlay,
  toggleMasterMute,
  setGlobalRepeat,
  setGlobalControl,
  setZoom,
  setMenu,
  setImmersive,
  setShowSettings,
  setShowCollections,
  setShowLogs,
  setShowSymphonyWorkshop,
  setShowHelp,
  setSelectedIds,
  setSelectionMode,
  handleDecommission,
  handleAnnihilate,
  handleBatchRemove,
  addLog,
  onNavigateSibling,
  jumpToUnit,
  onDeepFocus
}: KeyboardShortcutsProps) {
  useEffect(() => {
    if (isPopout) return;

      const handleKeys = async (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const key = e.key.toLowerCase();

        // MODAL PERSISTENCE PROTOCOL: Neutralize Backspace navigation
        if (key === 'backspace') {
          const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
          if (!isInput) {
            e.preventDefault();
            return;
          }
        }

        // GLOBAL ESCAPE ESCORT: Close modals/overlays or exit focus instantly, even when typing
        if (key === 'escape') {
          e.preventDefault();
          e.stopPropagation();
          if (target) target.blur();
          
          if (showHelp) { setShowHelp(false); return; }
          if (showSettings) { setShowSettings(false); return; }
          if (showCollections) { setShowCollections(false); return; }
          if (showLogs) { setShowLogs(false); return; }
          if (showSymphonyWorkshop) { setShowSymphonyWorkshop(false); return; }
          if (menu) { setMenu(null); return; }
          
          if (immersive) {
            if (focusedId && onDeepFocus) {
              onDeepFocus(focusedId);
            } else {
              setImmersive(false);
            }
            return;
          }
          if (focusedId) {
            if (jumpToUnit) jumpToUnit(focusedId);
            onToggleFocus(null);
            return;
          }
          return;
        }

        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (isInput) return;
        
        // Grid Density Scaling (1-8)
        if (key >= '1' && key <= '8') { 
          setZoom(parseInt(key) * 2); 
          addLog(`Grid Density: ${key} mode`); 
          return; 
        }
        
        switch(key) {
          case 's':
            e.preventDefault();
            const tId = focusedId || (filtered.length > 0 ? filtered[0].id : null);
            if (tId) setGlobalControl(`snapshot-${tId}-${Date.now()}`);
            break;
          case ' ':
            e.preventDefault();
            if (focusedId) {
              const v = videos.find(x => x.id === focusedId);
              if (v) onUpdateVideo(v.id, { playing: !v.playing });
            } else {
              toggleMasterPlay();
            }
            break;
          case 'f':
            if (filtered.length > 0) onToggleFocus(focusedId ? null : filtered[0].id);
            break;
          case 'm': toggleMasterMute(); break;
          case 'i':
            e.preventDefault();
            setShowHelp(prev => !prev);
            break;
          case 'l': 
            setGlobalRepeat(prev => { 
              const modes: RepeatMode[] = ['none', 'once', 'always', 'folder']; 
              const next = modes[(modes.indexOf(prev) + 1) % modes.length]; 
              addLog('Global Repeat: ' + next.toUpperCase()); 
              return next; 
            }); 
            break;
          case 'delete':
            e.preventDefault();
            let targetId = focusedId;
            if (!targetId && selectedIds.size === 0) {
              const hoveredCard = document.querySelector('.grid-item-wrap:hover');
              if (hoveredCard) {
                targetId = hoveredCard.getAttribute('data-id');
              }
            }
            if (e.shiftKey) {
              if (selectedIds.size > 0) {
                 if (confirmDeletion) {
                   const { confirm } = await import('@tauri-apps/plugin-dialog');
                   const yes = await confirm(`PROTOCOL: BATCH ANNIHILATION\n\nThis will move ${selectedIds.size} files to the Recycle Bin.\n\nPROCEED?`, { title: 'Batch Recycle', kind: 'error' });
                   if (!yes) return;
                 }
                 Array.from(selectedIds).forEach(id => handleAnnihilate(id));
                 setSelectedIds(new Set());
                 setSelectionMode(false);
              } else if (targetId) {
                handleAnnihilate(targetId);
              }
            } else {
              if (selectedIds.size > 0) {
                handleBatchRemove();
              } else if (targetId) {
                handleDecommission(targetId);
              }
            }
            break;
        case 'arrowright':
          if (focusedId) {
            e.preventDefault();
            const v = videos.find(x => x.id === focusedId);
            if (v) {
              onUpdateVideo(v.id, { rotation: (v.rotation || 0) + 90 });
              addLog(`Rotated Right: ${v.title}`);
            }
          }
          break;
        case 'arrowleft':
          if (focusedId) {
            e.preventDefault();
            const v = videos.find(x => x.id === focusedId);
            if (v) {
              onUpdateVideo(v.id, { rotation: (v.rotation || 0) - 90 });
              addLog(`Rotated Left: ${v.title}`);
            }
          }
          break;
        case 'arrowdown':
          if (focusedId && onNavigateSibling) {
            e.preventDefault();
            onNavigateSibling(1);
          }
          break;
        case 'arrowup':
          if (focusedId && onNavigateSibling) {
            e.preventDefault();
            onNavigateSibling(-1);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeys, true);
    return () => window.removeEventListener('keydown', handleKeys, true);
  }, [
    focusedId, filtered, videos, toggleMasterPlay, onUpdateVideo, onToggleFocus, 
    addLog, showSettings, showCollections, showLogs, showSymphonyWorkshop, showHelp, 
    menu, setZoom, setGlobalControl, setMenu, toggleMasterMute, setGlobalRepeat, 
    immersive, confirmDeletion, setImmersive, handleDecommission, selectedIds, 
    handleAnnihilate, handleBatchRemove, isPopout, setSelectedIds, setSelectionMode,
    onNavigateSibling, jumpToUnit, onDeepFocus, setShowHelp, setShowSettings, 
    setShowCollections, setShowLogs, setShowSymphonyWorkshop
  ]);
}
