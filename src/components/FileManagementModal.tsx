import React, { useState, useEffect, useRef } from 'react';
import { Folder, FolderPlus, ArrowRight, Copy, Loader, X, Search, Pin, ChevronDown, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { toRealPath } from '../utils/videoUtils';

interface FileManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: VideoItem[];
  mode: 'move' | 'copy';
  activeGridFolders: string[];
  onSuccess: (updatedItems: { originalId: string; newPath: string }[]) => void;
  addLog: (msg: string) => void;
}

export function FileManagementModal({
  isOpen,
  onClose,
  items,
  mode,
  activeGridFolders,
  onSuccess,
  addLog
}: FileManagementModalProps) {
  const [parentDir, setParentDir] = useState<string>('');
  const [subdirectories, setSubdirectories] = useState<string[]>([]);
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [pinnedFolders, setPinnedFolders] = useState<string[]>([]);
  
  // Selection states
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  
  // Refs
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // New folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  
  // Execution states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');

  // Collision states
  const [collisionInfo, setCollisionInfo] = useState<{
    filename: string;
    resolve: (choice: 'overwrite' | 'keep-both' | 'skip' | 'cancel', applyToAll: boolean) => void;
  } | null>(null);
  const [applyToAllChoice, setApplyToAllChoice] = useState<'overwrite' | 'keep-both' | 'skip' | null>(null);
  const applyToAllRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // If we are currently processing files, do not close via Escape to avoid half-done operations
      if (isProcessing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isProcessing]);

  // Load initial settings and directory data
  useEffect(() => {
    if (!isOpen || items.length === 0) return;
    
    // Resolve the parent directory of the target items
    const firstItem = items[0];
    const path = firstItem.realPath || '';
    const separator = path.includes('\\') ? '\\' : '/';
    const lastSlashIdx = path.lastIndexOf(separator);
    const resolvedParent = lastSlashIdx !== -1 ? path.substring(0, lastSlashIdx) : '';
    setParentDir(resolvedParent);

    // Load recent folders
    const recentsRaw = localStorage.getItem('cosmo-recent-folders');
    if (recentsRaw) {
      try {
        setRecentFolders(JSON.parse(recentsRaw));
      } catch (e) {
        console.error("Failed to parse recent folders:", e);
      }
    }

    // Load pinned folders from Tauri persistence
    invoke<string | null>('load_persistence', { key: 'pinned_folders' })
      .then(res => {
        if (res) {
          try {
            setPinnedFolders(JSON.parse(res));
          } catch (e) {
            console.error("Failed to parse pinned folders:", e);
          }
        }
      })
      .catch(err => {
        console.error("Failed to load pinned folders:", err);
      });

    // Fetch subdirectories in parent directory
    if (resolvedParent) {
      invoke<string[]>('get_subdirectories', { dirPath: resolvedParent })
        .then(setSubdirectories)
        .catch(err => {
          console.error("Failed to fetch subdirectories:", err);
          addLog(`FS Error: Unable to list subdirectories: ${err}`);
        });
    }

    // Reset processing state
    setIsProcessing(false);
    setProgressText('');
    setSelectedFolder('');
    setIsDropdownOpen(false);
    setIsCreatingFolder(false);
    setNewFolderName('');
  }, [isOpen, items]);

  // Handle clicking outside custom dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  if (!isOpen || items.length === 0) return null;

  const handleBrowseFolder = async () => {
    try {
      const folder = await invoke<string | null>('select_folder_cmd');
      if (folder) {
        setSelectedFolder(folder);
        updateRecentFolders(folder);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const path = await invoke<string>('create_new_folder', {
        parentDir,
        folderName: newFolderName.trim()
      });
      addLog(`SUCCESS: Folder created at ${path}`);
      
      // Refresh subdirectories
      const updatedSubdirs = await invoke<string[]>('get_subdirectories', { dirPath: parentDir });
      setSubdirectories(updatedSubdirs);
      
      // Select the new folder
      setSelectedFolder(path);
      setIsCreatingFolder(false);
      setNewFolderName('');
    } catch (err) {
      addLog(`ERROR: Failed to create folder - ${err}`);
      alert(`Folder creation failed: ${err}`);
    }
  };

  const updateRecentFolders = (folder: string) => {
    setRecentFolders(prev => {
      const filtered = prev.filter(f => f !== folder);
      const next = [folder, ...filtered].slice(0, 10);
      localStorage.setItem('cosmo-recent-folders', JSON.stringify(next));
      return next;
    });
  };

  const savePinnedFolders = async (folders: string[]) => {
    try {
      await invoke('save_persistence', { key: 'pinned_folders', data: JSON.stringify(folders) });
    } catch (err) {
      console.error("Failed to save pinned folders:", err);
    }
  };

  const handleTogglePin = () => {
    if (!selectedFolder.trim()) return;
    const path = selectedFolder.trim();
    let next: string[];
    if (pinnedFolders.includes(path)) {
      next = pinnedFolders.filter(f => f !== path);
    } else {
      next = [path, ...pinnedFolders];
    }
    setPinnedFolders(next);
    savePinnedFolders(next);
  };

  const handleUnpinFolder = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = pinnedFolders.filter(f => f !== path);
    setPinnedFolders(next);
    savePinnedFolders(next);
  };

  const handleExecute = async () => {
    if (!selectedFolder) {
      alert("Please select or enter a target folder.");
      return;
    }

    setIsProcessing(true);
    setApplyToAllChoice(null); // Reset choice for new operation
    const updatedItemsList: { originalId: string; newPath: string }[] = [];
    const opLabel = mode === 'move' ? 'Moving' : 'Copying';
    
    // Save selected folder to recents
    updateRecentFolders(selectedFolder);

    const cleanDestFolder = toRealPath(selectedFolder) || selectedFolder;

    try {
      let localApplyToAllChoice: 'overwrite' | 'keep-both' | 'skip' | null = null;
      let cancelled = false;
      const failedItems: string[] = [];

      for (let i = 0; i < items.length; i++) {
        if (cancelled) break;
        const item = items[i];
        setProgressText(`${opLabel} file ${i + 1} of ${items.length}: ${item.title}...`);
        
        const path = item.realPath || '';
        if (!path) {
          addLog(`SKIPPED: Path missing for ${item.title}`);
          continue;
        }

        const cleanSrcPath = toRealPath(path) || path;
        const separator = cleanSrcPath.includes('/') ? '/' : '\\';
        const fileName = cleanSrcPath.substring(cleanSrcPath.lastIndexOf(separator) + 1);
        const destFilePath = `${cleanDestFolder}${separator}${fileName}`;

        // Verify source file still exists before attempting move
        try {
          const srcExists = await invoke<boolean>('file_exists', { path: cleanSrcPath });
          if (!srcExists) {
            addLog(`SKIPPED: Source file no longer exists at ${cleanSrcPath} — it may have been moved already.`);
            failedItems.push(item.title);
            continue;
          }
        } catch {
          // If we can't verify, proceed with the move attempt anyway
        }

        const exists = await invoke<boolean>('file_exists', { path: destFilePath });
        let choice: 'overwrite' | 'keep-both' | 'skip' | 'cancel' = 'keep-both';

        if (exists) {
          if (localApplyToAllChoice) {
            choice = localApplyToAllChoice;
          } else {
            // Wait for user collision choice
            choice = await new Promise<'overwrite' | 'keep-both' | 'skip' | 'cancel'>((resolve) => {
              setCollisionInfo({
                filename: fileName,
                resolve: (userChoice, applyToAll) => {
                  if (applyToAll) {
                    localApplyToAllChoice = userChoice;
                    setApplyToAllChoice(userChoice);
                  }
                  resolve(userChoice);
                }
              });
            });
            setCollisionInfo(null);
          }
        } else {
          choice = 'overwrite'; // No collision, proceed as overwrite
        }

        if (choice === 'cancel') {
          addLog(`${opLabel} cancelled by user.`);
          cancelled = true;
          break;
        }

        if (choice === 'skip') {
          addLog(`SKIPPED: ${fileName} (User choice: Skip conflict)`);
          continue;
        }

        const overwrite = choice === 'overwrite';
        const renameSibling = choice === 'keep-both';

        // Per-file error handling: if one file fails, the rest can still succeed
        try {
          const cmd = mode === 'move' ? 'move_file_on_disk' : 'copy_file_on_disk';
          const newPath = await invoke<string>(cmd, {
            srcPath: cleanSrcPath,
            destDir: cleanDestFolder,
            overwrite,
            renameSibling
          });
          
          updatedItemsList.push({ originalId: item.id, newPath });
          addLog(`SUCCESS: ${opLabel} completed for ${item.title}`);
        } catch (fileErr) {
          console.error(`Failed to ${mode} ${item.title}:`, fileErr);
          addLog(`ERROR: Failed to ${mode} "${item.title}" — ${fileErr}`);
          failedItems.push(item.title);
        }
      }

      // Always sync the grid for items that succeeded, even if some failed
      if (updatedItemsList.length > 0) {
        onSuccess(updatedItemsList);
      }

      if (failedItems.length > 0) {
        addLog(`WARNING: ${failedItems.length} file(s) could not be ${mode}d: ${failedItems.join(', ')}`);
      }

      onClose();
    } catch (err) {
      // Catastrophic failure (e.g., modal state error) — still sync whatever succeeded
      console.error(err);
      addLog(`CRITICAL: ${opLabel} failed - ${err}`);
      if (updatedItemsList.length > 0) {
        onSuccess(updatedItemsList);
      }
      alert(`Operation failed: ${err}`);
    } finally {
      setIsProcessing(false);
      setCollisionInfo(null);
    }
  };

  // Compile option list for the dropdown
  const currentSubfolderOptions = subdirectories.map(sub => {
    const separator = parentDir.includes('\\') ? '\\' : '/';
    return {
      label: `${sub}`,
      value: `${parentDir}${separator}${sub}`
    };
  });

  const gridFolderOptions = activeGridFolders
    .filter(folder => folder !== parentDir)
    .map(folder => {
      const separator = folder.includes('\\') ? '\\' : '/';
      const name = folder.substring(folder.lastIndexOf(separator) + 1);
      return {
        label: `${name} (${folder})`,
        value: folder
      };
    });

  const recentFolderOptions = recentFolders
    .filter(folder => folder !== parentDir)
    .map(folder => {
      const separator = folder.includes('\\') ? '\\' : '/';
      const name = folder.substring(folder.lastIndexOf(separator) + 1);
      return {
        label: `${name} (${folder})`,
        value: folder
      };
    });

  const isCurrentPinned = pinnedFolders.includes(selectedFolder.trim());

  return (
    <div className="modal-overlay" style={{ zIndex: 300000 }}>
      <div className="modal-content premium-glass" style={{ width: '520px', pointerEvents: isProcessing ? 'none' : 'auto' }}>
        
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="accent-icon-box" style={{ background: 'rgba(0, 255, 136, 0.1)' }}>
              {mode === 'move' ? <Folder size={20} className="text-accent" /> : <Copy size={20} className="text-accent" />}
            </div>
            <div>
              <h2 style={{ fontSize: '16px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                {mode === 'move' ? 'Move Protocol' : 'Copy Protocol'}
              </h2>
              <span style={{ fontSize: '9px', opacity: 0.5, fontWeight: 800 }}>FILE SYSTEM SYNC</span>
            </div>
          </div>
          {!isProcessing && (
            <button onClick={onClose} className="premium-close-btn">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* Files Info Section */}
          <div className="settings-section" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '12px' }}>
            <span style={{ fontSize: '10px', fontWeight: 900, color: 'rgba(255, 255, 255, 0.4)' }}>
              TARGET ASSETS ({items.length})
            </span>
            <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '6px', fontSize: '12px', color: '#fff', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
                  <span style={{ color: 'var(--accent, #00ff88)' }}>▶</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Current Location Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 900 }}>CURRENT DIRECTORY</span>
            <span style={{ fontSize: '11px', color: '#888', wordBreak: 'break-all', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px' }}>
              {parentDir}
            </span>
          </div>

          {/* Target Folder Input / Custom Dropdown Combination */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }} ref={dropdownRef}>
            <span style={{ color: 'var(--accent)', fontSize: '10px', fontWeight: 900 }}>CHOOSE DESTINATION FOLDER</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              
              {/* Input field with Chevron Toggle */}
              <div style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(10, 10, 15, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
              }}>
                <input
                  type="text"
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  placeholder="Paste absolute path, type, or pick from dropdown"
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    padding: '10px 36px 10px 14px',
                    borderRadius: '10px',
                    outline: 'none',
                    fontSize: '13px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(prev => !prev)}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px',
                    borderRadius: '6px',
                  }}
                  title="Toggle folder list"
                >
                  <ChevronDown size={15} />
                </button>
              </div>

              {/* Pin/Unpin Current Target Path */}
              <button
                type="button"
                onClick={handleTogglePin}
                disabled={!selectedFolder.trim()}
                title={isCurrentPinned ? "Remove from permanently pinned folders" : "Pin this folder permanently to database"}
                style={{
                  background: isCurrentPinned ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid ' + (isCurrentPinned ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 255, 255, 0.1)'),
                  color: isCurrentPinned ? 'var(--accent, #00ff88)' : '#ccc',
                  borderRadius: '10px',
                  height: '38px',
                  width: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: selectedFolder.trim() ? 'pointer' : 'not-allowed',
                  opacity: selectedFolder.trim() ? 1 : 0.4,
                  transition: 'all 0.2s ease',
                }}
              >
                <Pin size={16} style={{ fill: isCurrentPinned ? 'currentColor' : 'none' }} />
              </button>

              {/* Browse Dialog */}
              <button 
                type="button"
                onClick={handleBrowseFolder} 
                className="action-btn-mini" 
                title="Browse folder on disk"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  borderRadius: '10px',
                  height: '38px',
                  padding: '0 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Search size={14} />
                <span>Browse...</span>
              </button>

            </div>

            {/* Premium Custom Dropdown list */}
            {isDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '6px',
                background: 'rgba(15, 15, 25, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
                zIndex: 999999,
                maxHeight: '260px',
                overflowY: 'auto',
                padding: '8px 0',
                backdropFilter: 'blur(12px)',
              }}>
                
                {/* 1. Permanent Pinned Folders */}
                <div style={{ padding: '6px 12px 2px 12px', fontSize: '9px', fontWeight: 900, color: 'var(--accent, #00ff88)', letterSpacing: '1px' }}>
                  DEFAULT PINNED FOLDERS (PERMANENT)
                </div>
                {pinnedFolders.length === 0 ? (
                  <div style={{ padding: '6px 16px', fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                    No pinned folders yet. Type a path & click the pin icon to bookmark it.
                  </div>
                ) : (
                  pinnedFolders.map(path => (
                    <div 
                      key={path} 
                      onClick={() => {
                        setSelectedFolder(path);
                        setIsDropdownOpen(false);
                      }}
                      style={{
                        padding: '6px 16px',
                        fontSize: '12px',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'background 0.2s',
                      }}
                      className="dropdown-item-hover"
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '12px' }} title={path}>
                        📌 {path}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleUnpinFolder(path, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ff4d6a',
                          cursor: 'pointer',
                          opacity: 0.6,
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'all 0.2s',
                        }}
                        title="Unpin folder"
                        className="unpin-btn-hover"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}

                <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '6px 0' }} />

                {/* 2. Subfolders of current location */}
                <div style={{ padding: '4px 12px 2px 12px', fontSize: '9px', fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px' }}>
                  SUBFOLDERS OF CURRENT LOCATION
                </div>
                {currentSubfolderOptions.length === 0 ? (
                  <div style={{ padding: '6px 16px', fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                    No subfolders found.
                  </div>
                ) : (
                  currentSubfolderOptions.map(opt => (
                    <div 
                      key={opt.value} 
                      onClick={() => {
                        setSelectedFolder(opt.value);
                        setIsDropdownOpen(false);
                      }}
                      style={{
                        padding: '6px 16px',
                        fontSize: '12px',
                        color: '#ddd',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      className="dropdown-item-hover"
                    >
                      📁 {opt.label}
                    </div>
                  ))
                )}

                <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '6px 0' }} />

                {/* 3. Recently used folders */}
                <div style={{ padding: '4px 12px 2px 12px', fontSize: '9px', fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px' }}>
                  RECENTLY USED FOLDERS
                </div>
                {recentFolderOptions.length === 0 ? (
                  <div style={{ padding: '6px 16px', fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                    No recent folders.
                  </div>
                ) : (
                  recentFolderOptions.map(opt => (
                    <div 
                      key={opt.value} 
                      onClick={() => {
                        setSelectedFolder(opt.value);
                        setIsDropdownOpen(false);
                      }}
                      style={{
                        padding: '6px 16px',
                        fontSize: '12px',
                        color: '#ddd',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      className="dropdown-item-hover"
                    >
                      🕒 {opt.label}
                    </div>
                  ))
                )}

                <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '6px 0' }} />

                {/* 4. Active ingested folders */}
                <div style={{ padding: '4px 12px 2px 12px', fontSize: '9px', fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px' }}>
                  ACTIVE INGESTED FOLDERS
                </div>
                {gridFolderOptions.length === 0 ? (
                  <div style={{ padding: '6px 16px', fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                    No active workspace folders.
                  </div>
                ) : (
                  gridFolderOptions.map(opt => (
                    <div 
                      key={opt.value} 
                      onClick={() => {
                        setSelectedFolder(opt.value);
                        setIsDropdownOpen(false);
                      }}
                      style={{
                        padding: '6px 16px',
                        fontSize: '12px',
                        color: '#ddd',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      className="dropdown-item-hover"
                    >
                      ⚡ {opt.label}
                    </div>
                  ))
                )}

              </div>
            )}
          </div>

          {/* Create Subfolder Panel */}
          {isCreatingFolder ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--accent)' }}>NEW SUBFOLDER NAME</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. Selects"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none',
                    fontSize: '13px'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                  }}
                />
                <button
                  onClick={handleCreateFolder}
                  style={{
                    background: 'var(--accent, #00ff88)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0 14px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => setIsCreatingFolder(false)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '0 10px',
                    cursor: 'pointer'
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreatingFolder(true)}
              style={{
                alignSelf: 'flex-start',
                background: 'none',
                border: 'none',
                color: 'var(--accent, #00ff88)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 0'
              }}
            >
              <FolderPlus size={14} />
              <span>Create New Subfolder Here</span>
            </button>
          )}

          {/* Selected Destination Preview */}
          {selectedFolder && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0, 255, 136, 0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0, 255, 136, 0.15)' }}>
              <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--accent)' }}>RESOLVED TARGET LOCATION</span>
              <span style={{ fontSize: '11px', color: '#fff', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {selectedFolder}
              </span>
            </div>
          )}

          {/* Loader and Progress */}
          {isProcessing && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '10px 0' }}>
              <Loader className="spin" style={{ color: 'var(--accent, #00ff88)' }} size={24} />
              <span style={{ fontSize: '12px', color: 'var(--accent, #00ff88)', fontWeight: 'bold' }}>
                {progressText}
              </span>
            </div>
          )}

        </div>

        <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          {!isProcessing && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                borderRadius: '10px',
                padding: '10px 20px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px'
              }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleExecute}
            disabled={!selectedFolder || isProcessing}
            style={{
              background: (!selectedFolder || isProcessing) ? 'rgba(255, 255, 255, 0.05)' : 'var(--accent, #00ff88)',
              color: (!selectedFolder || isProcessing) ? '#555' : '#000',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 24px',
              cursor: (!selectedFolder || isProcessing) ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: (!selectedFolder || isProcessing) ? 'none' : '0 0 15px rgba(0, 255, 136, 0.3)'
            }}
          >
            <span>Confirm {mode === 'move' ? 'Move' : 'Copy'}</span>
            <ArrowRight size={16} />
          </button>
        </div>

      </div>

      {collisionInfo && (
        <div className="modal-overlay" style={{ zIndex: 310000, background: 'rgba(0,0,0,0.85)', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content premium-glass" style={{ width: '400px', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: '#121214', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', color: 'var(--accent, #00ff88)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              File Collision
            </h3>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.4', marginBottom: '14px' }}>
              A file named <strong style={{ color: '#fff' }}>{collisionInfo.filename}</strong> already exists in the destination folder. What would you like to do?
            </p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <input 
                type="checkbox" 
                id="apply-to-all" 
                ref={applyToAllRef}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="apply-to-all" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', userSelect: 'none' }}>
                Apply to all remaining conflicts
              </label>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button 
                onClick={() => {
                  const applyAll = applyToAllRef.current?.checked || false;
                  collisionInfo.resolve('keep-both', applyAll);
                }}
                style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: '11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Keep Both (Rename new file)
              </button>
              <button 
                onClick={() => {
                  const applyAll = applyToAllRef.current?.checked || false;
                  collisionInfo.resolve('overwrite', applyAll);
                }}
                style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: '11px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Overwrite (Replace existing file)
              </button>
              <button 
                onClick={() => {
                  const applyAll = applyToAllRef.current?.checked || false;
                  collisionInfo.resolve('skip', applyAll);
                }}
                style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: '11px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Skip File
              </button>
              <button 
                onClick={() => {
                  collisionInfo.resolve('cancel', false);
                }}
                style={{ width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '11px', cursor: 'pointer', padding: '8px 0', marginTop: '4px', textDecoration: 'underline' }}
              >
                Cancel Operation
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
