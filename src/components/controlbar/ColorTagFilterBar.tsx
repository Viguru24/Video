import React, { useMemo } from 'react';
import type { VideoItem, ColorTag } from '../../types';
import { useStore } from '../../store/useStore';
import { Tag } from 'lucide-react';

interface ColorTagFilterBarProps {
  videos: VideoItem[];
}

const TAG_CONFIG: { tag: ColorTag; label: string; color: string; bg: string }[] = [
  { tag: 'red', label: 'Review', color: '#f87171', bg: 'rgba(239, 68, 68, 0.2)' },
  { tag: 'green', label: 'Approved', color: '#4ade80', bg: 'rgba(34, 197, 94, 0.2)' },
  { tag: 'blue', label: 'B-Roll', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.2)' },
  { tag: 'yellow', label: 'WIP', color: '#facc15', bg: 'rgba(234, 179, 8, 0.2)' },
  { tag: 'purple', label: 'Select', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.2)' },
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
        padding: '2px 6px',
        background: 'rgba(255, 255, 255, 0.04)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        fontSize: '11px',
      }}
      title="Dynamic Smart Filter by Color Tag"
    >
      <Tag size={12} style={{ color: 'var(--text-muted, #888)', marginRight: 2 }} />
      
      <button
        type="button"
        className={`color-filter-pill ${(!colorTagFilter || colorTagFilter === 'all') ? 'active' : ''}`}
        onClick={() => setColorTagFilter('all')}
        style={{
          border: 'none',
          cursor: 'pointer',
          padding: '2px 6px',
          borderRadius: '4px',
          background: (!colorTagFilter || colorTagFilter === 'all') ? 'rgba(255, 255, 255, 0.16)' : 'transparent',
          color: (!colorTagFilter || colorTagFilter === 'all') ? '#fff' : '#888',
          fontWeight: (!colorTagFilter || colorTagFilter === 'all') ? 600 : 400,
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
              padding: '2px 5px',
              borderRadius: '4px',
              background: isActive ? bg : 'transparent',
              color: isActive ? color : '#aaa',
              fontWeight: isActive ? 600 : 400,
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
                boxShadow: isActive ? `0 0 6px ${color}` : 'none',
              }}
            />
            {count > 0 && <span style={{ fontSize: '10px', opacity: 0.85 }}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
};
