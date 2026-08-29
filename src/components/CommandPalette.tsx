import React, { useState, useEffect, useRef } from 'react';

interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon: string;
  action: () => void;
  shortcut?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionId: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectAction,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      id: 'whatsapp_share',
      title: 'Share... (Quick Share & Phone Transfer)',
      category: 'Sharing',
      icon: '🚀',
      shortcut: 'Ctrl+Shift+S',
      action: () => onSelectAction('whatsapp_share'),
    },
    {
      id: 'wifi_share',
      title: 'Wi-Fi Share & Phone Transfer',
      category: 'Sharing',
      icon: '📡',
      shortcut: 'Ctrl+Shift+W',
      action: () => onSelectAction('wifi_share'),
    },
    {
      id: 'color_grading',
      title: 'Color Adjustment & Grading Panel',
      category: 'Color',
      icon: '🎨',
      shortcut: 'Ctrl+Shift+C',
      action: () => onSelectAction('color_grading'),
    },
    {
      id: 'trim_crop_studio',
      title: 'Video Trimmer, Cropper & Panner Studio',
      category: 'Editing',
      icon: '✂️',
      shortcut: 'Ctrl+Shift+T',
      action: () => onSelectAction('trim_crop_studio'),
    },
    {
      id: 'reshape_studio',
      title: 'Reshape Studio & Crop Tools',
      category: 'Editing',
      icon: '📐',
      shortcut: 'Ctrl+Shift+R',
      action: () => onSelectAction('reshape_studio'),
    },
    {
      id: 'portrait_blur',
      title: 'Portrait Blur Studio',
      category: 'Editing',
      icon: '🖼️',
      shortcut: 'Ctrl+Shift+B',
      action: () => onSelectAction('portrait_blur'),
    },
    {
      id: 'frame_studio',
      title: 'Frame Studio & Photo Collages',
      category: 'Layout',
      icon: '🎞️',
      shortcut: 'Ctrl+Shift+F',
      action: () => onSelectAction('frame_studio'),
    },
    {
      id: 'export_video',
      title: 'Export Video (Promo Exporter)',
      category: 'Export',
      icon: '📤',
      shortcut: 'Ctrl+E',
      action: () => onSelectAction('export_video'),
    },
    {
      id: 'popout_player',
      title: 'Toggle Floating Popout Player',
      category: 'Playback',
      icon: '🪟',
      shortcut: 'Ctrl+P',
      action: () => onSelectAction('popout_player'),
    },
    {
      id: 'music_player',
      title: 'Music Player & Audio Waveforms',
      category: 'Audio',
      icon: '🎵',
      shortcut: 'Ctrl+M',
      action: () => onSelectAction('music_player'),
    },
    {
      id: 'help',
      title: 'Help & Keyboard Shortcuts',
      category: 'General',
      icon: '❓',
      shortcut: 'F1',
      action: () => onSelectAction('help'),
    },
  ];

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(query.toLowerCase()) ||
      cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev === 0 ? Math.max(0, filteredCommands.length - 1) : prev - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 15, 26, 0.8)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '100px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '600px',
          maxWidth: '90vw',
          backgroundColor: '#181824',
          border: '1px solid #334155',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid #2a2a3c',
          }}
        >
          <span style={{ fontSize: '20px', marginRight: '12px' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search studio tools... (Ctrl + K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '16px',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              backgroundColor: '#262636',
              color: '#94a3b8',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid #334155',
            }}
          >
            ESC
          </span>
        </div>

        {/* Command List */}
        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '8px 0' }}>
          {filteredCommands.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
              No tools or commands matching "{query}"
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 20px',
                    backgroundColor: isSelected ? '#2d2b45' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '20px', marginRight: '14px' }}>{cmd.icon}</span>
                    <div>
                      <div
                        style={{
                          color: isSelected ? '#00ff88' : '#ffffff',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          fontSize: '14px',
                        }}
                      >
                        {cmd.title}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {cmd.category}
                      </div>
                    </div>
                  </div>
                  {cmd.shortcut && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#a78bfa',
                        backgroundColor: '#1e1b2e',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: '1px solid #4c1d95',
                      }}
                    >
                      {cmd.shortcut}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 20px',
            backgroundColor: '#12121c',
            borderTop: '1px solid #2a2a3c',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#64748b',
          }}
        >
          <span>Use <strong>↑ ↓</strong> to navigate, <strong>Enter</strong> to select</span>
          <span>CosmoSymphony Command Palette</span>
        </div>
      </div>
    </div>
  );
};
