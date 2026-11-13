import type { VideoItem } from '../types';

// Helper to determine if a video item is an audio file
export function isAudioFile(path: string): boolean {
  if (!path) return false;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'wma', 'aac', 'alac', 'mp3a'].includes(ext);
}

// Struct to represent parsed song information
export interface SongInfo {
  band: string;
  album: string;
  title: string;
}

export function parseSongInfo(video: VideoItem): SongInfo {
  if (video.realPath) {
    const parts = video.realPath.split(/[\\/]/);
    if (parts.length >= 3) {
      const title = parts[parts.length - 1].replace(/\.[^/.]+$/, '');
      const album = parts[parts.length - 2];
      const band = parts[parts.length - 3];

      const genericFolders = ['music', 'download', 'downloads', 'documents', 'desktop', 'github', 'video', 'audios', 'assets', 'vocal', 'instrumental'];
      if (!genericFolders.includes(band.toLowerCase())) {
        return { band, album, title };
      }
    }
  }

  const titleParts = video.title.split(' - ');
  if (titleParts.length >= 3) {
    return {
      band: titleParts[0].trim(),
      album: titleParts[1].trim(),
      title: titleParts.slice(2).join(' - ').replace(/\.[^/.]+$/, '').trim(),
    };
  }
  if (titleParts.length === 2) {
    return {
      band: titleParts[0].trim(),
      album: 'Single',
      title: titleParts[1].replace(/\.[^/.]+$/, '').trim(),
    };
  }

  return {
    band: 'Unknown Artist',
    album: 'Unknown Album',
    title: video.title.replace(/\.[^/.]+$/, ''),
  };
}
