import React, { useMemo } from 'react';
import type { VideoItem, ColorTag } from '../../types';
import { useStore } from '../../store/useStore';
import { Tag } from 'lucide-react';

interface ColorTagFilterBarProps {
  videos: VideoItem[];
}

const TAG_CONFIG: { tag: ColorTag; label: string; color: string; bg: string }[] = [
  { tag: 'red', label: 'Review', color: '#f87171', bg: 'rgba(239, 68, 68, 0.2)' },
  { tag: 'green', label: 'Approved', color: '#34d399', bg: 'rgba(16, 185, 129, 0.2)' },
  { tag: 'blue', label: 'B-Roll', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)' },
  { tag: 'yellow', label: 'WIP', color: '#facc15', bg: 'rgba(234, 179, 8, 0.2)' },
  { tag: 'purple', label: 'Select', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.22)' },
];

export const ColorTagFilterBar: React.FC<ColorTagFilterBarProps> = ({ videos }) => {
  const { colorTagFilter, setColorTagFilter } = useStore();

  const counts = useMemo(() => {
    const map: Record<string, number> = {
      all: videos.length,
      red: 0,
      green: 0,
      blue: 0,
      yellow: 0,
      purple: 0,
      untagged: 0,
    };
    for (const v of videos) {
      if (v.colorTag && map[v.colorTag] !== undefined) {
        map[v.colorTag]++;
      } else {
        map.untagged++;
      }
    }
    return map;
  }, [videos]);

  // Don't clutter toolbar if workspace is empty
  if (videos.length === 0) return null;

  return (
    <div
      className="color-tag-filter-bar"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 7px',
        background: 'var(--bg-well, #060608)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'var(--well-recessed)',
        fontSize: '11px',
      }}
      title="Dynamic Smart Filter by Color Tag"
    >
      <Tag size={12} style={{ color: 'var(--text-muted, #71717a)', marginRight: 2 }} />

      <button
        type="button"
        className={`color-filter-pill ${(!colorTagFilter || colorTagFilter === 'all') ? 'active' : ''}`}
        onClick={() => setColorTagFilter('all')}
        style={{
          border: (!colorTagFilter || colorTagFilter === 'all') ? '1px solid rgba(255,255,255,0.16)' : '1px solid transparent',
          cursor: 'pointer',
          padding: '2px 7px',
          borderRadius: '5px',
          background: (!colorTagFilter || colorTagFilter === 'all') ? '#1c1c21' : 'transparent',
          boxShadow: (!colorTagFilter || colorTagFilter === 'all') ? 'inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 3px rgba(0,0,0,0.6)' : 'none',
          color: (!colorTagFilter || colorTagFilter === 'all') ? '#f4f4f5' : '#71717a',
          fontWeight: (!colorTagFilter || colorTagFilter === 'all') ? 700 : 500,
          transition: 'all 0.15s ease',
        }}
      >
        All
      </button>

      {TAG_CONFIG.map(({ tag, label, color, bg }) => {
        const count = counts[tag] || 0;
        const isActive = colorTagFilter === tag;
        return (
          <button
            key={tag}
            type="button"
            className={`color-filter-pill ${isActive ? 'active' : ''}`}
            onClick={() => setColorTagFilter(isActive ? 'all' : tag)}
            title={`${label} (${count})`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              border: isActive ? `1px solid ${color}` : '1px solid transparent',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '5px',
              background: isActive ? bg : 'transparent',
              color: isActive ? color : '#a1a1aa',
              fontWeight: isActive ? 700 : 500,
              opacity: count > 0 ? 1 : 0.45,
              transition: 'all 0.15s ease',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: color,
                display: 'inline-block',
                boxShadow: isActive
                  ? `0 0 8px ${color}`
                  : 'inset 0 1px 0 rgba(255,255,255,0.35)',
              }}
            />
            {count > 0 && (
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', opacity: 0.9 }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
