import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { RepeatMode, SortOption } from '../types';

interface GlobalState {
  // Application State
  mediaMode: 'all' | 'video' | 'picture';
  setMediaMode: (mode: 'all' | 'video' | 'picture') => void;
  
  theme: string;
  setTheme: (theme: string) => void;
  
  alwaysOnTop: boolean;
  setAlwaysOnTop: (val: boolean) => void;
  
  isFS: boolean;
  setIsFS: (val: boolean) => void;
  
  // Media Playback State
  masterPlaying: boolean;
  setMasterPlaying: (val: boolean | ((prev: boolean) => boolean)) => void;
  
  masterMuted: boolean;
  setMasterMuted: (val: boolean | ((prev: boolean) => boolean)) => void;
  
  globalVolume: number;
  setGlobalVolume: (val: number | ((prev: number) => number)) => void;
  
  speed: number;
  setSpeed: (val: number | ((prev: number) => number)) => void;
  
  globalRepeat: RepeatMode;
  setGlobalRepeat: (val: RepeatMode) => void;
  
  fitMode: 'cover' | 'contain';
  setFitMode: (mode: 'cover' | 'contain') => void;
  
  // Grid State
  zoom: number;
  setZoom: (val: number | ((prev: number) => number)) => void;
  
  immersive: boolean;
  setImmersive: (val: boolean | ((prev: boolean) => boolean)) => void;
  
  masterShowUI: boolean;
  setMasterShowUI: (val: boolean | ((prev: boolean) => boolean)) => void;
  
  // Selection State
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  
  selectionMode: boolean;
  setSelectionMode: (val: boolean | ((prev: boolean) => boolean)) => void;

  // Rename History State
  renameHistory: string[];
  setRenameHistory: (history: string[]) => void;
  addToRenameHistory: (name: string) => void;
  removeFromRenameHistory: (name: string) => void;
  updateRenameHistory: (oldName: string, newName: string) => void;

  // Trim & Crop Studio State
  trimCropModalTarget: VideoItem | null;
  setTrimCropModalTarget: (target: VideoItem | null) => void;

  // WhatsApp Share State
  whatsAppShareTarget: VideoItem | null;
  setWhatsAppShareTarget: (target: VideoItem | null) => void;

  aiHardwareStatus: string;
  setAiHardwareStatus: (status: string) => void;

  smartCulling: boolean;
  setSmartCulling: (val: boolean) => void;

  enableOSFullscreen: boolean;
  setEnableOSFullscreen: (val: boolean) => void;

  enableSlideshowPanZoom: boolean;
  setEnableSlideshowPanZoom: (val: boolean) => void;

  autoAddNewFiles: boolean;
  setAutoAddNewFiles: (val: boolean) => void;

  folderSwitchDelay: number;
  setFolderSwitchDelay: (val: number | ((prev: number) => number)) => void;

  slideshowInterval: number;
  setSlideshowInterval: (val: number | ((prev: number) => number)) => void;


  // Quick Folders & In-App Browser State
  quickFolders: { id: string; name: string; path: string }[];
  setQuickFolders: (folders: { id: string; name: string; path: string }[]) => void;
  autoSyncFolders: string[];
  setAutoSyncFolders: (folders: string[]) => void;
  toggleAutoSyncFolder: (path: string) => void;
  showInAppBrowser: boolean;
  setShowInAppBrowser: (val: boolean) => void;
  inAppBrowserPath: string;
  setInAppBrowserPath: (path: string) => void;
  inAppBrowserCollapsed: boolean;
  setInAppBrowserCollapsed: (val: boolean) => void;

  // Music Player & Queue State
  showQueue: boolean;
  setShowQueue: (val: boolean) => void;
  musicPlayerExpanded: boolean;
  setMusicPlayerExpanded: (val: boolean) => void;
  currentPlayingSongId: string | null;
  setCurrentPlayingSongId: (id: string | null) => void;

  // Grid Sorting State
  sortOrder: SortOption;
  setSortOrder: (order: SortOption) => void;
}

export const useStore = create<GlobalState>((set) => ({
  mediaMode: (localStorage.getItem('cosmo-media-mode') as 'all' | 'video' | 'picture') || 'all',
  setMediaMode: (mode) => {
    localStorage.setItem('cosmo-media-mode', mode);
    set({ mediaMode: mode });
  },
  
  theme: localStorage.getItem('cosmo-theme') || 'cobalt',
  setTheme: (theme) => {
    localStorage.setItem('cosmo-theme', theme);
    set({ theme });
  },
  
  alwaysOnTop: false,
  setAlwaysOnTop: (val) => set({ alwaysOnTop: val }),
  
  isFS: false,
  setIsFS: (val) => set({ isFS: val }),
  
  masterPlaying: true,
  setMasterPlaying: (val) => set((state) => ({ masterPlaying: typeof val === 'function' ? val(state.masterPlaying) : val })),
  
  masterMuted: true,
  setMasterMuted: (val) => set((state) => ({ masterMuted: typeof val === 'function' ? val(state.masterMuted) : val })),
  
  globalVolume: 0,
  setGlobalVolume: (val) => set((state) => ({ globalVolume: typeof val === 'function' ? val(state.globalVolume) : val })),
  
  speed: 1,
  setSpeed: (val) => set((state) => ({ speed: typeof val === 'function' ? val(state.speed) : val })),
  
  globalRepeat: 'folder',
  setGlobalRepeat: (val) => set({ globalRepeat: val }),
  
  fitMode: 'contain',
  setFitMode: (mode) => set({ fitMode: mode }),
  
  zoom: 3,
  setZoom: (val) => set((state) => ({ zoom: typeof val === 'function' ? val(state.zoom) : val })),
  
  immersive: false,
  setImmersive: (val) => set((state) => ({ immersive: typeof val === 'function' ? val(state.immersive) : val })),
  
  masterShowUI: true,
  setMasterShowUI: (val) => set((state) => ({ masterShowUI: typeof val === 'function' ? val(state.masterShowUI) : val })),
  
  selectedIds: new Set(),
  setSelectedIds: (val) => set((state) => ({ selectedIds: typeof val === 'function' ? val(state.selectedIds) : val })),
  
  selectionMode: false,
  setSelectionMode: (val) => set((state) => ({ selectionMode: typeof val === 'function' ? val(state.selectionMode) : val })),

  renameHistory: [],
  setRenameHistory: (history) => set({ renameHistory: history }),
  addToRenameHistory: (name) => set((state) => {
    const next = [name, ...state.renameHistory.filter(item => item !== name)].slice(0, 50);
    const cleanHistory = next.filter(item => {
      const lower = item.toLowerCase();
      const picExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.heic', '.heif', '.avif'];
      return !picExts.some(ext => lower.endsWith(ext));
    });
    invoke('save_persistence', { key: 'rename_history', data: JSON.stringify(cleanHistory) }).catch(() => {});
    return { renameHistory: cleanHistory };
  }),
  removeFromRenameHistory: (name) => set((state) => {
    const next = state.renameHistory.filter(item => item !== name);
    invoke('save_persistence', { key: 'rename_history', data: JSON.stringify(next) }).catch(() => {});
    return { renameHistory: next };
  }),
  updateRenameHistory: (oldName, newName) => set((state) => {
    const next = state.renameHistory.map(item => item === oldName ? newName : item);
    invoke('save_persistence', { key: 'rename_history', data: JSON.stringify(next) }).catch(() => {});
    return { renameHistory: next };
  }),
  
  trimCropModalTarget: null,
  setTrimCropModalTarget: (target) => set({ trimCropModalTarget: target }),

  whatsAppShareTarget: null,
  setWhatsAppShareTarget: (target) => set({ whatsAppShareTarget: target }),

  aiHardwareStatus: 'Detecting...',
  setAiHardwareStatus: (status: string) => set({ aiHardwareStatus: status }),

  smartCulling: localStorage.getItem('cosmo-smart-culling') !== 'false',
  setSmartCulling: (val) => {
    localStorage.setItem('cosmo-smart-culling', String(val));
    set({ smartCulling: val });
  },

  enableOSFullscreen: localStorage.getItem('cosmo-os-fullscreen') === 'true',
  setEnableOSFullscreen: (val) => {
    localStorage.setItem('cosmo-os-fullscreen', String(val));
    set({ enableOSFullscreen: val });
  },

  enableSlideshowPanZoom: localStorage.getItem('cosmo-slideshow-panzoom') !== 'false',
  setEnableSlideshowPanZoom: (val) => {
    localStorage.setItem('cosmo-slideshow-panzoom', String(val));
    set({ enableSlideshowPanZoom: val });
  },

  autoAddNewFiles: localStorage.getItem('cosmo-auto-add-new-files') !== 'false',
  setAutoAddNewFiles: (val) => {
    localStorage.setItem('cosmo-auto-add-new-files', String(val));
    set({ autoAddNewFiles: val });
  },

  folderSwitchDelay: (() => {
    const saved = localStorage.getItem('cosmo-folder-switch-delay');
    if (saved) {
      const num = parseInt(saved, 10);
      if (!isNaN(num) && num >= 1) return num;
    }
    return 10;
  })(),
  setFolderSwitchDelay: (val) => {
    set((state) => {
      const resolved = typeof val === 'function' ? (val as any)(state.folderSwitchDelay) : val;
      const num = parseInt(String(resolved), 10);
      const safeVal = isNaN(num) ? 10 : Math.max(1, num);
      localStorage.setItem('cosmo-folder-switch-delay', String(safeVal));
      return { folderSwitchDelay: safeVal };
    });
  },

  slideshowInterval: (() => {
    const saved = localStorage.getItem('cosmo-slideshow-interval');
    if (saved) {
      const num = parseInt(saved, 10);
      if (!isNaN(num) && num >= 1) return num;
    }
    return 5;
  })(),
  setSlideshowInterval: (val) => {
    set((state) => {
      const resolved = typeof val === 'function' ? (val as any)(state.slideshowInterval) : val;
      const num = parseInt(String(resolved), 10);
      const safeVal = isNaN(num) ? 5 : Math.max(1, Math.min(120, num));
      localStorage.setItem('cosmo-slideshow-interval', String(safeVal));
      return { slideshowInterval: safeVal };
    });
  },


  quickFolders: (() => {
    const saved = localStorage.getItem('cosmo-quick-folders');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse quick folders:', e);
      }
    }
    const defaultPins = [
      { id: 'demo-pictures', name: 'Demo Pictures', path: 'G:\\Pictures' },
      { id: 'demo-videos', name: 'Demo Videos', path: 'G:\\Video' }
    ];
    localStorage.setItem('cosmo-quick-folders', JSON.stringify(defaultPins));
    return defaultPins;
  })(),
  setQuickFolders: (folders) => {
    localStorage.setItem('cosmo-quick-folders', JSON.stringify(folders));
    set({ quickFolders: folders });
  },
  autoSyncFolders: (() => {
    const saved = localStorage.getItem('cosmo-auto-sync-folders');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error('Failed to parse auto-sync folders:', e);
      }
    }
    return [];
  })(),
  setAutoSyncFolders: (folders) => {
    localStorage.setItem('cosmo-auto-sync-folders', JSON.stringify(folders));
    set({ autoSyncFolders: folders });
  },
  toggleAutoSyncFolder: (path) => {
    if (!path) return;
    const cleanNorm = path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const current = (() => {
      const saved = localStorage.getItem('cosmo-auto-sync-folders');
      if (saved) {
        try { return JSON.parse(saved) || []; } catch {}
      }
      return [];
    })();
    const exists = current.some((p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === cleanNorm);
    const next = exists
      ? current.filter((p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() !== cleanNorm)
      : [...current, path];
    localStorage.setItem('cosmo-auto-sync-folders', JSON.stringify(next));
    set({ autoSyncFolders: next });
  },
  showInAppBrowser: false,
  setShowInAppBrowser: (val) => set({ showInAppBrowser: val }),
  inAppBrowserPath: '',
  setInAppBrowserPath: (path) => set({ inAppBrowserPath: path }),
  inAppBrowserCollapsed: false,
  setInAppBrowserCollapsed: (val) => set({ inAppBrowserCollapsed: val }),

  // Music Player & Queue State
  showQueue: false,
  setShowQueue: (val) => set({ showQueue: val }),
  musicPlayerExpanded: false,
  setMusicPlayerExpanded: (val) => set({ musicPlayerExpanded: val }),
  currentPlayingSongId: null,
  setCurrentPlayingSongId: (id) => set({ currentPlayingSongId: id }),

  // Grid Sorting State
  sortOrder: (localStorage.getItem('cosmo-sort-order') as SortOption) || 'custom',
  setSortOrder: (order) => {
    localStorage.setItem('cosmo-sort-order', order);
    set({ sortOrder: order });
  },
}));
