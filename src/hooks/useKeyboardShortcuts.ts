import { useEffect, Dispatch, SetStateAction } from 'react';
import type { VideoItem, RepeatMode } from '../types';
import { isValidPictureExtension, showConfirm } from '../utils/videoUtils';

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
  showHelp: boolean;
  isPopout?: boolean;
  isSlideshowActive?: boolean;
  setIsSlideshowActive?: Dispatch<SetStateAction<boolean>>;
  triggerGlobalHud?: (label: string, val: string) => void;
  
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  onToggleFocus: (id: string | null) => void;
  exitSoloMode?: () => Promise<void> | void;
  onSelectAll?: () => void;
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
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedIds: (ids: Set<string>) => void;
  setSelectionMode: (val: boolean) => void;
  handleDecommission: (id: string) => void;
  handleAnnihilate: (id: string, bypassConfirm?: boolean) => void;
  handleBatchRemove: () => void;
  addLog: (msg: string) => void;
  onNavigateSibling?: (direction: 1 | -1) => void;
  jumpToUnit?: (id: string) => void;
  onDeepFocus?: (id: string, time?: number) => void;
  triggerGlobalHud?: (label: string, val: string) => void;
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
  showHelp,
  isPopout = false,
  onUpdateVideo,
  onToggleFocus,
  exitSoloMode,
  onSelectAll,
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
  setShowHelp,
  setSelectedIds,
  setSelectionMode,
  handleDecommission,
  handleAnnihilate,
  handleBatchRemove,
  addLog,
  onNavigateSibling,
  jumpToUnit,
  onDeepFocus,
  isSlideshowActive,
  setIsSlideshowActive,
  triggerGlobalHud
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

        // SELECT ALL SHORTCUT: Toggle selection of all visible items with Ctrl+A
        if (key === 'a' && (e.ctrlKey || e.metaKey)) {
          const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
          if (!isInput) {
            e.preventDefault();
            e.stopPropagation();
            onSelectAll?.();
            return;
          }
        }

        // GLOBAL ESCAPE ESCORT: Close modals/overlays or exit focus instantly, even when typing
        if (key === 'escape') {
          e.preventDefault();
          e.stopPropagation();
          if (target) target.blur();
          
          if (showHelp) { setShowHelp(false); triggerGlobalHud?.('GUIDE', 'CLOSED'); return; }
          if (showSettings) { setShowSettings(false); triggerGlobalHud?.('SETTINGS', 'CLOSED'); return; }
          if (showCollections) { setShowCollections(false); triggerGlobalHud?.('COLLECTIONS', 'CLOSED'); return; }
          if (showLogs) { setShowLogs(false); triggerGlobalHud?.('LOGS', 'CLOSED'); return; }
          if (menu) { setMenu(null); triggerGlobalHud?.('MENU', 'CLOSED'); return; }
          
          if (immersive || focusedId) {
            if (setIsSlideshowActive) setIsSlideshowActive(false);
            if (exitSoloMode) {
              exitSoloMode();
            } else {
              setImmersive(false);
              onToggleFocus(null);
            }
            if (immersive) triggerGlobalHud?.('IMMERSIVE', 'OFF');
            triggerGlobalHud?.('SOLO VIEW', 'EXITED');
            return;
          }
          return;
        }

        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (isInput) return;
        
        // Grid Density Scaling (1-8)
        if (key >= '1' && key <= '8') { 
          const cols = parseInt(key) * 2;
          setZoom(cols); 
          addLog(`Grid Density: ${key} mode`); 
          triggerGlobalHud?.('DENSITY', `${cols} Columns`);
          return; 
        }
        
        switch(key) {
          case 's': {
            e.preventDefault();
            const tId = focusedId || (filtered.length > 0 ? filtered[0].id : null);
            if (tId) {
              const targetVid = videos.find(x => x.id === tId);
              if (targetVid) {
                const targetPath = (targetVid.folderFiles && targetVid.currentIdx !== undefined)
                  ? (targetVid.folderFiles[targetVid.currentIdx]?.path || targetVid.folderFiles[targetVid.currentIdx]?.url)
                  : targetVid.realPath;
                const isImg = targetPath ? isValidPictureExtension(targetPath) : false;
                if (!isImg) {
                  setGlobalControl(`snapshot-${tId}-${Date.now()}`);
                  triggerGlobalHud?.('SNAPSHOT', 'SAVED');
                }
              }
            }
            break;
          }
          case ' ': {
            e.preventDefault();
            if (isSlideshowActive) {
              if (setIsSlideshowActive) {
                setIsSlideshowActive(false);
                triggerGlobalHud?.('SLIDESHOW', 'PAUSED');
              }
            } else if (focusedId) {
              const v = videos.find(x => x.id === focusedId);
              if (v) {
                const path = (v.folderFiles && v.currentIdx !== undefined)
                  ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
                  : v.realPath;
                const isImg = path ? isValidPictureExtension(path) : false;
                if (isImg) {
                  if (setIsSlideshowActive) {
                    setIsSlideshowActive(true);
                    triggerGlobalHud?.('SLIDESHOW', 'PLAYING');
                  }
                } else {
                  onUpdateVideo(v.id, { playing: !v.playing });
                  triggerGlobalHud?.('PLAYBACK', !v.playing ? 'PLAYING' : 'PAUSED');
                }
              }
            } else {
              toggleMasterPlay();
              triggerGlobalHud?.('PLAYBACK', 'PLAY/PAUSE TOGGLED');
            }
            break;
          }
          case 'f':
            if (filtered.length > 0) {
              const nextFocus = focusedId ? null : filtered[0].id;
              onToggleFocus(nextFocus);
              triggerGlobalHud?.('SOLO VIEW', nextFocus ? 'ENTERED' : 'EXITED');
            }
            break;
          case 'm': 
            toggleMasterMute(); 
            triggerGlobalHud?.('AUDIO', 'MUTE TOGGLED');
            break;
          case 'i':
            e.preventDefault();
            setImmersive(!immersive);
            triggerGlobalHud?.('IMMERSIVE', !immersive ? 'ON' : 'OFF');
            break;
          case '?':
            e.preventDefault();
            setShowHelp(prev => {
              const next = !prev;
              triggerGlobalHud?.('GUIDE', next ? 'OPENED' : 'CLOSED');
              return next;
            });
            break;
          case 'l': 
            setGlobalRepeat(prev => { 
              const modes: RepeatMode[] = ['none', 'once', 'always', 'folder']; 
              const next = modes[(modes.indexOf(prev) + 1) % modes.length]; 
              addLog('Global Repeat: ' + next.toUpperCase()); 
              triggerGlobalHud?.('LOOP MODE', next.toUpperCase());
              return next; 
            }); 
            break;
          case 'delete': {
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
                    const yes = await showConfirm(`PROTOCOL: BATCH ANNIHILATION\n\nThis will move ${selectedIds.size} files to the Recycle Bin.\n\nPROCEED?`, { title: 'Batch Recycle', kind: 'error' });
                    if (!yes) return;
                  }
                 Array.from(selectedIds).forEach(id => handleAnnihilate(id, true));
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
          }
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
    addLog, showSettings, showCollections, showLogs, showHelp, 
    menu, setZoom, setGlobalControl, setMenu, toggleMasterMute, setGlobalRepeat, 
    immersive, confirmDeletion, setImmersive, handleDecommission, selectedIds, 
    handleAnnihilate, handleBatchRemove, isPopout, setSelectedIds, setSelectionMode,
    onNavigateSibling, jumpToUnit, onDeepFocus, setShowHelp, setShowSettings, 
    setShowCollections, setShowLogs,
    isSlideshowActive, setIsSlideshowActive, exitSoloMode, onSelectAll
  ]);
}
