import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { showConfirm } from '../utils/videoUtils';
import { 
  Folder, 
  File, 
  X, 
  ChevronUp, 
  ChevronDown,
  Plus, 
  FolderOpen, 
  CornerUpLeft, 
  Loader2,
  Download,
  LayoutGrid,
  List,
  Play,
  RotateCw,
  Zap
} from 'lucide-react';
import { toCosmoUrl, isValidMediaExtension } from '../utils/videoUtils';
import { useStore } from '../store/useStore';

interface InAppBrowserProps {
  onAddFile: (path: string) => void;
  onAddMultipleFiles: (paths: string[]) => void;
  addLog: (msg: string) => void;
}

interface BrowserItem {
  name: string;
  path: string;
  is_dir: boolean;
  is_media: boolean;
}

function VideoPreview({ src, isHovered }: { src: string; isHovered: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHovered) {
      video.play().catch(() => {});
    } else {
      video.pause();
      // Seek back to first frame (0.01 seconds) when not hovered
      video.currentTime = 0.01;
    }
  }, [isHovered]);

  return (
    <video 
      ref={videoRef}
      src={src + "#t=0.01"} 
      className="file-thumb"
      muted
      playsInline
      loop
      preload="metadata"
      style={{ objectFit: 'contain', width: '100%', height: '100%', display: 'block' }}
    />
  );
}

// Subcomponent to optimize rendering and prevent loading off-screen videos or flooding WebViews
function BrowserItemCard({ 
  item, 
  layoutMode, 
  onAddFile, 
  onDragStart, 
  onDoubleClick 
}: { 
  item: BrowserItem; 
  layoutMode: 'grid' | 'list';
  onAddFile: (path: string) => void;
  onDragStart: (e: React.DragEvent, path: string) => void;
  onDoubleClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  if (item.is_dir) {
    return (
      <div 
        className={`browser-item-card is-dir layout-${layoutMode}`}
        onDoubleClick={onDoubleClick}
      >
        <div className="dir-item-content">
          <Folder size={14} className="dir-icon" />
          <span className="dir-name" title={item.name}>{item.name}</span>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`browser-item-card is-file layout-${layoutMode}`}
      draggable
      onDragStart={(e) => onDragStart(e, item.path)}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {layoutMode === 'list' ? (
        <div className="file-item-content-list">
          <File size={13} className="file-icon" />
          <span className="file-name" title={item.name}>{item.name}</span>
          <button 
            className="add-item-badge-btn-list" 
            onClick={(e) => {
              e.stopPropagation();
              onAddFile(item.path);
            }}
            title="Add to grid workspace"
          >
            <Plus size={10} />
          </button>
        </div>
      ) : (
        <div className="file-item-content">
          <div className="file-thumbnail-container">
            {isValidMediaExtension(item.path, 'video') ? (
              <VideoPreview src={toCosmoUrl(item.path)} isHovered={isHovered} />
            ) : (
              <img 
                src={toCosmoUrl(item.path)} 
                className="file-thumb" 
                alt={item.name}
                loading="lazy"
              />
            )}
            
            <div className="thumb-hover-overlay">
              <button 
                className="add-item-badge-btn" 
                onClick={(e) => {
                  e.stopPropagation();
                  onAddFile(item.path);
                }}
                title="Add to grid workspace"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
          <span className="file-name" title={item.name}>{item.name}</span>
        </div>
      )}
    </div>
  );
}

export function InAppBrowser({ onAddFile, onAddMultipleFiles, addLog }: InAppBrowserProps) {
  const {
    showInAppBrowser,
    setShowInAppBrowser,
    inAppBrowserPath,
    setInAppBrowserPath
  } = useStore() as any;

  const [items, setItems] = useState<BrowserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [autoAddIncoming, setAutoAddIncoming] = useState(false);
  const [limit, setLimit] = useState(100);
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const loadedPathsRef = React.useRef<Set<string>>(new Set());
  const pendingPathsRef = React.useRef<Set<string>>(new Set());
  const activeTimeoutsRef = React.useRef<NodeJS.Timeout[]>([]);

  // Reset the path memory and limit when directory path changes
  useEffect(() => {
    loadedPathsRef.current = new Set();
    activeTimeoutsRef.current.forEach(clearTimeout);
    activeTimeoutsRef.current = [];
    pendingPathsRef.current.clear();
    setLimit(100);
  }, [inAppBrowserPath]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      activeTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const sortedItems = useMemo(() => {
    // Keep directories first, then sort files
    const dirs = items.filter(x => x.is_dir);
    const files = items.filter(x => !x.is_dir);

    // Sort directories by name always
    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    // Sort files
    files.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortBy === 'date') {
        comparison = (a.modified || 0) - (b.modified || 0);
      } else if (sortBy === 'size') {
        comparison = (a.size || 0) - (b.size || 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return [...dirs, ...files];
  }, [items, sortBy, sortOrder]);

  const visibleItems = useMemo(() => {
    return sortedItems.slice(0, limit);
  }, [sortedItems, limit]);

  const loadContents = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<BrowserItem[]>('list_directory_contents', { dirPath: path });
      const filtered = result.filter(item => item.is_dir || item.is_media);
      
      // Auto add new incoming media files if enabled and directory was already scanned once
      if (autoAddIncoming && loadedPathsRef.current.size > 0) {
        const newMediaFiles = filtered.filter(item => !item.is_dir && item.is_media && !loadedPathsRef.current.has(item.path));
        if (newMediaFiles.length > 0) {
          const newPaths = newMediaFiles.map(x => x.path);
          const pathsToQueue = newPaths.filter(p => !pendingPathsRef.current.has(p));
          
          pathsToQueue.forEach(p => {
            pendingPathsRef.current.add(p);
            const filename = p.split(/[\\/]/).pop();
            addLog(`Auto-detected new file: [${filename}]. Queueing import in 10 seconds...`);
            
            const timeoutId = setTimeout(() => {
              if (pendingPathsRef.current.has(p)) {
                addLog(`Importing auto-detected file: [${filename}]`);
                onAddMultipleFiles([p]);
                pendingPathsRef.current.delete(p);
              }
              activeTimeoutsRef.current = activeTimeoutsRef.current.filter(t => t !== timeoutId);
            }, 10000);
            activeTimeoutsRef.current.push(timeoutId);
          });
        }
      }
      
      loadedPathsRef.current = new Set(filtered.map(x => x.path));
      setItems(filtered);
    } catch (err: any) {
      console.error("Failed to load directory contents:", err);
      setError(err.toString());
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [autoAddIncoming, onAddMultipleFiles, addLog]);

  useEffect(() => {
    if (showInAppBrowser && inAppBrowserPath) {
      loadContents(inAppBrowserPath);
    }
  }, [showInAppBrowser, inAppBrowserPath, loadContents]);

  // Tell Rust to watch the directory when the viewed path changes
  useEffect(() => {
    if (showInAppBrowser && inAppBrowserPath) {
      invoke('watch_directory', { dirPath: inAppBrowserPath }).catch(err => {
        console.error("Failed to watch directory:", err);
      });
    } else {
      invoke('watch_directory', { dirPath: '' }).catch(() => {});
    }
  }, [showInAppBrowser, inAppBrowserPath]);

  // Listen to directory mutation events from Rust
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isActive = true;

    const setupListener = async () => {
      const unlistenFn = await listen<string>('directory-changed', (event) => {
        if (isActive && event.payload === inAppBrowserPath) {
          loadContents(inAppBrowserPath);
        }
      });
      if (isActive) {
        unsubscribe = unlistenFn;
      } else {
        unlistenFn();
      }
    };

    if (showInAppBrowser && inAppBrowserPath) {
      setupListener();
    }

    return () => {
      isActive = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [showInAppBrowser, inAppBrowserPath, loadContents]);

  const handleRefresh = () => {
    loadContents(inAppBrowserPath);
  };

  const handleGoUp = () => {
    if (!inAppBrowserPath) return;
    const cleanPath = inAppBrowserPath.replace(/[\\/]+$/, '');
    const lastSlash = Math.max(cleanPath.lastIndexOf('/'), cleanPath.lastIndexOf('\\'));
    if (lastSlash > 0) {
      let parent = cleanPath.substring(0, lastSlash);
      if (parent.endsWith(':')) {
        parent += '\\';
      }
      setInAppBrowserPath(parent);
    } else if (lastSlash === 0) {
      setInAppBrowserPath(cleanPath.substring(0, 1) + cleanPath.substring(1, 2) + '\\');
    }
  };

  const handleDragStart = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.setData('application/cosmo-file', path);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleAddAll = async () => {
    const mediaPaths = items
      .filter(item => !item.is_dir && item.is_media)
      .map(item => item.path);
    
    console.log("[InAppBrowser] handleAddAll paths:", mediaPaths);
    addLog(`System: In-app browser "Add All" requested for ${mediaPaths.length} file(s).`);

    if (mediaPaths.length === 0) {
      alert("No compatible media files in this folder to add.");
      return;
    }
    
    onAddMultipleFiles(mediaPaths);
    setIsCollapsed(true);
  };

  const formatPathLabel = (path: string) => {
    if (path.length > 35) {
      return '...' + path.substring(path.length - 32);
    }
    return path;
  };

  if (!showInAppBrowser) return null;

  if (isCollapsed) {
    return (
      <div className="in-app-browser-panel collapsed" style={{ height: '42px', bottom: 'auto', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', height: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <FolderOpen size={13} style={{ color: autoAddIncoming ? 'var(--accent, #00ff88)' : '#fff', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {formatPathLabel(inAppBrowserPath || '')} {autoAddIncoming && <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 800, marginLeft: '4px' }}>[AUTO-SYNC]</span>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button 
              className="layout-toggle-btn"
              onClick={() => setIsCollapsed(false)}
              title="Expand Browser"
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
            >
              <ChevronDown size={14} />
            </button>
            <button 
              className="browser-close-btn" 
              onClick={() => {
                setShowInAppBrowser(false);
                setIsCollapsed(false);
              }}
              title="Close Browser"
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="in-app-browser-panel">
      {/* Header */}
      <div className="browser-header">
        <div className="browser-title-row">
          <div className="browser-title-box">
            <FolderOpen size={14} className="browser-title-icon" />
            <span className="browser-title-lbl">In-App Browser</span>
          </div>
          <div className="browser-header-actions">
            <button 
              className="layout-toggle-btn"
              onClick={handleRefresh}
              title="Refresh Folder"
              disabled={loading}
              style={{ marginRight: '2px' }}
            >
              <RotateCw size={13} className={loading ? 'spin' : ''} />
            </button>
            <button 
              className={`layout-toggle-btn ${autoAddIncoming ? 'active' : ''}`}
              onClick={() => setAutoAddIncoming(!autoAddIncoming)}
              title={autoAddIncoming ? "Auto-Add New Files: ON" : "Auto-Add New Files: OFF"}
              style={{
                color: autoAddIncoming ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.45)',
                background: autoAddIncoming ? 'rgba(0, 255, 136, 0.12)' : 'transparent',
                marginRight: '2px'
              }}
            >
              <Zap size={13} fill={autoAddIncoming ? "currentColor" : "none"} />
            </button>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
              className="browser-sort-select"
              title="Sort By"
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="size">Size</option>
            </select>
            <button
              className="layout-toggle-btn"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? "Sort Ascending" : "Sort Descending"}
              style={{ padding: '2px 4px', fontSize: '11px', fontWeight: 'bold' }}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
            <button 
              className={`layout-toggle-btn ${layoutMode === 'list' ? 'active' : ''}`}
              onClick={() => setLayoutMode(layoutMode === 'grid' ? 'list' : 'grid')}
              title={layoutMode === 'grid' ? "Switch to List View" : "Switch to Grid View"}
            >
              {layoutMode === 'grid' ? <List size={13} /> : <LayoutGrid size={13} />}
            </button>
            <button 
              className="layout-toggle-btn"
              onClick={() => setIsCollapsed(true)}
              title="Fold Up (Minimize)"
              style={{ marginRight: '2px' }}
            >
              <ChevronUp size={13} />
            </button>
            <button 
              className="browser-close-btn" 
              onClick={() => setShowInAppBrowser(false)}
              title="Close Browser"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        
        {/* Navigation Breadcrumb Area */}
        <div className="browser-nav-row">
          <button 
            className="browser-nav-btn up-btn"
            onClick={handleGoUp}
            disabled={!inAppBrowserPath || inAppBrowserPath === 'C:\\' || inAppBrowserPath === 'C:/'}
            title="Go to Parent Folder"
          >
            <CornerUpLeft size={12} />
          </button>
          <div className="browser-path-display" title={inAppBrowserPath}>
            {formatPathLabel(inAppBrowserPath || '')}
          </div>
          <button 
            className="browser-nav-btn add-all-btn"
            onClick={handleAddAll}
            title="Add All Media in Folder"
          >
            <Download size={12} />
            <span>Add All</span>
          </button>
        </div>
      </div>

      {/* Main List Body */}
      <div className="browser-body">
        {loading ? (
          <div className="browser-loader-box">
            <Loader2 size={24} className="browser-spinner spin" />
            <p>Scanning directory...</p>
          </div>
        ) : error ? (
          <div className="browser-error-box">
            <p className="error-title">Access Error</p>
            <p className="error-msg">{error}</p>
            <button className="retry-btn" onClick={() => loadContents(inAppBrowserPath)}>
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="browser-empty-box">
            <p>This directory is empty or contains no supported media files.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            <div className={`browser-items-list mode-${layoutMode}`}>
              {visibleItems.map((item, index) => (
                <BrowserItemCard
                  key={item.path + '-' + index}
                  item={item}
                  layoutMode={layoutMode}
                  onAddFile={onAddFile}
                  onDragStart={handleDragStart}
                  onDoubleClick={() => {
                    if (item.is_dir) {
                      setInAppBrowserPath(item.path);
                    } else {
                      onAddFile(item.path);
                    }
                  }}
                />
              ))}
            </div>
            {sortedItems.length > limit && (
              <button 
                className="browser-load-more-btn"
                onClick={() => setLimit(prev => prev + 100)}
                style={{
                  alignSelf: 'center',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: 'rgba(255, 255, 255, 0.8)',
                  padding: '8px 16px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  marginTop: '10px',
                  marginBottom: '20px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                Load More ({sortedItems.length - limit} remaining)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

