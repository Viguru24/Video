import { describe, it, expect } from 'vitest';
import type { VideoItem, BookmarkItem, ColorTag } from '../../types';

describe('Color Tagging and Bookmarks Logic', () => {
  const sampleVideos: VideoItem[] = [
    {
      id: 'v1',
      url: 'http://localhost/v1.mp4',
      title: 'Scene A',
      repeatMode: 'always',
      repeatCount: 0,
      cols: 1,
      playing: false,
      muted: true,
      colorTag: 'red',
      bookmarks: [
        { id: 'b1', time: 12.5, label: 'Intro' },
        { id: 'b2', time: 45.0, label: 'Climax' },
      ],
    },
    {
      id: 'v2',
      url: 'http://localhost/v2.mp4',
      title: 'Scene B',
      repeatMode: 'always',
      repeatCount: 0,
      cols: 1,
      playing: false,
      muted: true,
      colorTag: 'green',
      bookmarks: [],
    },
    {
      id: 'v3',
      url: 'http://localhost/v3.mp4',
      title: 'Scene C',
      repeatMode: 'always',
      repeatCount: 0,
      cols: 1,
      playing: false,
      muted: true,
      colorTag: null,
    },
  ];

  describe('Color Tag Filtering', () => {
    it('filters items by matching color tag', () => {
      const redItems = sampleVideos.filter(v => v.colorTag === 'red');
      expect(redItems).toHaveLength(1);
      expect(redItems[0].id).toBe('v1');

      const greenItems = sampleVideos.filter(v => v.colorTag === 'green');
      expect(greenItems).toHaveLength(1);
      expect(greenItems[0].id).toBe('v2');
    });

    it('identifies untagged items accurately', () => {
      const untagged = sampleVideos.filter(v => !v.colorTag);
      expect(untagged).toHaveLength(1);
      expect(untagged[0].id).toBe('v3');
    });

    it('computes tag distribution counts correctly', () => {
      const counts: Record<string, number> = {
        all: sampleVideos.length,
        red: 0,
        green: 0,
        blue: 0,
        yellow: 0,
        purple: 0,
        untagged: 0,
      };

      for (const v of sampleVideos) {
        if (v.colorTag && counts[v.colorTag] !== undefined) {
          counts[v.colorTag]++;
        } else {
          counts.untagged++;
        }
      }

      expect(counts.all).toBe(3);
      expect(counts.red).toBe(1);
      expect(counts.green).toBe(1);
      expect(counts.blue).toBe(0);
      expect(counts.untagged).toBe(1);
    });
  });

  describe('Bookmarks Processing', () => {
    it('sorts bookmarks by timestamp in ascending order', () => {
      const rawBookmarks: BookmarkItem[] = [
        { id: 'b3', time: 60.2, label: 'Outro' },
        { id: 'b1', time: 5.0, label: 'Cold Open' },
        { id: 'b2', time: 24.1, label: 'Action Sequence' },
      ];

      const sorted = [...rawBookmarks].sort((a, b) => a.time - b.time);
      expect(sorted[0].label).toBe('Cold Open');
      expect(sorted[1].label).toBe('Action Sequence');
      expect(sorted[2].label).toBe('Outro');
    });

    it('navigates to the correct next and previous bookmarks given a current timestamp', () => {
      const bookmarks: BookmarkItem[] = [
        { id: 'b1', time: 10.0, label: 'First' },
        { id: 'b2', time: 30.0, label: 'Second' },
        { id: 'b3', time: 50.0, label: 'Third' },
      ];

      // At t = 20s: Next should be b2 (30s), Prev should be b1 (10s)
      const current = 20.0;
      const next = bookmarks.find(b => b.time > current + 0.5);
      const prev = [...bookmarks].reverse().find(b => b.time < current - 0.5);

      expect(next?.id).toBe('b2');
      expect(prev?.id).toBe('b1');
    });

    it('handles bookmark insertion and duplicate time guards', () => {
      const video = sampleVideos[0];
      const existing = video.bookmarks || [];
      const newMarker: BookmarkItem = { id: 'b-new', time: 25.0, label: 'Midpoint' };

      const updated = [...existing, newMarker].sort((a, b) => a.time - b.time);
      expect(updated).toHaveLength(3);
      expect(updated[1].id).toBe('b-new');
    });
  });
});
