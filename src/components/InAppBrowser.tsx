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
  Image as ImageIcon,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { toCosmoUrl, isValidMediaExtension, isTauri } from '../utils/videoUtils';
import { normalizeTimestamp } from '../utils/sortUtils';
import { useStore } from '../store/useStore';

interface InAppBrowserProps {
  onAddFile: (path: string) => void;
  onAddMultipleFiles: (paths: string[]) => void;
  addLog: (msg: string) => void;
}

import { BrowserItemCard, type BrowserItem } from './browser/BrowserItemCard';

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

  type ResizeDirection = 'left' | 'bottom' | 'bottom-left' | 'top' | 'top-left';

  const [browserWidth, setBrowserWidth] = useState<number>(() => {
    const saved = localStorage.getItem('cosmo-inapp-browser-width');
    return saved ? Math.max(280, parseInt(saved, 10)) : 380;
  });

  const [browserHeight, setBrowserHeight] = useState<number>(() => {
    const saved = localStorage.getItem('cosmo-inapp-browser-height');
    return saved ? Math.max(220, parseInt(saved, 10)) : 620;
  });

  const [browserTop, setBrowserTop] = useState<number>(() => {
    const saved = localStorage.getItem('cosmo-inapp-browser-top');
    return saved ? Math.max(40, parseInt(saved, 10)) : 110;
  });

  const [isMaximized, setIsMaximized] = useState(() => {
    return localStorage.getItem('cosmo-inapp-browser-maximized') === 'true';
  });

  const isResizingRef = useRef<ResizeDirection | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const toggleMaximize = () => {
    setIsMaximized(prev => {
      const next = !prev;
      localStorage.setItem('cosmo-inapp-browser-maximized', next ? 'true' : 'false');
      return next;
    });
  };

  const startResize = (e: React.PointerEvent, direction: ResizeDirection) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = direction;
    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = browserWidth;
    const startH = browserHeight;
    const startT = browserTop;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isResizingRef.current) return;
      
      const deltaX = startX - moveEvent.clientX;
      const deltaY = moveEvent.clientY - startY;
      const deltaYTop = moveEvent.clientY - startY;

      if (direction === 'left' || direction === 'bottom-left' || direction === 'top-left') {
        const minW = 280;
        const maxW = Math.max(minW, window.innerWidth - 32);
        const newW = Math.min(maxW, Math.max(minW, startW + deltaX));
        setBrowserWidth(newW);
        localStorage.setItem('cosmo-inapp-browser-width', String(Math.round(newW)));
      }

      if (direction === 'bottom' || direction === 'bottom-left') {
        const minH = 200;
        const maxH = Math.max(minH, window.innerHeight - startT - 20);
        const newH = Math.min(maxH, Math.max(minH, startH + deltaY));
        setBrowserHeight(newH);
        localStorage.setItem('cosmo-inapp-browser-height', String(Math.round(newH)));
      }

      if (direction === 'top' || direction === 'top-left') {
        const minT = 40;
        const maxT = Math.min(window.innerHeight - 250, 200);
        const newT = Math.min(maxT, Math.max(minT, startT + deltaYTop));
        const newH = Math.max(200, startH - (newT - startT));
        setBrowserTop(newT);
        setBrowserHeight(newH);
        localStorage.setItem('cosmo-inapp-browser-top', String(Math.round(newT)));
        localStorage.setItem('cosmo-inapp-browser-height', String(Math.round(newH)));
      }
    };

    const onPointerUp = () => {
      isResizingRef.current = null;
      setIsResizing(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

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
    if (!isPinned && !isResizingRef.current) {
      if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = setTimeout(() => {
        if (!isResizingRef.current) {
          setInAppBrowserCollapsed(true);
        }
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
    files.sort((a: any, b: any) => {
      const nameCompare = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = nameCompare;
      } else if (sortBy === 'date') {
        const timeA = normalizeTimestamp(a.modified) || normalizeTimestamp(a.created);
        const timeB = normalizeTimestamp(b.modified) || normalizeTimestamp(b.created);
        comparison = timeA - timeB;
      } else if (sortBy === 'size') {
        comparison = (a.size || 0) - (b.size || 0);
      }
      if (comparison === 0) {
        return sortOrder === 'asc' ? nameCompare : -nameCompare;
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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const setupListener = async () => {
      const unlistenFn = await listen<string>('directory-changed', (event) => {
        if (isActive && event.payload === inAppBrowserPath) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (isActive) {
              loadContents(inAppBrowserPath);
            }
          }, 350);
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
      if (debounceTimer) clearTimeout(debounceTimer);
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
          top: `${browserTop}px`,
          right: '16px',
          width: isMaximized ? 'calc(100% - 32px)' : `${browserWidth}px`,
          maxWidth: 'calc(100% - 32px)',
          padding: 0,
          cursor: 'pointer',
          transition: isResizing ? 'none' : 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {!isMaximized && (
          <div 
            className={`browser-resize-handle-left ${isResizing ? 'resizing' : ''}`}
            onPointerDown={(e) => startResize(e, 'left')}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setBrowserWidth(380);
              localStorage.setItem('cosmo-inapp-browser-width', '380');
            }}
            title="Drag to adjust width (Double-click to reset)"
          />
        )}
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
      style={{
        width: isMaximized ? 'calc(100% - 32px)' : `${browserWidth}px`,
        height: isMaximized ? 'calc(100% - 130px)' : `${browserHeight}px`,
        top: isMaximized ? '110px' : `${browserTop}px`,
        bottom: 'auto',
        right: '16px',
        maxWidth: 'calc(100% - 32px)',
        maxHeight: 'calc(100% - 125px)',
        userSelect: isResizing ? 'none' : undefined,
        transition: isResizing ? 'none' : 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1), height 0.2s cubic-bezier(0.16, 1, 0.3, 1), top 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      {/* Interactive Resize Handles */}
      {!isMaximized && (
        <>
          <div 
            className={`browser-resize-handle-left ${isResizing ? 'resizing' : ''}`}
            onPointerDown={(e) => startResize(e, 'left')}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setBrowserWidth(380);
              localStorage.setItem('cosmo-inapp-browser-width', '380');
            }}
            title="Drag to adjust width (Double-click to reset to 380px)"
          />

          <div 
            className={`browser-resize-handle-bottom ${isResizing ? 'resizing' : ''}`}
            onPointerDown={(e) => startResize(e, 'bottom')}
            onDoubleClick={(e) => {
              e.stopPropagation();
              const defH = Math.max(300, window.innerHeight - browserTop - 25);
              setBrowserHeight(defH);
              localStorage.setItem('cosmo-inapp-browser-height', String(Math.round(defH)));
            }}
            title="Drag to adjust height (Double-click to expand to bottom)"
          />

          <div 
            className={`browser-resize-handle-corner-bl ${isResizing ? 'resizing' : ''}`}
            onPointerDown={(e) => startResize(e, 'bottom-left')}
            title="Drag to adjust width and height simultaneously"
          />

          <div 
            className={`browser-resize-handle-top ${isResizing ? 'resizing' : ''}`}
            onPointerDown={(e) => startResize(e, 'top')}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setBrowserTop(110);
              localStorage.setItem('cosmo-inapp-browser-top', '110');
            }}
            title="Drag to adjust top position (Double-click to reset to 110px)"
          />

          <div 
            className={`browser-resize-handle-corner-tl ${isResizing ? 'resizing' : ''}`}
            onPointerDown={(e) => startResize(e, 'top-left')}
            title="Drag to adjust top and width simultaneously"
          />
        </>
      )}

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
              className={`layout-toggle-btn ${isMaximized ? 'active' : ''}`}
              onClick={toggleMaximize}
              title={isMaximized ? "Restore Window Size" : "Maximize Browser Window"}
              style={{
                color: isMaximized ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.7)'
              }}
            >
              {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
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
              title={
                sortBy === 'date'
                  ? sortOrder === 'desc'
                    ? "Date: Newest First (Click for Oldest First)"
                    : "Date: Oldest First (Click for Newest First)"
                  : sortBy === 'name'
                    ? sortOrder === 'asc'
                      ? "Name: A → Z (Click for Z → A)"
                      : "Name: Z → A (Click for A → Z)"
                    : sortOrder === 'asc'
                      ? "Size: Small → Large"
                      : "Size: Large → Small"
              }
              style={{ padding: '2px 6px', fontSize: '11px', fontWeight: 'bold' }}
            >
              {sortBy === 'date' 
                ? (sortOrder === 'desc' ? '↓ Newest' : '↑ Oldest')
                : (sortOrder === 'asc' ? '↑' : '↓')}
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

