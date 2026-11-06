import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderOpen, 
  X, 
  ChevronDown, 
  Loader2 
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { BrowserItemCard } from './browser/BrowserItemCard';
import { useBrowserDirectory } from './browser/useBrowserDirectory';
import { BrowserToolbar } from './browser/BrowserToolbar';
import { BrowserBatchBar } from './browser/BrowserBatchBar';
import { isValidMediaExtension } from '../utils/videoUtils';

interface InAppBrowserProps {
  onAddFile: (path: string) => void;
  onAddMultipleFiles: (paths: string[]) => void;
  addLog: (msg: string) => void;
}

type ResizeDirection = 'left' | 'bottom' | 'bottom-left' | 'top' | 'top-left';

export function InAppBrowser({ onAddFile, onAddMultipleFiles, addLog }: InAppBrowserProps) {
  const {
    showInAppBrowser,
    setShowInAppBrowser,
    inAppBrowserPath,
    setInAppBrowserPath,
    inAppBrowserCollapsed,
    setInAppBrowserCollapsed,
    autoSyncFolders,
    toggleAutoSyncFolder,
    inAppBrowserMediaFilter,
    setInAppBrowserMediaFilter
  } = useStore() as any;

  const mediaFilter: 'all' | 'video' | 'picture' = inAppBrowserMediaFilter || 'all';

  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [autoAddIncoming, setAutoAddIncoming] = useState(() =>
    localStorage.getItem('cosmo-auto-add-incoming') !== 'false'
  );
  const [limit, setLimit] = useState(300);

  // Selection & Search state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const [isPinned, setIsPinned] = useState(() => {
    return localStorage.getItem('cosmo-inapp-browser-pinned') === 'true';
  });
  const hoverLeaveTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const {
    items,
    loading,
    error,
    mediaCounts,
    sortedItems,
    visibleItems,
    loadContents
  } = useBrowserDirectory({
    inAppBrowserPath,
    showInAppBrowser,
    mediaFilter,
    searchQuery,
    sortBy,
    sortOrder,
    limit
  });

  // Reset selection, search, limit on path change
  useEffect(() => {
    setLimit(300);
    setInAppBrowserCollapsed(false);
    setSelectedPaths(new Set());
    setSearchQuery('');
  }, [inAppBrowserPath, setInAppBrowserCollapsed]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    };
  }, []);

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

  const handleBarMouseEnter = () => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    if (inAppBrowserCollapsed) {
      setInAppBrowserCollapsed(false);
    }
  };

  const handlePanelMouseEnter = () => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  };

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

  const handleAddAll = async (typeOverride?: 'all' | 'video' | 'picture') => {
    const targetFilter = typeOverride || mediaFilter;
    const mediaPaths = items
      .filter(item => {
        if (item.is_dir) return false;
        if (targetFilter === 'video') return isValidMediaExtension(item.path, 'video');
        if (targetFilter === 'picture') return isValidMediaExtension(item.path, 'picture');
        return item.is_media;
      })
      .map(item => item.path);
    
    const filterLabel = targetFilter === 'video' ? 'Videos' : targetFilter === 'picture' ? 'Pictures' : 'All Media';
    addLog(`System: In-app browser "Add ${filterLabel}" requested for ${mediaPaths.length} file(s).`);

    if (mediaPaths.length === 0) {
      alert(`No ${targetFilter === 'video' ? 'video' : targetFilter === 'picture' ? 'picture' : 'compatible media'} files in this folder to add.`);
      return;
    }
    
    onAddMultipleFiles(mediaPaths);
    setInAppBrowserCollapsed(true);
  };

  const handleToggleSelect = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSelectAllVideos = () => {
    const videoPaths = items
      .filter(item => !item.is_dir && isValidMediaExtension(item.path, 'video'))
      .map(item => item.path);
    setSelectedPaths(new Set(videoPaths));
    addLog(`In-app browser: Selected ${videoPaths.length} video(s)`);
  };

  const handleSelectAllPictures = () => {
    const picPaths = items
      .filter(item => !item.is_dir && isValidMediaExtension(item.path, 'picture'))
      .map(item => item.path);
    setSelectedPaths(new Set(picPaths));
    addLog(`In-app browser: Selected ${picPaths.length} picture(s)`);
  };

  const handleSelectAllInView = () => {
    const filePaths = visibleItems
      .filter(item => !item.is_dir)
      .map(item => item.path);
    setSelectedPaths(new Set(filePaths));
    addLog(`In-app browser: Selected all ${filePaths.length} visible file(s)`);
  };

  const handleClearSelection = () => {
    setSelectedPaths(new Set());
  };

  const handleAddSelected = () => {
    if (selectedPaths.size === 0) return;
    const pathsToAdd = Array.from(selectedPaths);
    addLog(`System: In-app browser adding ${pathsToAdd.length} selected item(s).`);
    onAddMultipleFiles(pathsToAdd);
    setSelectedPaths(new Set());
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
              {formatPathLabel(inAppBrowserPath || '')}
              {isCurrentFolderAutoSync && <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 800, marginLeft: '4px' }}>[AUTO-SYNC]</span>}
              {mediaFilter === 'video' && <span className="browser-collapsed-filter-badge">[VIDEOS]</span>}
              {mediaFilter === 'picture' && <span className="browser-collapsed-filter-badge" style={{ color: '#38bdf8' }}>[PICTURES]</span>}
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

      {/* Header and Toolbar */}
      <BrowserToolbar
        inAppBrowserPath={inAppBrowserPath}
        loading={loading}
        isPinned={isPinned}
        isMaximized={isMaximized}
        mediaFilter={mediaFilter}
        mediaCounts={mediaCounts}
        searchQuery={searchQuery}
        sortBy={sortBy}
        sortOrder={sortOrder}
        layoutMode={layoutMode}
        autoAddIncoming={autoAddIncoming}
        isCurrentFolderAutoSync={Boolean(isCurrentFolderAutoSync)}
        onRefresh={() => loadContents(inAppBrowserPath)}
        onTogglePinned={togglePinned}
        onToggleMaximize={toggleMaximize}
        onMinimize={() => setInAppBrowserCollapsed(true)}
        onClose={() => setShowInAppBrowser(false)}
        onGoUp={handleGoUp}
        onAddAll={handleAddAll}
        onSearchChange={setSearchQuery}
        onSortByChange={setSortBy}
        onSortOrderToggle={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
        onLayoutToggle={() => setLayoutMode(prev => prev === 'grid' ? 'list' : 'grid')}
        onToggleAutoSync={() => {
          if (inAppBrowserPath) {
            toggleAutoSyncFolder(inAppBrowserPath);
            addLog(`Auto-Sync ${isCurrentFolderAutoSync ? 'disabled' : 'enabled'} for "${inAppBrowserPath}"`);
          }
        }}
        onToggleAutoAddIncoming={() => {
          const next = !autoAddIncoming;
          setAutoAddIncoming(next);
          localStorage.setItem('cosmo-auto-add-incoming', next ? 'true' : 'false');
        }}
        onMediaFilterChange={(filter) => setInAppBrowserMediaFilter(filter)}
      />

      {/* Main List Body */}
      <div className="browser-body">
        {/* Floating Selection Bar */}
        {selectedPaths.size > 0 && (
          <BrowserBatchBar
            selectedCount={selectedPaths.size}
            totalFilteredCount={visibleItems.filter(x => !x.is_dir).length}
            onAddSelected={handleAddSelected}
            onSelectAllInView={handleSelectAllInView}
            onSelectAllVideos={handleSelectAllVideos}
            onSelectAllPictures={handleSelectAllPictures}
            onClearSelection={handleClearSelection}
          />
        )}

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
        ) : visibleItems.length === 0 ? (
          <div className="browser-empty-box" style={{ flexDirection: 'column', gap: '8px' }}>
            {searchQuery ? (
              <>
                <p>No files matching "{searchQuery}".</p>
                <button 
                  className="retry-btn" 
                  onClick={() => setSearchQuery('')}
                  style={{ fontSize: '10px', padding: '4px 8px' }}
                >
                  Clear Search
                </button>
              </>
            ) : mediaFilter === 'video' ? (
              <>
                <p>No video files in this folder.</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {mediaCounts.picture > 0 && (
                    <button 
                      className="retry-btn" 
                      onClick={() => setInAppBrowserMediaFilter('picture')}
                      style={{ fontSize: '10px', padding: '4px 8px', color: '#38bdf8' }}
                    >
                      Show Pictures ({mediaCounts.picture})
                    </button>
                  )}
                  <button 
                    className="retry-btn" 
                    onClick={() => setInAppBrowserMediaFilter('all')}
                    style={{ fontSize: '10px', padding: '4px 8px' }}
                  >
                    Show All Media ({mediaCounts.all})
                  </button>
                </div>
              </>
            ) : mediaFilter === 'picture' ? (
              <>
                <p>No picture files in this folder.</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {mediaCounts.video > 0 && (
                    <button 
                      className="retry-btn" 
                      onClick={() => setInAppBrowserMediaFilter('video')}
                      style={{ fontSize: '10px', padding: '4px 8px', color: 'var(--accent, #00ff88)' }}
                    >
                      Show Videos ({mediaCounts.video})
                    </button>
                  )}
                  <button 
                    className="retry-btn" 
                    onClick={() => setInAppBrowserMediaFilter('all')}
                    style={{ fontSize: '10px', padding: '4px 8px' }}
                  >
                    Show All Media ({mediaCounts.all})
                  </button>
                </div>
              </>
            ) : (
              <p>No items found.</p>
            )}
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
                  isSelected={selectedPaths.has(item.path)}
                  hasSelection={selectedPaths.size > 0}
                  onToggleSelect={handleToggleSelect}
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
