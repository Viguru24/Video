import { describe, it, expect } from 'vitest';
import {
  isValidVideoExtension,
  isValidPictureExtension,
  isValidMediaExtension,
  getFileNameFromPath,
  toRealPath,
  formatDuration
} from '../videoUtils';

describe('videoUtils unit tests', () => {
  describe('extension checking', () => {
    it('identifies valid video extensions', () => {
      expect(isValidVideoExtension('movie.mp4')).toBe(true);
      expect(isValidVideoExtension('clip.mkv')).toBe(true);
      expect(isValidVideoExtension('stream.webm')).toBe(true);
      expect(isValidVideoExtension('image.png')).toBe(false);
      expect(isValidVideoExtension('')).toBe(false);
    });

    it('identifies valid picture extensions', () => {
      expect(isValidPictureExtension('photo.png')).toBe(true);
      expect(isValidPictureExtension('photo.jpg')).toBe(true);
      expect(isValidPictureExtension('photo.jpeg')).toBe(true);
      expect(isValidPictureExtension('photo.webp')).toBe(true);
      expect(isValidPictureExtension('photo.gif')).toBe(true);
      expect(isValidPictureExtension('video.mp4')).toBe(false);
    });

    it('identifies valid media extensions', () => {
      expect(isValidMediaExtension('video.mp4', 'all')).toBe(true);
      expect(isValidMediaExtension('image.webp', 'all')).toBe(true);
      expect(isValidMediaExtension('photo.png', 'picture')).toBe(true);
      expect(isValidMediaExtension('doc.pdf', 'all')).toBe(false);
    });
  });

  describe('getFileNameFromPath', () => {
    it('extracts clean filename from Windows and POSIX paths', () => {
      expect(getFileNameFromPath('C:\\Users\\louis\\Videos\\clip.mp4')).toBe('clip.mp4');
      expect(getFileNameFromPath('/home/user/media/clip.webm')).toBe('clip.webm');
      expect(getFileNameFromPath('simple_name.png')).toBe('simple_name.png');
    });

    it('removes query parameters from URL paths', () => {
      expect(getFileNameFromPath('http://localhost:3000/media/sample.mp4?t=12345')).toBe('sample.mp4');
    });
  });

  describe('toRealPath', () => {
    it('handles raw local paths without modification', () => {
      expect(toRealPath('D:\\Media\\video.mp4')).toBe('D:\\Media\\video.mp4');
      expect(toRealPath('/var/media/video.mp4')).toBe('/var/media/video.mp4');
    });
  });

  describe('formatDuration', () => {
    it('formats seconds into MM:SS correctly', () => {
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(65)).toBe('1:05');
      expect(formatDuration(599)).toBe('9:59');
    });

    it('formats seconds into HH:MM:SS for longer media', () => {
      expect(formatDuration(3665)).toBe('1:01:05');
      expect(formatDuration(7200)).toBe('2:00:00');
    });

    it('handles invalid or undefined inputs gracefully', () => {
      expect(formatDuration(undefined)).toBe('0:00');
      expect(formatDuration(NaN)).toBe('0:00');
    });
  });
});
