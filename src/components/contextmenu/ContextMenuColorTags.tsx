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
  { tag: 'green', label: 'Approved', color: '#4ade80' },
  { tag: 'blue', label: 'B-Roll', color: '#60a5fa' },
  { tag: 'yellow', label: 'WIP', color: '#facc15' },
  { tag: 'purple', label: 'Select', color: '#c084fc' },
];

export const ContextMenuColorTags: React.FC<ContextMenuColorTagsProps> = ({
  currentColorTag,
  onSelectTag,
  selectedCount = 0,
}) => {
  return (
    <div style={{ padding: '6px 14px 8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.45)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '6px',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Tag size={12} />
          Color Tag {selectedCount > 1 ? `(${selectedCount})` : ''}
        </span>
        {currentColorTag && (
          <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>
            Active: {currentColorTag}
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
              title={`${label} (${tag})`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTag(`set_color_tag:${tag}`);
              }}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: color,
                border: isSelected ? '2px solid #ffffff' : '1px solid rgba(0,0,0,0.3)',
                boxShadow: isSelected ? `0 0 8px ${color}` : 'none',
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
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#aaa',
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
