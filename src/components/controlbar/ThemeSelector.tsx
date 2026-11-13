import React from 'react';
import { ChevronDown, Palette } from 'lucide-react';

const THEME_OPTIONS: {
  id: string;
  label: string;
  shortLabel: string;
  dotClass: string;
  logLabel: string;
}[] = [
  { id: 'symphony', label: 'Obsidian Emerald', shortLabel: 'OBSIDIAN', dotClass: 'aurora-dot', logLabel: 'OBSIDIAN EMERALD' },
  { id: 'midnight', label: 'Tungsten Cinema', shortLabel: 'TUNGSTEN', dotClass: 'velvet-dot', logLabel: 'TUNGSTEN CINEMA' },
  { id: 'nordic', label: 'Surgical Teal', shortLabel: 'SURGICAL', dotClass: 'frost-dot', logLabel: 'SURGICAL TEAL' },
  { id: 'cobalt', label: 'Titanium Studio', shortLabel: 'TITANIUM', dotClass: 'cobalt-dot', logLabel: 'TITANIUM STUDIO' }
];

interface ThemeSelectorProps {
  theme: string;
  setTheme: (theme: string) => void;
  addLog: (msg: string) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ theme, setTheme, addLog }) => {
  const activeOption = THEME_OPTIONS.find((opt) => opt.id === theme) ?? THEME_OPTIONS[0];

  return (
    <div className="theme-select-container" onMouseDown={(e) => e.stopPropagation()}>
      <button className="hdr-btn theme-trigger-btn">
        <Palette size={14} />
        <span className="theme-text-lbl">{activeOption.shortLabel}</span>
        <ChevronDown size={10} className="theme-arrow-icon" />
      </button>
      <div className="theme-glass-dropdown">
        {THEME_OPTIONS.map((opt) => {
          const isActive = opt.id === activeOption.id;
          return (
            <div
              key={opt.id}
              className={`theme-dropdown-item ${isActive ? 'active' : ''}`}
              onClick={() => {
                setTheme(opt.id);
                addLog(`THEME SHIFT: ${opt.logLabel}`);
              }}
            >
              <span className={`theme-preview-dot ${opt.dotClass}`} />
              <span className="theme-dropdown-lbl">{opt.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
