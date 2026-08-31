import { describe, it, expect } from 'vitest';
import type { VideoItem } from '../../types';

describe('sorting and filtering logic tests', () => {
  const sampleItems: VideoItem[] = [
    { id: '1', title: 'Beta Video', url: 'beta.mp4', created: 1000, modified: 2000, duration: 120, repeatMode: 'none', repeatCount: 0, cols: 1 },
    { id: '2', title: 'Alpha Video', url: 'alpha.mp4', created: 3000, modified: 1000, duration: 60, repeatMode: 'none', repeatCount: 0, cols: 1 },
    { id: '3', title: 'Gamma Video', url: 'gamma.mp4', created: 2000, modified: 3000, duration: 300, repeatMode: 'none', repeatCount: 0, cols: 1 },
  ];

  it('sorts by title alphabetically A-Z', () => {
    const sorted = [...sampleItems].sort((a, b) => a.title.localeCompare(b.title));
    expect(sorted.map(x => x.id)).toEqual(['2', '1', '3']);
  });

  it('sorts by title descending Z-A', () => {
    const sorted = [...sampleItems].sort((a, b) => b.title.localeCompare(a.title));
    expect(sorted.map(x => x.id)).toEqual(['3', '1', '2']);
  });

  it('sorts by duration ascending', () => {
    const sorted = [...sampleItems].sort((a, b) => (a.duration || 0) - (b.duration || 0));
    expect(sorted.map(x => x.id)).toEqual(['2', '1', '3']);
  });

  it('sorts by date modified newest first', () => {
    const sorted = [...sampleItems].sort((a, b) => (b.modified || 0) - (a.modified || 0));
    expect(sorted.map(x => x.id)).toEqual(['3', '1', '2']);
  });
});
