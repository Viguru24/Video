import React from 'react';
import { Tag, X } from 'lucide-react';
import type { ColorTag } from '../../types';

interface ContextMenuColorTagsProps {
  currentColorTag?: ColorTag | null;
  onSelectTag: (tag: string) => void;
  selectedCount?: number;
}

const TAGS: { tag: ColorTag; label: string; color: string }[] = [
  { tag: 'red', label: 'Review', color: '#f87171' },
  { tag: 'green', label: 'Approved', color: '#34d399' },
  { tag: 'blue', label: 'B-Roll', color: '#38bdf8' },
  { tag: 'yellow', label: 'WIP', color: '#facc15' },
  { tag: 'purple', label: 'Select', color: '#fb923c' },
];

export const ContextMenuColorTags: React.FC<ContextMenuColorTagsProps> = ({
  currentColorTag,
  onSelectTag,
  selectedCount = 0,
}) => {
  const activeLabel = currentColorTag
    ? TAGS.find((t) => t.tag === currentColorTag)?.label || currentColorTag
    : null;

  return (
    <div style={{ padding: '6px 14px 8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '10px',
          fontWeight: 700,
          color: 'rgba(255, 255, 255, 0.45)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '7px',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Tag size={11} />
          Color Tag {selectedCount > 1 ? `(${selectedCount})` : ''}
        </span>
        {activeLabel && (
          <span style={{ fontSize: '10px', color: '#fbbf24', fontFamily: 'var(--font-mono, monospace)' }}>
            {activeLabel}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {TAGS.map(({ tag, label, color }) => {
          const isSelected = currentColorTag === tag;
          return (
            <button
              key={tag}
              type="button"
              title={label}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTag(`set_color_tag:${tag}`);
              }}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: color,
                border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.22)',
                boxShadow: isSelected
                  ? `0 0 10px ${color}, inset 0 1px 0 rgba(255,255,255,0.45)`
                  : 'inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 4px rgba(0,0,0,0.6)',
                cursor: 'pointer',
                transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                padding: 0,
              }}
            />
          );
        })}

        <button
          type="button"
          title="Clear Tag"
          onClick={(e) => {
            e.stopPropagation();
            onSelectTag('set_color_tag:none');
          }}
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: '#1c1c21',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.5)',
            color: '#a1a1aa',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <X size={10} />
        </button>
      </div>
    </div>
  );
};
