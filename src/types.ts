export type RepeatMode = 'none' | 'once' | 'always' | 'folder';

export interface ColorFilters {
  brightness: number;
  contrast: number;
  hue: number;
  saturation: number;
  gamma: number;
  temp: number;
  tint: number;
  red: number;
  green: number;
  blue: number;
  alpha: number;
  negative: boolean;
}

export const DEFAULT_COLOR_FILTERS: ColorFilters = {
  brightness: 1.0,
  contrast: 1.0,
  hue: 0,
  saturation: 1.0,
  gamma: 1.0,
  temp: 0,
  tint: 0,
  red: 1.0,
  green: 1.0,
  blue: 1.0,
  alpha: 1.0,
  negative: false,
};

export interface VideoItem {
  id: string;
  url: string;
  realPath?: string;
  title: string;
  repeatMode: RepeatMode;
  repeatCount: number;
  cols: number;
  folderFiles?: { name: string; url: string; path: string; size?: number; modified?: number; created?: number }[];
  folderPath?: string;
  folderMode?: 'video' | 'picture' | 'all';
  currentIdx?: number;
  playing: boolean;
  muted: boolean;
  rotation?: number;
  flipped?: boolean;
  currentTime?: number;
  colorFilters?: ColorFilters;
  prevColorFilters?: ColorFilters;
  size?: number;
  modified?: number;
  created?: number;
}

export type SortOption =
  | 'custom'
  | 'name-asc'
  | 'name-desc'
  | 'size-asc'
  | 'size-desc'
  | 'modified-newest'
  | 'modified-oldest'
  | 'created-newest'
  | 'created-oldest'
  | 'videos-first'
  | 'pictures-first';

export interface TelemetryData {
  cpu: string;
  mem: string;
  gpu: string;
  temp?: number;
}

export interface CollageItem {
  id: string;
  mediaId: string;
  realPath: string;
  url: string;
  title: string;
  isImage: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  playing: boolean;
  muted: boolean;
  fitMode?: 'cover' | 'contain';
}

export interface CollageConfig {
  backgroundType: 'color' | 'gradient' | 'image';
  backgroundValue: string;
}
