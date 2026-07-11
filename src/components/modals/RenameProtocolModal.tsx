import { useState, useRef, useEffect } from 'react';
import { Bookmark, X, ChevronDown, Zap, Trash2, Edit2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../../types';
import { toCosmoUrl, pathsEqual, toRealPath } from '../../utils/videoUtils';
import { useStore } from '../../store/useStore';

interface RenameProtocolModalProps {
  target: VideoItem;
  renameHistory: string[];
  addToRenameHistory: (name: string) => void;
  onClose: () => void;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addLog: (msg: string) => void;
}

export function RenameProtocolModal({
  target,
  renameHistory,
  addToRenameHistory,
  onClose,
  setVideos,
  addLog,
}: RenameProtocolModalProps) {
  const mouseDownOnOverlay = useRef(false);
  const [singleRenameValue, setSingleRenameValue] = useState('');
  const [singleRenameFiltering, setSingleRenameFiltering] = useState(false);
  const [showSingleRenameDropdown, setShowSingleRenameDropdown] = useState(false);

  const removeFromRenameHistory = useStore((state) => state.removeFromRenameHistory);
  const updateRenameHistory = useStore((state) => state.updateRenameHistory);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [nextSequenceNum, setNextSequenceNum] = useState<number | null>(null);

  // Scan the folder for existing files matching the prefix to determine the next sequence number
  useEffect(() => {
    const prefix = singleRenameValue.trim();
    if (!prefix) {
      setNextSequenceNum(null);
      return;
    }

    const targetPath = toRealPath(target.realPath) || target.realPath;
    const lastSlash = Math.max(targetPath.lastIndexOf('\\'), targetPath.lastIndexOf('/'));
    const parentDir = lastSlash !== -1 ? targetPath.substring(0, lastSlash) : '';

    if (!parentDir) {
      setNextSequenceNum(1);
      return;
    }

    const timer = setTimeout(() => {
      invoke<any[]>('get_folder_videos', { path: parentDir, mode: 'all' })
        .then((existingFiles) => {
          const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`^${escapeRegExp(prefix)}_(\\d+)`, 'i');
          let maxNum = 0;
          for (const file of existingFiles) {
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            const match = regex.exec(nameWithoutExt);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNum) {
                maxNum = num;
              }
            }
          }
          setNextSequenceNum(maxNum + 1);
        })
        .catch(() => {
          setNextSequenceNum(1);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [singleRenameValue, target.realPath]);

  const handleApplyRename = () => {
    const prefix = singleRenameValue.trim();
    if (!prefix) return;

    const targetPath = toRealPath(target.realPath) || target.realPath;
    const seqNum = nextSequenceNum || 1;
    const newName = `${prefix}_${String(seqNum).padStart(3, '0')}`;

    invoke<string>('rename_video', { oldPath: targetPath, newName })
      .then((newPath) => {
        const actualFilename = newPath.replace(/\\/g, '/').split('/').pop() || '';

        // Update across all video cards and folderFiles
        setVideos((prev) => {
          const filtered = prev.filter(
            (vid) => vid.id === target.id || !pathsEqual(vid.realPath, newPath)
          );

          return filtered.map((vid) => {
            let updated = false;
            const newVid = { ...vid };

            if (vid.id === target.id) {
              newVid.realPath = newPath;
              newVid.url = toCosmoUrl(newPath);
              newVid.title = actualFilename;
              updated = true;
            } else if (pathsEqual(vid.realPath, target.realPath)) {
              newVid.realPath = newPath;
              newVid.url = toCosmoUrl(newPath);
              newVid.title = actualFilename;
              updated = true;
            }

            if (vid.folderFiles) {
              const hasOverwritten = vid.folderFiles.some((f) => pathsEqual(f.path, newPath));
              const hasRenamed = vid.folderFiles.some((f) =>
                pathsEqual(f.path, target.realPath)
              );

              if (hasOverwritten || hasRenamed) {
                let newFiles = vid.folderFiles;
                if (hasOverwritten) {
                  newFiles = newFiles.filter((f) => !pathsEqual(f.path, newPath));
                }
                newVid.folderFiles = newFiles.map((f) => {
                  if (pathsEqual(f.path, target.realPath)) {
                    return {
                      ...f,
                      name: actualFilename,
                      path: newPath,
                      url: toCosmoUrl(newPath),
                    };
                  }
                  return f;
                });
                updated = true;
              }
            }

            return updated ? newVid : vid;
          });
        });

        addLog(`Unit renamed: ${actualFilename}`);
        addToRenameHistory(prefix);
        onClose();
      })
      .catch((err) => {
        console.error("Rename failed:", err);
        addLog(`ERROR: Rename failed — ${err}`);
        onClose();
      });
  };

  const isButtonDisabled = !singleRenameValue.trim();


  const resolvedPath = toRealPath(target.realPath) || target.realPath || '';
  const cleanPath = resolvedPath.split('?')[0];
  const lastDot = cleanPath.lastIndexOf('.');
  const ext = lastDot !== -1 ? cleanPath.substring(lastDot) : '';

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        mouseDownOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnOverlay.current) {
          onClose();
        }
      }}
    >
      <div
        className="modal-content premium-glass"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '420px' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="accent-icon-box">
              <Bookmark size={20} className="text-accent" />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', letterSpacing: '1px' }}>RENAME PROTOCOL</h2>
              <span style={{ fontSize: '9px', opacity: 0.5, fontWeight: 800 }}>
                PHYSICAL ASSET MODIFICATION
              </span>
            </div>
          </div>
          <button onClick={onClose} className="premium-close-btn">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="settings-section">
            <div className="setting-item">
              <label style={{ color: 'var(--accent)', fontSize: '10px', fontWeight: 900 }}>
                NEW ASSET NAME
              </label>
              <div style={{ position: 'relative', width: '100%', marginTop: '6px' }}>
                <input
                  type="text"
                  value={singleRenameValue}
                  autoFocus
                  onChange={(e) => {
                    setSingleRenameValue(e.target.value);
                    setSingleRenameFiltering(true);
                    setShowSingleRenameDropdown(true);
                  }}
                  onFocus={() => {
                    setSingleRenameFiltering(false);
                    setShowSingleRenameDropdown(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSingleRenameDropdown(false), 200);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!isButtonDisabled) {
                        handleApplyRename();
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      onClose();
                    }
                  }}
                  placeholder="Enter new name..."
                  onMouseDown={(e) => e.stopPropagation()}
                  className="premium-input"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowSingleRenameDropdown(!showSingleRenameDropdown)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.7,
                    transition: 'opacity 0.2s',
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <ChevronDown size={16} />
                </button>

                {showSingleRenameDropdown && renameHistory.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      width: '100%',
                      maxHeight: '150px',
                      overflowY: 'auto',
                      background: 'rgba(15, 15, 15, 0.95)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      zIndex: 9999,
                      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
                    }}
                  >
                    {renameHistory
                      .filter(
                        (item) =>
                          !singleRenameFiltering ||
                          !singleRenameValue ||
                          item.toLowerCase().includes(singleRenameValue.toLowerCase())
                      )
                      .map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 16px',
                            fontSize: '12px',
                            color: '#fff',
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                            borderBottom:
                              idx < renameHistory.length - 1
                                ? '1px solid rgba(255, 255, 255, 0.05)'
                                : 'none',
                          }}
                          className="history-item-hover"
                          onMouseOver={(e) =>
                            (e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.15)')
                          }
                          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span 
                            onClick={() => {
                              setSingleRenameValue(item);
                              setShowSingleRenameDropdown(false);
                            }}
                            style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
                          >
                            {item}
                          </span>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              type="button"
                              title="Edit Entry"
                              onClick={(e) => {
                                e.stopPropagation();
                                const val = prompt("Edit Rename History Entry:", item);
                                if (val !== null) {
                                  const trimmed = val.trim();
                                  if (trimmed && trimmed !== item) {
                                    updateRenameHistory(item, trimmed);
                                  }
                                }
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'rgba(255, 255, 255, 0.5)',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.2s',
                              }}
                              onMouseOver={(e) => e.currentTarget.style.color = 'var(--accent)'}
                              onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)'}
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              type="button"
                              title="Delete Entry"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromRenameHistory(item);
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'rgba(255, 255, 255, 0.5)',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.2s',
                              }}
                              onMouseOver={(e) => e.currentTarget.style.color = '#ff4a4a'}
                              onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)'}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  fontSize: '10px',
                  color: 'rgba(255,255,255,0.4)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>ORIGINAL:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{target.title}</span>
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--accent)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>TARGET:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {singleRenameValue.trim()
                    ? `${singleRenameValue.trim()}_${String(nextSequenceNum || 1).padStart(3, '0')}${ext}`
                    : `...${ext}`}
                </span>
              </div>
            </div>

            <button
              onClick={handleApplyRename}
              disabled={isButtonDisabled}
              className="execute-btn"
              style={{ marginTop: '20px' }}
            >
              <Zap size={16} />
              <span>APPLY RENAME</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
