import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../../utils/videoUtils';

interface WindowControlsMenuProps {
  isSpanned: boolean;
  setIsSpanned: (val: boolean) => void;
  showMaxMenu: boolean;
  setShowMaxMenu: React.Dispatch<React.SetStateAction<boolean>>;
  isWindowMaximized: boolean;
}

const dropdownBtnBase: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: '11px',
  padding: '6px 12px',
  cursor: 'pointer',
  textAlign: 'left',
  borderRadius: '4px',
  whiteSpace: 'nowrap',
  fontWeight: 'bold'
};

export const WindowControlsMenu: React.FC<WindowControlsMenuProps> = ({
  isSpanned,
  setIsSpanned,
  showMaxMenu,
  setShowMaxMenu,
  isWindowMaximized
}) => {
  if (!isTauri()) return null;

  return (
    <div
      className="window-controls"
      style={{ display: 'flex', gap: '8px', marginLeft: 'auto', paddingRight: '4px', zIndex: 1001, pointerEvents: 'auto', position: 'relative' }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <button className="win-dot min" onClick={() => getCurrentWindow().minimize()} title="Minimize" />
      <button
        className="win-dot max"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowMaxMenu((prev) => !prev);
        }}
        title="Maximize Options"
      />
      <button className="win-dot close" onClick={() => getCurrentWindow().close()} title="Close" />

      {showMaxMenu && (
        <div
          className="max-options-dropdown"
          style={{
            position: 'absolute',
            top: '25px',
            right: '15px',
            background: 'var(--glass-bg, #141418)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '10px',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: 'var(--bevel-panel)',
            zIndex: 100002
          }}
        >
          <button
            onClick={() => {
              getCurrentWindow().maximize();
              setShowMaxMenu(false);
              setIsSpanned(false);
            }}
            style={{ ...dropdownBtnBase, color: '#fff' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            Maximize Single Screen
          </button>
          <button
            onClick={() => {
              invoke('span_all_monitors').catch(console.error);
              setShowMaxMenu(false);
              setIsSpanned(true);
            }}
            style={{ ...dropdownBtnBase, color: 'var(--accent, #00ff88)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            Span Dual/All Screens
          </button>
          {(isSpanned || isWindowMaximized) && (
            <button
              onClick={async () => {
                if (isSpanned) {
                  invoke('unspan_monitors').catch(console.error);
                  setIsSpanned(false);
                } else {
                  const win = getCurrentWindow();
                  if (await win.isMaximized()) {
                    win.unmaximize();
                  }
                }
                setShowMaxMenu(false);
              }}
              style={{ ...dropdownBtnBase, color: '#ff4d4d' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              Restore Window
            </button>
          )}
        </div>
      )}
    </div>
  );
};
