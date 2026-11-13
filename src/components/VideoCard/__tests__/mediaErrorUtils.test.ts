import { describe, it, expect } from 'vitest';
import {
  buildFallbackMediaUrl,
  classifyLocalMediaFailure,
  classifyNonLocalMediaFailure,
  splitPathForDisplay,
} from '../mediaErrorUtils';

describe('mediaErrorUtils', () => {
  it('splits Windows paths for clean display without leaking full directory in filename', () => {
    const res = splitPathForDisplay('G:\\Isabel 2026\\Isabel 2026_017_sticker.webp', 'fallback');
    expect(res.fileName).toBe('Isabel 2026_017_sticker.webp');
    expect(res.parentDir).toBe('G:\\Isabel 2026');
    expect(res.fullPath).toBe('G:\\Isabel 2026\\Isabel 2026_017_sticker.webp');
  });

  it('classifies unmounted drive as drive-offline so user does not lose preserved tiles', () => {
    const info = classifyLocalMediaFailure(
      { exists: false, drive_root: 'M:\\', drive_accessible: false },
      'M:\\Louis\\misc orig\\photo.jpg',
      'photo.jpg'
    );
    expect(info.kind).toBe('drive-offline');
    expect(info.code).toBe('DRIVE M:\\ OFFLINE');
    expect(info.driveRoot).toBe('M:\\');
    expect(info.fileName).toBe('photo.jpg');
  });

  it('classifies missing file on active drive as file-missing', () => {
    const info = classifyLocalMediaFailure(
      { exists: false, drive_root: 'G:\\', drive_accessible: true },
      'G:\\Isabel 2026\\20260730_200454.jpg'
    );
    expect(info.kind).toBe('file-missing');
    expect(info.code).toBe('FILE MISSING');
    expect(info.fileName).toBe('20260730_200454.jpg');
  });

  it('classifies existing unreadable file as decode-error', () => {
    const info = classifyLocalMediaFailure(
      { exists: true, drive_root: 'G:\\', drive_accessible: true },
      'G:\\Isabel 2026\\corrupt.heic'
    );
    expect(info.kind).toBe('decode-error');
    expect(info.code).toBe('CANNOT DECODE');
    expect(info.fileName).toBe('corrupt.heic');
  });

  it('classifies non-local failures as network-error', () => {
    const info = classifyNonLocalMediaFailure('Remote clip', 'https://example.com/clip.mp4');
    expect(info.kind).toBe('network-error');
    expect(info.code).toBe('LOAD FAILED');
    expect(info.fileName).toBe('Remote clip');
  });

  it('builds cosmo and asset fallback URLs with cache busters cleanly', () => {
    const cosmo = buildFallbackMediaUrl('G:\\Isabel 2026\\a.jpg', true, 123, (p) => `http://asset.localhost/${encodeURIComponent(p)}`);
    expect(cosmo).toBe('http://cosmo.localhost/G%3A%5CIsabel%202026%5Ca.jpg?t=123');

    const asset = buildFallbackMediaUrl('G:\\Isabel 2026\\a.jpg', false, 456, (p) => `http://asset.localhost/${encodeURIComponent(p)}`);
    expect(asset).toBe('http://asset.localhost/G%3A%5CIsabel%202026%5Ca.jpg?t=456');
  });
});
