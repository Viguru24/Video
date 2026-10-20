import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../../utils/videoUtils';
import type { VideoItem } from '../../types';

interface PopoutTitleBarProps {
  showUI: boolean;
  activeVideo: VideoItem | null;
  handleTitlebarMouseDown: (e: React.MouseEvent) => void;
  toggleMaximize: () => void;
}

export const PopoutTitleBar: React.FC<PopoutTitleBarProps> = ({
  showUI,
  activeVideo,
  handleTitlebarMouseDown,
  toggleMaximize,
}) => {
  return (
    <div 
      className="popout-titlebar"
      onMouseDown={handleTitlebarMouseDown}
      onDoubleClick={toggleMaximize}
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '40px', 
        zIndex: 99999, 
        background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
        cursor: showUI ? 'default' : 'none',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: '11px',
        fontWeight: 'bold',
        letterSpacing: '1px',
        textTransform: 'uppercase',
        pointerEvents: showUI ? 'auto' : 'none',
        userSelect: 'none',
        opacity: showUI ? 1 : 0,
        transition: 'opacity 0.3s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {!isTauri() && (
          <button
            onClick={() => {
              if (window.opener && !window.opener.closed) {
                window.close();
              } else {
                const url = new URL(window.location.href);
                url.searchParams.delete('popout');
                url.searchParams.delete('url');
                window.location.href = url.toString();
              }
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
              padding: '4px 12px',
              borderRadius: '16px',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textTransform: 'none',
              pointerEvents: 'auto'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.22)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
          >
            <ArrowLeft size={13} />
            <span>Back to Studio</span>
          </button>
        )}
        <span style={{ pointerEvents: 'none' }}>
          {activeVideo ? activeVideo.title : 'Cosmo Stream'}
        </span>
      </div>

      {/* Custom Window Controls */}
      <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', pointerEvents: 'auto' }}>
        <button 
          onClick={() => getCurrentWindow().minimize()}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'rgba(255, 255, 255, 0.45)', 
            cursor: 'pointer',
            fontSize: '12px',
            width: '28px',
            height: '28px',
            borderRadius: '4px',
            transition: 'background-color 0.2s, color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Minimize"
          onMouseEnter={e => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          ─
        </button>
        <button 
          onClick={toggleMaximize}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'rgba(255, 255, 255, 0.45)', 
            cursor: 'pointer',
            fontSize: '11px',
            width: '28px',
            height: '28px',
            borderRadius: '4px',
            transition: 'background-color 0.2s, color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Maximize / Restore"
          onMouseEnter={e => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          ❑
        </button>
        <button 
          onClick={() => {
            if (!isTauri()) {
              if (window.opener && !window.opener.closed) {
                window.close();
              } else {
                const url = new URL(window.location.href);
                url.searchParams.delete('popout');
                url.searchParams.delete('url');
                window.location.href = url.toString();
              }
              return;
            }
            invoke('close_popout').catch(() => getCurrentWindow().close());
          }}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'rgba(255, 255, 255, 0.45)', 
            cursor: 'pointer',
            fontSize: '13px',
            width: '28px',
            height: '28px',
            borderRadius: '4px',
            transition: 'background-color 0.2s, color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Close"
          onMouseEnter={e => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.backgroundColor = '#e81123';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};
