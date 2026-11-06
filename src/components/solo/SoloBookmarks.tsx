import React, { useState, useEffect } from 'react';
import { Bookmark, Plus, Trash2, Edit2, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { BookmarkItem, VideoItem } from '../../types';

interface SoloBookmarksProps {
  video: VideoItem;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
}

export const SoloBookmarks: React.FC<SoloBookmarksProps> = ({
  video,
  currentTime,
  duration,
  onSeek,
  onUpdateVideo,
}) => {
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const bookmarks: BookmarkItem[] = video.bookmarks || [];

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAddBookmark = () => {
    const time = Math.round(currentTime * 10) / 10;
    const newBookmark: BookmarkItem = {
      id: `bm-${Date.now()}`,
      time: time,
      label: `Marker @ ${formatTime(time)}`,
      createdAt: Date.now(),
    };
    const next = [...bookmarks, newBookmark].sort((a, b) => a.time - b.time);
    onUpdateVideo(video.id, { bookmarks: next });
    setEditingId(newBookmark.id);
    setEditLabel(newBookmark.label);
    setShowDrawer(true);
  };

  const handleDeleteBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = bookmarks.filter(b => b.id !== id);
    onUpdateVideo(video.id, { bookmarks: next });
  };

  const handleSaveEdit = (id: string) => {
    const next = bookmarks.map(b => b.id === id ? { ...b, label: editLabel.trim() || b.label } : b);
    onUpdateVideo(video.id, { bookmarks: next });
    setEditingId(null);
  };

  const handleJumpPrev = () => {
    const prev = [...bookmarks].reverse().find(b => b.time < currentTime - 0.5);
    if (prev) onSeek(prev.time);
    else if (bookmarks.length > 0) onSeek(bookmarks[bookmarks.length - 1].time);
  };

  const handleJumpNext = () => {
    const next = bookmarks.find(b => b.time > currentTime + 0.5);
    if (next) onSeek(next.time);
    else if (bookmarks.length > 0) onSeek(bookmarks[0].time);
  };

  // Shortcut 'b' or 'B' drops bookmark at current time
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleAddBookmark();
      } else if (e.key === '[') {
        e.preventDefault();
        handleJumpPrev();
      } else if (e.key === ']') {
        e.preventDefault();
        handleJumpNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, bookmarks, video.id]);

  return (
    <div className="solo-bookmarks-root" style={{ position: 'relative' }}>
      {/* Control Buttons (Bookmark drop & list toggle) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          onClick={handleAddBookmark}
          title="Add Bookmark Pin at current time (Shortcut: B)"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '6px',
            color: '#fff',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Bookmark size={13} style={{ color: 'var(--accent, #00ff88)' }} />
          <span>Mark</span>
        </button>

        {bookmarks.length > 0 && (
          <>
            <button
              type="button"
              onClick={handleJumpPrev}
              title="Jump to Previous Marker ([)"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '6px',
                color: '#aaa',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              onClick={handleJumpNext}
              title="Jump to Next Marker (])"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '6px',
                color: '#aaa',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ChevronRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => setShowDrawer(prev => !prev)}
              title="View All Markers"
              style={{
                background: showDrawer ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '6px',
                color: showDrawer ? '#000' : '#fff',
                cursor: 'pointer',
                padding: '4px 6px',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              {bookmarks.length}
            </button>
          </>
        )}
      </div>

      {/* Markers Popover List */}
      {showDrawer && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: 0,
            zIndex: 1000,
            background: 'rgba(18, 18, 24, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            padding: '8px',
            minWidth: '240px',
            maxHeight: '260px',
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '2px 4px 6px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.6)',
              fontWeight: 600,
            }}
          >
            <span>Timeline Markers ({bookmarks.length})</span>
            <button
              type="button"
              onClick={() => setShowDrawer(false)}
              style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
            >
              <X size={12} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
            {bookmarks.map((bm) => {
              const isCurrent = Math.abs(currentTime - bm.time) < 1;
              const isEditing = editingId === bm.id;

              return (
                <div
                  key={bm.id}
                  onClick={() => onSeek(bm.time)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    background: isCurrent ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                    border: isCurrent ? '1px solid var(--accent, #00ff88)' : '1px solid transparent',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--accent, #00ff88)', fontFamily: 'monospace', fontWeight: 600 }}>
                      {formatTime(bm.time)}
                    </span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(bm.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        style={{
                          background: 'rgba(255, 255, 255, 0.15)',
                          border: 'none',
                          color: '#fff',
                          fontSize: '11px',
                          borderRadius: '3px',
                          padding: '1px 4px',
                          width: '110px',
                        }}
                      />
                    ) : (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ddd' }}>
                        {bm.label}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '6px' }}>
                    {isEditing ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSaveEdit(bm.id); }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent, #00ff88)', cursor: 'pointer' }}
                      >
                        <Check size={12} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(bm.id);
                          setEditLabel(bm.label);
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
                      >
                        <Edit2 size={11} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteBookmark(bm.id, e)}
                      style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
