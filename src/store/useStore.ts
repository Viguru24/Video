import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { RepeatMode } from '../types';

interface GlobalState {
  // Application State
  mediaMode: 'video' | 'picture';
  setMediaMode: (mode: 'video' | 'picture') => void;
  
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

  aiHardwareStatus: string;
  setAiHardwareStatus: (status: string) => void;

  smartCulling: boolean;
  setSmartCulling: (val: boolean) => void;
}

export const useStore = create<GlobalState>((set) => ({
  mediaMode: (localStorage.getItem('cosmo-media-mode') as 'video' | 'picture') || 'video',
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
    invoke('save_persistence', { key: 'rename_history', data: JSON.stringify(next) }).catch(() => {});
    return { renameHistory: next };
  }),
  
  aiHardwareStatus: 'Detecting...',
  setAiHardwareStatus: (status: string) => set({ aiHardwareStatus: status }),

  smartCulling: localStorage.getItem('cosmo-smart-culling') !== 'false',
  setSmartCulling: (val) => {
    localStorage.setItem('cosmo-smart-culling', String(val));
    set({ smartCulling: val });
  },
}));
