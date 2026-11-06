import React from 'react';
import type { BookmarkItem } from '../../types';

interface SoloTimelinePinsProps {
  bookmarks?: BookmarkItem[];
  duration: number;
  onSeek: (time: number) => void;
}

export const SoloTimelinePins: React.FC<SoloTimelinePinsProps> = ({
  bookmarks,
  duration,
  onSeek,
}) => {
  if (!bookmarks || bookmarks.length === 0 || !duration || duration <= 0) {
    return null;
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="timeline-pins-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
      }}
    >
      {bookmarks.map((bm) => {
        const pct = Math.max(0, Math.min(100, (bm.time / duration) * 100));
        return (
          <div
            key={bm.id}
            title={`${bm.label} (${formatTime(bm.time)})`}
            onClick={(e) => {
              e.stopPropagation();
              onSeek(bm.time);
            }}
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '6px',
              height: '14px',
              backgroundColor: 'var(--accent, #00ff88)',
              borderRadius: '2px',
              boxShadow: '0 0 6px var(--accent, #00ff88)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              zIndex: 3,
            }}
          />
        );
      })}
    </div>
  );
};
