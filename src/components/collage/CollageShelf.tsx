import React from 'react';
import { ChevronLeft, Plus, FileVideo } from 'lucide-react';
import type { VideoItem } from '../../types';
import { isValidPictureExtension } from '../../utils/videoUtils';

interface CollageShelfProps {
  showShelf: boolean;
  onClose: () => void;
  videos: VideoItem[];
  onAddItem: (item: VideoItem) => void;
}

export const CollageShelf: React.FC<CollageShelfProps> = ({
  showShelf,
  onClose,
  videos,
  onAddItem
}) => {
  return (
    <div 
      style={{
        width: showShelf ? '280px' : '0px',
        background: 'rgba(12, 12, 16, 0.95)',
        backdropFilter: 'blur(16px)',
        borderRight: showShelf ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
        zIndex: 10
      }}
    >
      <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', color: '#fff' }}>Grid Tiles</h3>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>CLICK TO DROP ON CANVAS</span>
        </div>
        <button 
          className="sidebar-close-btn"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Media List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }} className="video-scroll">
        {videos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 10px', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
            No tiles available. Ingest files in the Media Grid first.
          </div>
        ) : (
          videos.map(v => {
            const isImg = isValidPictureExtension(v.realPath || '');
            return (
              <div 
                key={v.id}
                onClick={() => onAddItem(v)}
                className="premium-glass"
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {isImg ? (
                    <img src={v.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  ) : (
                    <FileVideo size={16} style={{ color: 'var(--accent, #00ff88)' }} />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: '11px', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v.title}
                  </span>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {isImg ? 'IMAGE' : 'VIDEO'}
                  </span>
                </div>
                <Plus size={14} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
