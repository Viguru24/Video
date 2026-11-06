import React, { useRef, useState, useEffect } from 'react';
import { 
  FolderOpen, 
  CornerUpLeft, 
  RotateCw, 
  Pin, 
  Maximize2, 
  Minimize2, 
  ChevronUp, 
  X, 
  Download, 
  Film, 
  Image as ImageIcon, 
  Plus, 
  Search, 
  LayoutGrid, 
  List, 
  Zap 
} from 'lucide-react';

export interface BrowserToolbarProps {
  inAppBrowserPath: string;
  loading: boolean;
  isPinned: boolean;
  isMaximized: boolean;
  mediaFilter: 'all' | 'video' | 'picture';
  mediaCounts: { all: number; video: number; picture: number; dirs: number };
  searchQuery: string;
  sortBy: 'name' | 'date' | 'size';
  sortOrder: 'asc' | 'desc';
  layoutMode: 'grid' | 'list';
  autoAddIncoming: boolean;
  isCurrentFolderAutoSync: boolean;
  onRefresh: () => void;
  onTogglePinned: () => void;
  onToggleMaximize: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onGoUp: () => void;
  onAddAll: (override?: 'all' | 'video' | 'picture') => void;
  onSearchChange: (q: string) => void;
  onSortByChange: (sort: 'name' | 'date' | 'size') => void;
  onSortOrderToggle: () => void;
  onLayoutToggle: () => void;
  onToggleAutoSync: () => void;
  onToggleAutoAddIncoming: () => void;
  onMediaFilterChange: (filter: 'all' | 'video' | 'picture') => void;
}

export function BrowserToolbar({
  inAppBrowserPath,
  loading,
  isPinned,
  isMaximized,
  mediaFilter,
  mediaCounts,
  searchQuery,
  sortBy,
  sortOrder,
  layoutMode,
  autoAddIncoming,
  isCurrentFolderAutoSync,
  onRefresh,
  onTogglePinned,
  onToggleMaximize,
  onMinimize,
  onClose,
  onGoUp,
  onAddAll,
  onSearchChange,
  onSortByChange,
  onSortOrderToggle,
  onLayoutToggle,
  onToggleAutoSync,
  onToggleAutoAddIncoming,
  onMediaFilterChange
}: BrowserToolbarProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const formatPathLabel = (path: string) => {
    if (path.length > 35) {
      return '...' + path.substring(path.length - 32);
    }
    return path;
  };

  return (
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
            onClick={onRefresh}
            title="Refresh Folder"
            disabled={loading}
          >
            <RotateCw size={13} className={loading ? 'spin' : ''} />
          </button>
          <button 
            className={`layout-toggle-btn ${isPinned ? 'active' : ''}`}
            onClick={onTogglePinned}
            title={isPinned ? "Pinned: Stays open (Click to enable auto-minimize on mouse leave)" : "Auto-Hide Mode: Minimizes on mouse away (Click to Pin Open)"}
            style={{
              color: isPinned ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.5)'
            }}
          >
            <Pin size={13} fill={isPinned ? "currentColor" : "none"} />
          </button>
          <button 
            className={`layout-toggle-btn ${isMaximized ? 'active' : ''}`}
            onClick={onToggleMaximize}
            title={isMaximized ? "Restore Window Size" : "Maximize Browser Window"}
            style={{
              color: isMaximized ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.7)'
            }}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button 
            className="layout-toggle-btn"
            onClick={onMinimize}
            title="Minimize Browser"
          >
            <ChevronUp size={13} />
          </button>
          <button 
            className="browser-close-btn" 
            onClick={onClose}
            title="Close In-App Browser"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Navigation Breadcrumb Area & Smart Add Button */}
      <div className="browser-nav-row">
        <button 
          className="browser-nav-btn up-btn"
          onClick={onGoUp}
          disabled={!inAppBrowserPath || inAppBrowserPath === 'C:\\' || inAppBrowserPath === 'C:/'}
          title="Go to Parent Folder"
        >
          <CornerUpLeft size={12} />
        </button>
        <div className="browser-path-display" title={inAppBrowserPath}>
          {formatPathLabel(inAppBrowserPath || '')}
        </div>
        
        {/* Smart Add Button with Dropdown Selector */}
        <div className="browser-add-btn-group" ref={addMenuRef}>
          <button 
            className="browser-nav-btn add-all-btn"
            onClick={() => onAddAll()}
            title={
              mediaFilter === 'video'
                ? `Add All Videos (${mediaCounts.video}) to workspace`
                : mediaFilter === 'picture'
                  ? `Add All Pictures (${mediaCounts.picture}) to workspace`
                  : `Add All Media (${mediaCounts.all}) to workspace`
            }
          >
            {mediaFilter === 'video' ? (
              <Film size={12} />
            ) : mediaFilter === 'picture' ? (
              <ImageIcon size={12} />
            ) : (
              <Download size={12} />
            )}
            <span>
              {mediaFilter === 'video' 
                ? `Add Videos (${mediaCounts.video})` 
                : mediaFilter === 'picture' 
                  ? `Add Pictures (${mediaCounts.picture})` 
                  : `Add All (${mediaCounts.all})`}
            </span>
          </button>
          <button 
            className="browser-nav-btn add-all-dropdown-trigger"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddMenu(prev => !prev);
            }}
            title="Quick Add Specific Media Types"
          >
            <Plus size={11} />
          </button>

          {showAddMenu && (
            <div className="browser-smart-add-menu">
              <div 
                className="browser-smart-add-item" 
                onClick={() => { setShowAddMenu(false); onAddAll('all'); }}
              >
                <Download size={12} />
                <span>Add All Media ({mediaCounts.all})</span>
              </div>
              <div 
                className="browser-smart-add-item" 
                onClick={() => { setShowAddMenu(false); onAddAll('video'); }}
              >
                <Film size={12} />
                <span>Add All Videos ({mediaCounts.video})</span>
              </div>
              <div 
                className="browser-smart-add-item" 
                onClick={() => { setShowAddMenu(false); onAddAll('picture'); }}
              >
                <ImageIcon size={12} />
                <span>Add All Pictures ({mediaCounts.picture})</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter, Search & Display Controls */}
      <div className="browser-filter-row">
        {/* Media Filter Tabs */}
        <div className="browser-filter-tabs">
          <button 
            className={`browser-filter-tab ${mediaFilter === 'all' ? 'active' : ''}`}
            onClick={() => onMediaFilterChange('all')}
            title="Show All Compatible Media"
          >
            All <span className="tab-count">{mediaCounts.all}</span>
          </button>
          <button 
            className={`browser-filter-tab ${mediaFilter === 'video' ? 'active' : ''}`}
            onClick={() => onMediaFilterChange('video')}
            title="Show Videos Only"
          >
            Videos <span className="tab-count">{mediaCounts.video}</span>
          </button>
          <button 
            className={`browser-filter-tab ${mediaFilter === 'picture' ? 'active' : ''}`}
            onClick={() => onMediaFilterChange('picture')}
            title="Show Pictures & Photos Only"
          >
            Pictures <span className="tab-count">{mediaCounts.picture}</span>
          </button>
        </div>

        {/* Live Search Input Box */}
        <div className="browser-search-box">
          <Search size={11} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search..." 
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="browser-search-input"
          />
          {searchQuery && (
            <button 
              className="browser-clear-search-btn" 
              onClick={() => onSearchChange('')}
              title="Clear Search"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Sorting & Layout Toggles */}
        <div className="browser-display-controls">
          <select 
            className="browser-sort-select"
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as any)}
            title="Sort files by"
          >
            <option value="name">Name</option>
            <option value="date">Date</option>
            <option value="size">Size</option>
          </select>

          <button 
            className="layout-toggle-btn"
            onClick={onSortOrderToggle}
            title={sortOrder === 'asc' ? "Ascending order" : "Descending order"}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>

          <button 
            className={`layout-toggle-btn ${layoutMode === 'grid' ? 'active' : ''}`}
            onClick={onLayoutToggle}
            title={layoutMode === 'grid' ? "Switch to List View" : "Switch to Grid View"}
          >
            {layoutMode === 'grid' ? <LayoutGrid size={12} /> : <List size={12} />}
          </button>
        </div>
      </div>

      {/* Auto-Sync Toggle Row */}
      <div className="browser-autosync-row">
        <button 
          className={`browser-autosync-toggle ${isCurrentFolderAutoSync ? 'active' : ''}`}
          onClick={onToggleAutoSync}
          title={isCurrentFolderAutoSync 
            ? "Auto-Sync Active: New media in this folder will be auto-loaded into your workspace" 
            : "Enable Auto-Sync: Automatically ingest new photos/videos saved to this folder"}
        >
          <Zap size={11} className={isCurrentFolderAutoSync ? 'glow-accent' : ''} />
          <span>{isCurrentFolderAutoSync ? 'Auto-Sync Folder (Active)' : 'Enable Folder Auto-Sync'}</span>
        </button>

        <label 
          className="browser-autoadd-checkbox"
          title="When enabled, new media files appearing in this folder will be added to the workspace automatically"
        >
          <input 
            type="checkbox"
            checked={autoAddIncoming}
            onChange={onToggleAutoAddIncoming}
          />
          <span>Auto-add incoming media</span>
        </label>
      </div>
    </div>
  );
}
