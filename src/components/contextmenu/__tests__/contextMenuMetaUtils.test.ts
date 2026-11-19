import { describe, it, expect } from 'vitest';
import {
  extractLocationInfo,
  formatAspectRatioLabel,
  formatMegapixels,
  formatPlayTime,
} from '../contextMenuMetaUtils';

describe('contextMenuMetaUtils', () => {
  describe('extractLocationInfo', () => {
    it('extracts folder name, folder path, and file name from Windows disk paths', () => {
      const info = extractLocationInfo('E:\\Videos\\Trips\\Japan 2026\\clip_01.mp4');
      expect(info).toEqual({
        fullPath: 'E:\\Videos\\Trips\\Japan 2026\\clip_01.mp4',
        folderPath: 'E:\\Videos\\Trips\\Japan 2026',
        folderName: 'Japan 2026',
        fileName: 'clip_01.mp4',
      });
    });

    it('handles Windows drive root files cleanly', () => {
      const info = extractLocationInfo('D:\\movie.mkv');
      expect(info).toEqual({
        fullPath: 'D:\\movie.mkv',
        folderPath: 'D:\\',
        folderName: 'D:\\',
        fileName: 'movie.mkv',
      });
    });

    it('decodes Tauri asset.localhost and cosmo.localhost URLs with cache-buster query strings', () => {
      const assetInfo = extractLocationInfo('http://asset.localhost/E%3A%5CMedia%5CShoots%5Cphoto.png?t=1700000');
      expect(assetInfo).toEqual({
        fullPath: 'E:\\Media\\Shoots\\photo.png',
        folderPath: 'E:\\Media\\Shoots',
        folderName: 'Shoots',
        fileName: 'photo.png',
      });

      const cosmoInfo = extractLocationInfo('http://cosmo.localhost/E%3A%2FRaw%20Files%2FIMG_001.dng?thumb=1');
      expect(cosmoInfo).toEqual({
        fullPath: 'E:\\Raw Files\\IMG_001.dng',
        folderPath: 'E:\\Raw Files',
        folderName: 'Raw Files',
        fileName: 'IMG_001.dng',
      });
    });

    it('handles local:// URLs and UNC network paths', () => {
      const localInfo = extractLocationInfo('local://C:/Users/louis/Videos/Reel/shot.mp4');
      expect(localInfo).toEqual({
        fullPath: 'C:\\Users\\louis\\Videos\\Reel\\shot.mp4',
        folderPath: 'C:\\Users\\louis\\Videos\\Reel',
        folderName: 'Reel',
        fileName: 'shot.mp4',
      });

      const uncInfo = extractLocationInfo('\\\\NAS\\Archive\\Clips\\scene.mp4');
      expect(uncInfo).toEqual({
        fullPath: '\\\\NAS\\Archive\\Clips\\scene.mp4',
        folderPath: '\\\\NAS\\Archive\\Clips',
        folderName: 'Clips',
        fileName: 'scene.mp4',
      });
    });

    it('handles demo paths and ignores empty or blob inputs', () => {
      const demoInfo = extractLocationInfo('/demos/sample.mp4');
      expect(demoInfo).toEqual({
        fullPath: '/demos/sample.mp4',
        folderPath: '/demos',
        folderName: 'demos',
        fileName: 'sample.mp4',
      });

      expect(extractLocationInfo('')).toBeNull();
      expect(extractLocationInfo(null)).toBeNull();
      expect(extractLocationInfo('blob:http://localhost:55174/1234')).toBeNull();
    });
  });

  describe('formatAspectRatioLabel', () => {
    it('formats standard ratios with descriptive labels', () => {
      expect(formatAspectRatioLabel(1920, 1080)).toBe('16:9 (Widescreen)');
      expect(formatAspectRatioLabel(1600, 1200)).toBe('4:3 (Standard)');
      expect(formatAspectRatioLabel(1024, 1024)).toBe('1:1 (Square)');
      expect(formatAspectRatioLabel(1080, 1920)).toBe('9:16 (Vertical)');
      expect(formatAspectRatioLabel(2560, 1080)).toBe('2.37:1');
      expect(formatAspectRatioLabel(0, 1080)).toBeNull();
    });
  });

  describe('formatMegapixels', () => {
    it('calculates megapixels cleanly', () => {
      expect(formatMegapixels(1920, 1080)).toBe('2.07 Megapixels');
      expect(formatMegapixels(3840, 2160)).toBe('8.29 Megapixels');
      expect(formatMegapixels(undefined, 1080)).toBeNull();
    });
  });

  describe('formatPlayTime', () => {
    it('formats numeric durations and pre-formatted strings while omitting static images', () => {
      expect(formatPlayTime(65)).toBe('1:05');
      expect(formatPlayTime(3661)).toBe('1:01:01');
      expect(formatPlayTime('0:05')).toBe('0:05');
      expect(formatPlayTime('Static')).toBeNull();
      expect(formatPlayTime(0)).toBeNull();
      expect(formatPlayTime(null)).toBeNull();
    });
  });
});
