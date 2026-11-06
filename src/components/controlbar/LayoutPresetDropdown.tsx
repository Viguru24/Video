import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Check, Plus, Trash2, Sliders } from 'lucide-react';
import { useStore } from '../../store/useStore';
import type { LayoutPreset } from '../../types';

interface LayoutPresetDropdownProps {
  onApplyPreset?: (preset: LayoutPreset) => void;
}

export const LayoutPresetDropdown: React.FC<LayoutPresetDropdownProps> = ({ onApplyPreset }) => {
  const { zoom, setZoom, layoutPresets, setLayoutPresets, activeLayoutPresetId, setActiveLayoutPresetId } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setShowSaveInput(false);
      }
    };
    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Global hotkeys Ctrl+Alt+1..5
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && !e.shiftKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 5 && layoutPresets[num - 1]) {
          e.preventDefault();
          const target = layoutPresets[num - 1];
          setZoom(target.zoom);
          setActiveLayoutPresetId(target.id);
          onApplyPreset?.(target);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layoutPresets, setZoom, setActiveLayoutPresetId, onApplyPreset]);

  const handleSelectPreset = (preset: LayoutPreset) => {
    setZoom(preset.zoom);
    setActiveLayoutPresetId(preset.id);
    onApplyPreset?.(preset);
    setIsOpen(false);
  };

  const handleSaveCurrentLayout = () => {
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    const newPreset: LayoutPreset = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      cols: zoom,
      zoom: zoom,
      description: `Custom ${zoom} column grid configuration`,
      isCustom: true,
    };
    const next = [...layoutPresets, newPreset];
    setLayoutPresets(next);
    setActiveLayoutPresetId(newPreset.id);
    setNewPresetName('');
    setShowSaveInput(false);
  };

  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = layoutPresets.filter(p => p.id !== id);
    setLayoutPresets(next);
    if (activeLayoutPresetId === id) {
      setActiveLayoutPresetId(null);
    }
  };

  return (
    <div className="layout-preset-container" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        className={`hdr-btn ${isOpen ? 'active-accent' : ''}`}
        onClick={() => setIsOpen(prev => !prev)}
        data-tooltip="Workspace Layout Presets (Ctrl+Alt+1..5)"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          fontSize: '11px',
        }}
      >
        <LayoutGrid size={14} style={{ color: 'var(--accent, #00ff88)' }} />
        <span style={{ fontSize: '11px', fontWeight: 500 }}>Layout</span>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="layout-preset-dropdown-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 1000,
            background: 'rgba(18, 18, 22, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '10px',
            padding: '6px',
            minWidth: '220px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div
            style={{
              padding: '4px 8px 6px',
              fontSize: '10px',
              color: 'rgba(255, 255, 255, 0.45)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Grid Layout Presets</span>
            <span style={{ opacity: 0.6 }}>Ctrl+Alt+1..5</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {layoutPresets.map((preset, index) => {
              const isActive = zoom === preset.zoom || activeLayoutPresetId === preset.id;
              return (
                <div
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: isActive ? 'rgba(0, 255, 136, 0.12)' : 'transparent',
                    color: isActive ? 'var(--accent, #00ff88)' : '#eee',
                    fontSize: '12px',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', width: '12px' }}>
                      {index < 5 ? `${index + 1}` : '•'}
                    </span>
                    <div>
                      <div style={{ fontWeight: isActive ? 600 : 400 }}>{preset.name}</div>
                      {preset.description && (
                        <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.45)' }}>
                          {preset.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isActive && <Check size={14} style={{ color: 'var(--accent, #00ff88)' }} />}
                    {preset.isCustom && (
                      <button
                        type="button"
                        onClick={(e) => handleDeletePreset(preset.id, e)}
                        title="Delete custom preset"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f87171',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ margin: '6px 0', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }} />

          {showSaveInput ? (
            <div style={{ padding: '4px', display: 'flex', gap: '4px' }}>
              <input
                type="text"
                placeholder="Preset Name..."
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveCurrentLayout();
                  if (e.key === 'Escape') setShowSaveInput(false);
                }}
                autoFocus
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '11px',
                  padding: '4px 6px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleSaveCurrentLayout}
                style={{
                  background: 'var(--accent, #00ff88)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveInput(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--accent, #00ff88)',
                cursor: 'pointer',
                borderRadius: '6px',
                fontSize: '11px',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 255, 136, 0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Plus size={12} />
              <span>Save Current Layout (Zoom: {zoom})...</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
