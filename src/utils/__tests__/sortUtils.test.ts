import { describe, it, expect } from 'vitest';
import type { VideoItem } from '../../types';
import { sortVideoItems, normalizeTimestamp, compareVideoItems } from '../sortUtils';

describe('sorting and filtering logic tests', () => {
  const sampleItems: VideoItem[] = [
    { id: '1', title: 'Beta Video', url: 'beta.mp4', created: 1000000, modified: 2000000, size: 500, repeatMode: 'none', repeatCount: 0, cols: 1 },
    { id: '2', title: 'Alpha Video', url: 'alpha.mp4', created: 3000000, modified: 1000000, size: 100, repeatMode: 'none', repeatCount: 0, cols: 1 },
    { id: '3', title: 'Gamma Video', url: 'gamma.mp4', created: 2000000, modified: 3000000, size: 1000, repeatMode: 'none', repeatCount: 0, cols: 1 },
  ];

  it('normalizes timestamps in seconds and milliseconds correctly', () => {
    expect(normalizeTimestamp(1725280000)).toBe(1725280000000); // 10-digit seconds -> ms
    expect(normalizeTimestamp(1725280000000)).toBe(1725280000000); // 13-digit ms
    expect(normalizeTimestamp(0)).toBe(0);
    expect(normalizeTimestamp(undefined)).toBe(0);
  });

  it('sorts by title alphabetically A-Z', () => {
    const sorted = sortVideoItems(sampleItems, 'name-asc');
    expect(sorted.map(x => x.id)).toEqual(['2', '1', '3']);
  });

  it('sorts by title descending Z-A', () => {
    const sorted = sortVideoItems(sampleItems, 'name-desc');
    expect(sorted.map(x => x.id)).toEqual(['3', '1', '2']);
  });

  it('sorts by size ascending', () => {
    const sorted = sortVideoItems(sampleItems, 'size-asc');
    expect(sorted.map(x => x.id)).toEqual(['2', '1', '3']);
  });

  it('sorts by size descending', () => {
    const sorted = sortVideoItems(sampleItems, 'size-desc');
    expect(sorted.map(x => x.id)).toEqual(['3', '1', '2']);
  });

  it('sorts by date modified newest first', () => {
    const sorted = sortVideoItems(sampleItems, 'modified-newest');
    expect(sorted.map(x => x.id)).toEqual(['3', '1', '2']);
  });

  it('sorts by date modified oldest first', () => {
    const sorted = sortVideoItems(sampleItems, 'modified-oldest');
    expect(sorted.map(x => x.id)).toEqual(['2', '1', '3']);
  });

  it('sorts by date created newest first', () => {
    const sorted = sortVideoItems(sampleItems, 'created-newest');
    expect(sorted.map(x => x.id)).toEqual(['2', '3', '1']);
  });

  it('sorts by date created oldest first', () => {
    const sorted = sortVideoItems(sampleItems, 'created-oldest');
    expect(sorted.map(x => x.id)).toEqual(['1', '3', '2']);
  });

  it('sorts newest first correctly when one item is in seconds and another is in ms', () => {
    const mixedItems: VideoItem[] = [
      { id: 'old', title: 'Old File', url: 'old.mp4', modified: 1700000000, repeatMode: 'none', repeatCount: 0, cols: 1 }, // seconds: 2023
      { id: 'new', title: 'New File', url: 'new.mp4', modified: 1725280000000, repeatMode: 'none', repeatCount: 0, cols: 1 }, // ms: 2024
    ];
    const sorted = sortVideoItems(mixedItems, 'modified-newest');
    expect(sorted.map(x => x.id)).toEqual(['new', 'old']);
  });

  it('breaks timestamp ties in modified-newest by putting higher sequence number first', () => {
    const batchItems: VideoItem[] = [
      { id: '1', title: 'ComfyUI_00001_.png', url: '1.png', modified: 1725280000, repeatMode: 'none', repeatCount: 0, cols: 1 },
      { id: '5', title: 'ComfyUI_00005_.png', url: '5.png', modified: 1725280000, repeatMode: 'none', repeatCount: 0, cols: 1 },
      { id: '2', title: 'ComfyUI_00002_.png', url: '2.png', modified: 1725280000, repeatMode: 'none', repeatCount: 0, cols: 1 },
    ];
    const sorted = sortVideoItems(batchItems, 'modified-newest');
    expect(sorted.map(x => x.id)).toEqual(['5', '2', '1']);
  });
});
