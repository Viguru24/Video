import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, Zap, X, Hash, ChevronDown, Trash2, Edit2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import type { VideoItem } from '../../types';
import { toCosmoUrl, pathsEqual, toRealPath, showConfirm } from '../../utils/videoUtils';

interface BatchRenameModalProps {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addLog: (msg: string) => void;
  onClose: () => void;
}

export function BatchRenameModal({ videos, setVideos, addLog, onClose }: BatchRenameModalProps) {
  const mouseDownOnOverlay = useRef(false);
  const { mediaMode, selectedIds, setSelectedIds, setSelectionMode, renameHistory, addToRenameHistory, removeFromRenameHistory, updateRenameHistory } = useStore();
  
  const [batchPrefix, setBatchPrefix] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [filterHistory, setFilterHistory] = useState(false);

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

  const executeBatchRename = async () => {
    const targets = selectedIds.size > 0 ? videos.filter(v => selectedIds.has(v.id)) : videos;
    
    if (targets.length === 0) {
      addLog("REJECTED: NO UNITS AVAILABLE FOR BATCH RENAMING.");
      return;
    }
    
    if (!await showConfirm(`CAUTION: This will rename ${targets.length} selected physical assets. Proceed?`, { title: 'Batch Rename', kind: 'warning' })) return;
    
    setIsRenaming(true);
    addLog(`INITIALIZING SMART BATCH RENAME: ${batchPrefix}_###`);
    
    const sorted = [...targets].sort((a, b) => {
      const idxA = videos.findIndex(v => v.id === a.id);
      const idxB = videos.findIndex(v => v.id === b.id);
      return idxA - idxB;
    });
    
    const newVideos = [...videos];
    const folderStartNums: { [key: string]: number } = {};
    const getParentDir = (filePath: string) => {
      const lastSlash = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
      return lastSlash !== -1 ? filePath.substring(0, lastSlash) : '';
    };
    
    for (let i = 0; i < sorted.length; i++) {
      const v = sorted[i];
      if (!v.realPath) continue;

      const targetPath = toRealPath(v.realPath) || v.realPath;
      const parentDir = getParentDir(targetPath);
      
      if (parentDir && folderStartNums[parentDir] === undefined) {
        try {
          const existingFiles = await invoke<any[]>('get_folder_videos', { path: parentDir, mode: 'all' });
          const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`^${escapeRegExp(batchPrefix)}_(\\d+)`, 'i');
          let maxNum = 0;
          for (const file of existingFiles) {
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            const match = regex.exec(nameWithoutExt);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNum) {
                maxNum = num;
              }
            }
          }
          folderStartNums[parentDir] = maxNum + 1;
          addLog(`Sequence continuation for "${batchPrefix}" in "${parentDir.split(/[\\/]/).pop()}": starting at ${String(maxNum + 1).padStart(3, '0')}`);
        } catch (err) {
          folderStartNums[parentDir] = 1;
        }
      }

      const currentStartNum = folderStartNums[parentDir] || 1;
      folderStartNums[parentDir] = currentStartNum + 1;

      const baseNewName = `${batchPrefix}_${String(currentStartNum).padStart(3, '0')}`;
      let finalNewName = baseNewName;
      let attempt = 0;
      let success = false;
      let lastError = "";

      while (!success && attempt < 10) {
        try {
          const resultPath = await invoke<string>('rename_video', { 
            oldPath: targetPath, 
            newName: finalNewName 
          });
          
          const finalName = resultPath.split(/[\\/]/).pop() || resultPath;
          
          const overwrittenIdx = newVideos.findIndex(nv => nv.id !== v.id && pathsEqual(nv.realPath, resultPath));
          if (overwrittenIdx !== -1) {
            newVideos.splice(overwrittenIdx, 1);
          }
          
          for (let k = 0; k < newVideos.length; k++) {
            let updated = false;
            const nv = { ...newVideos[k] };
            
            if (nv.id === v.id) {
              nv.title = finalName;
              nv.realPath = resultPath;
              nv.url = toCosmoUrl(resultPath);
              updated = true;
            } else if (pathsEqual(nv.realPath, v.realPath)) {
              nv.title = finalName;
              nv.realPath = resultPath;
              nv.url = toCosmoUrl(resultPath);
              updated = true;
            }
            
            if (nv.folderFiles) {
              let newFiles = nv.folderFiles;
              const hasOverwritten = newFiles.some(f => pathsEqual(f.path, resultPath));
              if (hasOverwritten) {
                newFiles = newFiles.filter(f => !pathsEqual(f.path, resultPath));
              }
              
              const hasFile = newFiles.some(f => pathsEqual(f.path, v.realPath));
              if (hasFile || hasOverwritten) {
                nv.folderFiles = newFiles.map(f => {
                  if (pathsEqual(f.path, v.realPath)) {
                    return {
                      ...f,
                      name: finalName,
                      path: resultPath,
                      url: toCosmoUrl(resultPath)
                    };
                  }
                  return f;
                });
                updated = true;
              }
            }
            
            if (updated) {
              newVideos[k] = nv;
            }
          }
          addLog(`SYNCED [${i+1}/${sorted.length}]: ${v.title} -> ${finalNewName}`);
          success = true;
        } catch (err: any) {
          lastError = err.toString();
          if (lastError.includes("already exists")) {
            attempt++;
            finalNewName = `${baseNewName}_${attempt}`;
            addLog(`CONFLICT: ${baseNewName} exists. Retrying as ${finalNewName}...`);
          } else {
            break;
          }
        }
      }

      if (!success) {
        addLog(`FAILED [${v.title}]: ${lastError}`);
      }
    }
    
    const newPrefix = batchPrefix.trim();
    if (newPrefix) {
      addToRenameHistory(newPrefix);
    }

    setVideos(newVideos);
    setIsRenaming(false);
    onClose();
    setSelectedIds(new Set()); 
    setSelectionMode(false);
    addLog(mediaMode === 'picture' ? "BATCH IMAGE RENAME COMPLETE." : "SMART BATCH ORCHESTRATION COMPLETE.");
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        mouseDownOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnOverlay.current && !isRenaming) {
          onClose();
        }
      }}
    >
      <div className="modal-content premium-glass" onClick={(e) => e.stopPropagation()} style={{ width: '420px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="accent-icon-box">
              <Hash size={20} className="text-accent" />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', letterSpacing: '1px' }}>
                {mediaMode === 'picture' ? 'BATCH IMAGE RENAME' : 'BATCH ORCHESTRATION'}
              </h2>
              <span style={{ fontSize: '9px', opacity: 0.5, fontWeight: 800 }}>
                {mediaMode === 'picture' ? 'SEQUENTIAL PHOTO INDEXING' : 'SEQUENTIAL ASSET RE-INDEXING'}
              </span>
            </div>
          </div>
          {!isRenaming && (
            <button onClick={onClose} className="premium-close-btn">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="modal-body">
          <div className="settings-section">
            <div className="setting-item">
              <label style={{ color: 'var(--accent)', fontSize: '10px', fontWeight: 900 }}>
                {mediaMode === 'picture' ? 'IMAGE PREFIX' : 'RE-INDEX PREFIX'}
              </label>
              <div style={{ position: 'relative', width: '100%', marginTop: '6px' }}>
                <input 
                  type="text" 
                  value={batchPrefix}
                  autoFocus
                  onChange={(e) => {
                    setBatchPrefix(e.target.value);
                    setShowHistoryDropdown(true);
                    setFilterHistory(true);
                  }}
                  onFocus={() => {
                    setShowHistoryDropdown(true);
                    setFilterHistory(false);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowHistoryDropdown(false), 200);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!isRenaming && batchPrefix.trim()) {
                        executeBatchRename();
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      onClose();
                    }
                  }}
                  placeholder=""
                  disabled={isRenaming}
                  onMouseDown={e => e.stopPropagation()}
                  className="premium-input"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowHistoryDropdown(!showHistoryDropdown);
                    setFilterHistory(false);
                  }}
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
                  disabled={isRenaming}
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                >
                  <ChevronDown size={16} />
                </button>
                
                {showHistoryDropdown && renameHistory.length > 0 && (
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
                      .filter(item => !filterHistory || !batchPrefix || item.toLowerCase().includes(batchPrefix.toLowerCase()))
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
                            borderBottom: idx < renameHistory.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                          }}
                          className="history-item-hover"
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.15)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <span
                            onClick={() => {
                              setBatchPrefix(item);
                              setShowHistoryDropdown(false);
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
            
            <div className="orchestration-preview">
                <div className="preview-header">
                  <span>{mediaMode === 'picture' ? 'RENAME PREVIEW' : 'SEQUENCE PREVIEW'}</span>
                  <span className="unit-count">
                    {(selectedIds.size > 0 ? selectedIds.size : videos.length)}{' '}
                    {mediaMode === 'picture' ? (selectedIds.size === 1 ? 'IMAGE TARGETED' : 'IMAGES TARGETED') : (selectedIds.size === 1 ? 'UNIT TARGETED' : 'UNITS TARGETED')}
                  </span>
                </div>
                <div className="preview-list">
                  <div className="preview-row">
                    <span className="old">{mediaMode === 'picture' ? 'OLD_NAME.jpg' : 'OLD_NAME.mp4'}</span>
                    <span className="arrow">→</span>
                    <span className="new">{batchPrefix || '...'}_001.{mediaMode === 'picture' ? 'jpg' : 'mp4'}</span>
                  </div>
                  <div className="preview-row">
                    <span className="old">{mediaMode === 'picture' ? 'OLD_NAME.jpg' : 'OLD_NAME.mp4'}</span>
                    <span className="arrow">→</span>
                    <span className="new">{batchPrefix || '...'}_002.{mediaMode === 'picture' ? 'jpg' : 'mp4'}</span>
                  </div>
                  <div className="preview-row muted">
                    {mediaMode === 'picture' 
                      ? '...Sequential renaming applied to all images.' 
                      : '...Sequential re-indexing applied to all units.'}
                  </div>
                </div>
            </div>
            
            <button 
              onClick={executeBatchRename} 
              disabled={isRenaming || !batchPrefix.trim()}
              className={`execute-btn ${isRenaming ? 'loading' : ''} ${(selectedIds.size > 0 ? selectedIds.size : videos.length) === 0 ? 'disabled-selection' : ''}`}
            >
              {isRenaming ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>{mediaMode === 'picture' ? 'RENAMING IMAGES...' : 'INITIALIZING SYNC...'}</span>
                </>
              ) : (
                <>
                  <Zap size={16} />
                  <span>{mediaMode === 'picture' ? 'RENAME IMAGES' : 'EXECUTE SEQUENCE'}</span>
                </>
              )}
            </button>
            
            <p style={{ fontSize: '9px', opacity: 0.4, textAlign: 'center', marginTop: '12px', lineHeight: '1.4' }}>
              CAUTION: Physical {mediaMode === 'picture' ? 'images' : 'assets'} will be renamed on disk. This operation is non-reversible within the Symphony Workshop.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
