export type RepeatMode = 'none' | 'once' | 'always' | 'folder';

export interface VideoItem {
  id: string;
  url: string;
  realPath?: string;
  title: string;
  repeatMode: RepeatMode;
  repeatCount: number;
  cols: number;
  folderFiles?: { name: string; url: string }[];
  currentIdx?: number;
  playing: boolean;
  muted: boolean;
}

export interface TelemetryData {
  cpu: string;
  mem: string;
  gpu: string;
}
