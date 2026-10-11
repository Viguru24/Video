import React from 'react';
import { ArrowUpDown, Check } from 'lucide-react';
import type { SortOption } from '../../types';

interface SortDropdownProps {
  sortOrder: SortOption;
  setSortOrder: (order: SortOption) => void;
  showSortDropdown: boolean;
  setShowSortDropdown: (show: boolean) => void;
  sortDropdownPos: { top: number; left: number };
  setSortDropdownPos: (pos: { top: number; left: number }) => void;
  sortButtonRef: React.RefObject<HTMLButtonElement | null>;
  sortDropdownRef: React.RefObject<HTMLDivElement | null>;
}

export const SortDropdown: React.FC<SortDropdownProps> = ({
  sortOrder,
  setSortOrder,
  showSortDropdown,
  setShowSortDropdown,
  sortDropdownPos,
  setSortDropdownPos,
  sortButtonRef,
  sortDropdownRef,
}) => {
  return (
    <>
      <div className="ctrl-group sort-group">
        <button
          ref={sortButtonRef}
          onClick={() => {
            if (!showSortDropdown && sortButtonRef.current) {
              const rect = sortButtonRef.current.getBoundingClientRect();
              setSortDropdownPos({ top: rect.bottom + 8, left: rect.left });
            }
            setShowSortDropdown(!showSortDropdown);
          }}
          className={`hdr-btn ${sortOrder !== 'custom' ? 'active-accent' : ''}`}
          data-tooltip="Sort Cards"
        >
          <ArrowUpDown size={14} />
        </button>
      </div>

      {showSortDropdown && (
        <div 
          ref={sortDropdownRef}
          className="sort-dropdown"
          style={{
            position: 'fixed',
            top: sortDropdownPos.top,
            left: sortDropdownPos.left,
            background: 'var(--bg-glass, rgba(13, 8, 27, 0.92))',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '6px 0',
            width: '200px',
            zIndex: 999999,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1)',
          }}
        >
          {[
            { label: 'Custom Order', value: 'custom' },
            { label: 'Sort: Videos First', value: 'videos-first' },
            { label: 'Sort: Stills First', value: 'pictures-first' },
            { label: 'Name (A -> Z)', value: 'name-asc' },
            { label: 'Name (Z -> A)', value: 'name-desc' },
            { label: 'Size (Small -> Large)', value: 'size-asc' },
            { label: 'Size (Large -> Small)', value: 'size-desc' },
            { label: 'Date Modified (Newest)', value: 'modified-newest' },
            { label: 'Date Modified (Oldest)', value: 'modified-oldest' },
            { label: 'Date Created (Newest)', value: 'created-newest' },
            { label: 'Date Created (Oldest)', value: 'created-oldest' },
          ].map(opt => (
            <div
              key={opt.value}
              className={`sort-dropdown-item ${sortOrder === opt.value ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                fontSize: '11px',
                color: sortOrder === opt.value ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: sortOrder === opt.value ? 'rgba(0, 255, 136, 0.05)' : 'transparent',
              }}
              onMouseDown={() => {
                setSortOrder(opt.value as SortOption);
                setShowSortDropdown(false);
              }}
              onMouseEnter={(e) => {
                if (sortOrder !== opt.value) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.color = '#fff';
                }
              }}
              onMouseLeave={(e) => {
                if (sortOrder !== opt.value) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                }
              }}
            >
              {sortOrder === opt.value ? <Check size={11} className="menu-check" /> : <div style={{ width: 11 }} />}
              <span>{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
