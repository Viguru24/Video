import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
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
  Zap, 
  Pin,
  Image as ImageIcon
} from 'lucide-react';
import { toCosmoUrl, isValidMediaExtension, isTauri } from '../utils/videoUtils';
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

function VideoPreview({ path, src, isHovered }: { path: string; src?: string; isHovered: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState(() => {
    if (isTauri()) {
      try {
        return convertFileSrc(path);
      } catch {}
    }
    return src || toCosmoUrl(path);
  });
  const [triedFallback, setTriedFallback] = useState(false);

  useEffect(() => {
    if (isTauri()) {
      try {
        setVideoSrc(convertFileSrc(path));
      } catch {
        setVideoSrc(toCosmoUrl(path));
      }
    } else {
      setVideoSrc(src || toCosmoUrl(path));
    }
    setTriedFallback(false);
  }, [path, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHovered) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isHovered]);

  const handleLoadedData = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    try {
      if (video.currentTime < 0.5) {
        // Seek to 1 second into the video to avoid black intro frames
        const targetTime = Math.min(1.0, (video.duration || 2) / 2);
        video.currentTime = targetTime;
      }
    } catch {}
  };

  const handleError = () => {
    if (!triedFallback) {
      setTriedFallback(true);
      if (videoSrc.includes('asset.localhost')) {
        setVideoSrc(toCosmoUrl(path));
      } else if (isTauri()) {
        try {
          setVideoSrc(convertFileSrc(path));
        } catch {}
      }
    }
  };

  const finalSrc = videoSrc.includes('#') ? videoSrc : `${videoSrc}#t=1.0`;

  return (
    <video 
      ref={videoRef}
      src={finalSrc} 
      className="file-thumb"
      muted
      playsInline
      loop
      preload="metadata"
      onLoadedData={handleLoadedData}
      onError={handleError}
      style={{ objectFit: 'cover', width: '100%', height: '100%', display: 'block' }}
    />
  );
}

function ImageThumbnail({ path, name }: { path: string; name: string }) {
  const [imgSrc, setImgSrc] = useState(() => toCosmoUrl(path));
  const [hasError, setHasError] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const ext = path.split('.').pop()?.toUpperCase() || 'IMG';

  // Reset when path changes
  useEffect(() => {
    setImgSrc(toCosmoUrl(path));
    setHasError(false);
    setTriedFallback(false);
    setIsLoaded(false);
  }, [path]);

  const handleError = () => {
    if (!triedFallback && isTauri()) {
      setTriedFallback(true);
      try {
        setImgSrc(convertFileSrc(path));
        return;
      } catch {}
    }
    setHasError(true);
  };

  if (hasError) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        background: 'radial-gradient(circle at center, rgba(30, 30, 48, 0.95), rgba(12, 12, 18, 0.98))',
        color: 'rgba(255, 255, 255, 0.8)'
      }}>
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'rgba(0, 255, 136, 0.12)',
          border: '1px solid rgba(0, 255, 136, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent, #00ff88)'
        }}>
          <ImageIcon size={13} />
        </div>
        <span style={{
          fontSize: '8px',
          fontWeight: 800,
          letterSpacing: '0.6px',
          color: 'var(--accent, #00ff88)',
          background: 'rgba(0, 255, 136, 0.08)',
          padding: '1px 5px',
          borderRadius: '3px',
          textTransform: 'uppercase'
        }}>
          {ext}
        </span>
      </div>
    );
  }

  return (
    <img 
      src={imgSrc} 
      className="file-thumb" 
      alt={name}
      onLoad={() => setIsLoaded(true)}
      onError={handleError}
      style={{
        objectFit: 'cover',
        width: '100%',
        height: '100%',
        display: 'block',
        opacity: isLoaded ? 1 : 0.8,
        transition: 'opacity 0.2s ease'
      }}
    />
  );
}

// Subcomponent to optimize rendering and prevent loading off-screen videos or flooding WebViews
function BrowserItemCard({ 
  item, 
  index,
  layoutMode, 
  onAddFile, 
  onDragStart, 
  onDoubleClick 
}: { 
  item: BrowserItem; 
  index: number;
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
              <VideoPreview path={item.path} src={toCosmoUrl(item.path)} isHovered={isHovered} />
            ) : (
              <ImageThumbnail path={item.path} name={item.name} />
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
    setInAppBrowserPath,
    inAppBrowserCollapsed,
    setInAppBrowserCollapsed,
    autoSyncFolders,
    toggleAutoSyncFolder
  } = useStore() as any;

  const [items, setItems] = useState<BrowserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [autoAddIncoming, setAutoAddIncoming] = useState(() =>
    localStorage.getItem('cosmo-auto-add-incoming') !== 'false'
  );
  const [limit, setLimit] = useState(300);
  
  const loadedPathsRef = React.useRef<Set<string>>(new Set());
  const pendingPathsRef = React.useRef<Set<string>>(new Set());
  const activeTimeoutsRef = React.useRef<NodeJS.Timeout[]>([]);
  const [isPinned, setIsPinned] = useState(() => {
    return localStorage.getItem('cosmo-inapp-browser-pinned') === 'true';
  });
  const hoverLeaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const togglePinned = () => {
    setIsPinned(prev => {
      const next = !prev;
      localStorage.setItem('cosmo-inapp-browser-pinned', next ? 'true' : 'false');
      return next;
    });
  };

  // Reset the path memory, limit, and uncollapse when directory path changes
  useEffect(() => {
    loadedPathsRef.current = new Set();
    activeTimeoutsRef.current.forEach(clearTimeout);
    activeTimeoutsRef.current = [];
    pendingPathsRef.current.clear();
    setLimit(300);
    setInAppBrowserCollapsed(false);
  }, [inAppBrowserPath, setInAppBrowserCollapsed]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      activeTimeoutsRef.current.forEach(clearTimeout);
      if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    };
  }, []);

  // Hover over the top bar auto-maximizes the in-app browser instantly
  const handleBarMouseEnter = () => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    if (inAppBrowserCollapsed) {
      setInAppBrowserCollapsed(false);
    }
  };

  // Mouse over panel cancels any pending collapse timer
  const handlePanelMouseEnter = () => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  };

  // Moving mouse away from panel auto-minimizes instantly (70ms) unless pinned
  const handlePanelMouseLeave = () => {
    if (!isPinned) {
      if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = setTimeout(() => {
        setInAppBrowserCollapsed(true);
      }, 70);
    }
  };

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
      loadedPathsRef.current = new Set(filtered.map(x => x.path));
      setItems(filtered);
    } catch (err: any) {
      console.error("Failed to load directory contents:", err);
      setError(err.toString());
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
    setInAppBrowserCollapsed(true);
  };

  const formatPathLabel = (path: string) => {
    if (path.length > 35) {
      return '...' + path.substring(path.length - 32);
    }
    return path;
  };

  const isCurrentFolderAutoSync = autoSyncFolders?.some(
    (p: string) => p.replace(/[\\/]+$/, '') === (inAppBrowserPath || '').replace(/[\\/]+$/, '')
  );

  if (!showInAppBrowser) return null;

  if (inAppBrowserCollapsed) {
    return (
      <div 
        className="in-app-browser-panel collapsed" 
        onMouseEnter={handleBarMouseEnter}
        title="Hover or click to expand In-App Browser"
        style={{ 
          height: '42px', 
          bottom: 'auto', 
          padding: 0,
          cursor: 'pointer',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', height: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <FolderOpen size={13} style={{ color: isCurrentFolderAutoSync ? 'var(--accent, #00ff88)' : '#fff', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {formatPathLabel(inAppBrowserPath || '')} {isCurrentFolderAutoSync && <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 800, marginLeft: '4px' }}>[AUTO-SYNC]</span>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button 
              className="layout-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                setInAppBrowserCollapsed(false);
              }}
              title="Expand In-App Browser"
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
            >
              <ChevronDown size={14} />
            </button>
            <button 
              className="browser-close-btn" 
              onClick={(e) => {
                e.stopPropagation();
                setShowInAppBrowser(false);
                setInAppBrowserCollapsed(false);
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
    <div 
      className="in-app-browser-panel"
      onMouseEnter={handlePanelMouseEnter}
      onMouseLeave={handlePanelMouseLeave}
    >
      {/* Header */}
      <div className="browser-header">
        {/* Top Window Title & Window Controls */}
        <div className="browser-title-row">
          <div className="browser-title-box">
            <FolderOpen size={14} className="browser-title-icon" />
            <span className="browser-title-lbl">In-App Browser</span>
          </div>
          <div className="browser-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button 
              className="layout-toggle-btn"
              onClick={handleRefresh}
              title="Refresh Folder"
              disabled={loading}
            >
              <RotateCw size={13} className={loading ? 'spin' : ''} />
            </button>
            <button 
              className={`layout-toggle-btn ${isPinned ? 'active' : ''}`}
              onClick={togglePinned}
              title={isPinned ? "Pinned: Stays open (Click to enable auto-minimize on mouse leave)" : "Auto-Hide Mode: Minimizes on mouse away (Click to Pin Open)"}
              style={{
                color: isPinned ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.5)'
              }}
            >
              <Pin size={13} fill={isPinned ? "currentColor" : "none"} />
            </button>
            <button 
              className="layout-toggle-btn"
              onClick={() => {
                setInAppBrowserCollapsed(true);
              }}
              title="Minimize Browser"
            >
              <ChevronUp size={13} />
            </button>
            <button 
              className="browser-close-btn" 
              onClick={() => {
                setShowInAppBrowser(false);
              }}
              title="Close In-App Browser"
            >
              <X size={13} />
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

        {/* Secondary Toolbar / Sort & Filter */}
        <div className="browser-toolbar-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', paddingTop: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
              style={{ padding: '2px 5px', fontSize: '11px', fontWeight: 'bold' }}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button 
              className={`layout-toggle-btn ${isCurrentFolderAutoSync ? 'active' : ''}`}
              onClick={() => {
                if (inAppBrowserPath) {
                  toggleAutoSyncFolder(inAppBrowserPath);
                  addLog(`Auto-Sync ${isCurrentFolderAutoSync ? 'disabled' : 'enabled'} for "${inAppBrowserPath}"`);
                }
              }}
              title={isCurrentFolderAutoSync ? "Auto-Add New Files for this folder: ON (Click to Disable)" : "Auto-Add New Files for this folder: OFF (Click to Enable)"}
              style={{
                color: isCurrentFolderAutoSync ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.45)',
                background: isCurrentFolderAutoSync ? 'rgba(0, 255, 136, 0.15)' : 'transparent',
                border: isCurrentFolderAutoSync ? '1px solid rgba(0, 255, 136, 0.4)' : '1px solid transparent',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <Zap size={12} fill={isCurrentFolderAutoSync ? "currentColor" : "none"} />
              <span>SYNC</span>
            </button>
            <button 
              className={`layout-toggle-btn ${layoutMode === 'list' ? 'active' : ''}`}
              onClick={() => setLayoutMode(layoutMode === 'grid' ? 'list' : 'grid')}
              title={layoutMode === 'grid' ? "Switch to List View" : "Switch to Grid View"}
            >
              {layoutMode === 'grid' ? <List size={13} /> : <LayoutGrid size={13} />}
            </button>
          </div>
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
                  index={index}
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

