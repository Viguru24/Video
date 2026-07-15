import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toCosmoUrl, isTauri, showConfirm, generateUUID } from '../utils/videoUtils';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion } from 'framer-motion';
import type { VideoItem, RepeatMode, SortOption } from '../types';
import { ContextMenu } from './ContextMenu';
import { useStore } from '../store/useStore';
import { BatchRenameModal } from './modals/BatchRenameModal';
import { CollectionsModal } from './modals/CollectionsModal';
import { SettingsModal } from './modals/SettingsModal';
import { MIN_ZOOM, MAX_ZOOM } from '../constants';
import { validateCollectionName } from '../utils/validation';
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  Camera,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  GripVertical,
  Maximize2,
  Minimize2,
  FolderOpen,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Maximize,
  LayoutGrid,
  Bookmark,
  ListRestart,
  Search,
  RotateCcw,
  Layers,
  Zap,
  Settings,
  Eye,
  EyeOff,
  Trash2,
  Monitor,
  Plus,
  FilePlus,
  Gauge,
  FastForward,
  HelpCircle,
  Palette,
  Share2,
  Save,
  MousePointer2,
  ArrowUpDown,
  Check,
  Download,
  ExternalLink,
  Command,
  Keyboard,
  Info,
  Hash,
  Type,
  Image as ImageIcon,
  Film,
  ChevronDown,
  Cpu,
  Sparkles,
  Wifi
} from 'lucide-react';

interface ControlBarProps {
  videos: VideoItem[];
  collections: Record<string, VideoItem[]>;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  setCollections: React.Dispatch<React.SetStateAction<Record<string, VideoItem[]>>>;
  rotationInterval: number;
  setRotationInterval: React.Dispatch<React.SetStateAction<number>>;
  snapshotDir: string;
  setSnapshotDir: React.Dispatch<React.SetStateAction<string>>;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  addLog: (msg: string) => void;
  onUpdateVideo: (id: any, updates: any) => void;
  onRemoveVideo: (id: string) => void;
  onToggleFocus: (id: string | null) => void;
  onLog: (msg: string) => void;
  onBatchRemove: () => void;
  onBatchMute: (mute: boolean) => void;
  onBatchPlay: (play: boolean) => void;
  filtered: VideoItem[];
  focusedId: string | null;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showCollections: boolean;
  setShowCollections: React.Dispatch<React.SetStateAction<boolean>>;
  showLogs: boolean;
  setShowLogs: React.Dispatch<React.SetStateAction<boolean>>;
  newCollectionName: string;
  setNewCollectionName: React.Dispatch<React.SetStateAction<string>>;
  logs: { t: string; m: string }[];
  setGlobalControl: React.Dispatch<React.SetStateAction<string | null>>;
  confirmDeletion: boolean;
  setConfirmDeletion: React.Dispatch<React.SetStateAction<boolean>>;

  isPopout: boolean;
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  toggleMasterMute: (soloId?: string) => void;
  globalControl: string | null;
  rotating: boolean;
  setRotating: (val: boolean) => void;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (val: boolean) => void;
  slideshowInterval: number;
  setSlideshowInterval: React.Dispatch<React.SetStateAction<number>>;
  onOpenWifiShare?: () => void;
  onOpenVolumeRepeat?: () => void;
  onForceSetup?: () => void;
}

export function ControlBar({
  videos,
  collections,
  setVideos,
  setCollections,
  rotationInterval,
  setRotationInterval,
  snapshotDir,
  setSnapshotDir,
  search,
  setSearch,
  addLog,
  onUpdateVideo,
  onRemoveVideo,
  onToggleFocus,
  onLog,
  onBatchRemove,
  onBatchMute,
  onBatchPlay,
  filtered,
  focusedId,
  showSettings,
  setShowSettings,
  showCollections,
  setShowCollections,
  showLogs,
  setShowLogs,
  newCollectionName,
  setNewCollectionName,
  logs,
  setGlobalControl,
  confirmDeletion,
  setConfirmDeletion,
  isPopout,
  showHelp,
  setShowHelp,
  toggleMasterMute,
  globalControl,
  rotating,
  setRotating,
  isSlideshowActive,
  setIsSlideshowActive,
  slideshowInterval,
  setSlideshowInterval,
  onOpenWifiShare,
  onOpenVolumeRepeat,
  onForceSetup
}: ControlBarProps) {
  const {
    mediaMode, setMediaMode,
    theme, setTheme,
    alwaysOnTop, setAlwaysOnTop,
    isFS, setIsFS,
    masterPlaying, setMasterPlaying,
    masterMuted, setMasterMuted,
    globalVolume, setGlobalVolume,
    speed, setSpeed,
    globalRepeat, setGlobalRepeat,
    fitMode, setFitMode,
    zoom, setZoom,
    immersive, setImmersive,
    masterShowUI, setMasterShowUI,
    selectedIds, setSelectedIds,
    renameHistory,
    aiHardwareStatus,
    quickFolders, setQuickFolders,
    showInAppBrowser, setShowInAppBrowser,
    inAppBrowserPath, setInAppBrowserPath,
    enableSlideshowPanZoom, setEnableSlideshowPanZoom,
    sortOrder, setSortOrder
  } = useStore();
  const [showBatchRename, setShowBatchRename] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [sortDropdownPos, setSortDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isSpanned, setIsSpanned] = useState(false);
  const [showMaxMenu, setShowMaxMenu] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [showQuickFoldersDropdown, setShowQuickFoldersDropdown] = useState(false);
  const quickFoldersRef = useRef<HTMLDivElement>(null);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!showSortDropdown) return;
    function handleSortOutside(e: MouseEvent) {
      if (
        sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node) &&
        sortButtonRef.current && !sortButtonRef.current.contains(e.target as Node)
      ) {
        setShowSortDropdown(false);
      }
    }
    window.addEventListener('mousedown', handleSortOutside);
    return () => window.removeEventListener('mousedown', handleSortOutside);
  }, [showSortDropdown]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (quickFoldersRef.current && !quickFoldersRef.current.contains(event.target as Node)) {
        setShowQuickFoldersDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handlePinNewFolder = async () => {
    try {
      const path = await invoke<string>('select_folder_cmd');
      if (path === 'Cancelled') return;
      
      const parts = path.split(/[\\/]/);
      const defaultName = parts[parts.length - 1] || parts[parts.length - 2] || "Folder";
      
      const label = (window as any).__customPromptHandler
        ? await (window as any).__customPromptHandler("Enter a name/label for this pinned folder:", defaultName, { title: "PIN WORKSPACE FOLDER" })
        : prompt("Enter a name/label for this pinned folder:", defaultName);
      if (label === null) return;
      
      const nextFolders = [
        {
          id: generateUUID(),
          name: label.trim() || defaultName,
          path
        },
        ...quickFolders
      ];
      setQuickFolders(nextFolders);
      addLog(`SUCCESS: Pinned directory "${label || defaultName}" (${path})`);
      
      // Automatically open the folder in the In-App Browser on selection
      handleOpenInAppBrowser(path);
    } catch (err: any) {
      if (err !== 'Cancelled') {
        console.error("Failed to pin folder:", err);
      }
    }
  };

  const handleRenamePinnedFolder = (id: string) => {
    const folder = quickFolders.find(f => f.id === id);
    if (!folder) return;
    const label = prompt("Enter a new name for this pinned folder:", folder.name);
    if (label === null) return;
    
    const nextFolders = quickFolders.map(f => 
      f.id === id ? { ...f, name: label.trim() || f.name } : f
    );
    setQuickFolders(nextFolders);
    addLog(`SUCCESS: Renamed pinned folder to "${label}"`);
  };

  const handleUnpinFolder = async (id: string) => {
    const folder = quickFolders.find(f => f.id === id);
    if (!folder) return;
    if (await showConfirm(`Are you sure you want to unpin "${folder.name}"?`, { title: 'Unpin Folder', kind: 'warning' })) {
      setQuickFolders(quickFolders.filter(f => f.id !== id));
      addLog(`SUCCESS: Unpinned folder "${folder.name}"`);
    }
  };

  const handleOpenInAppBrowser = (path: string) => {
    setInAppBrowserPath(path);
    setShowInAppBrowser(true);
    setShowQuickFoldersDropdown(false);
  };

  useEffect(() => {
    if (!isTauri()) return;
    const checkMax = async () => {
      const max = await getCurrentWindow().isMaximized();
      setIsWindowMaximized(max);
    };
    checkMax();
    const interval = setInterval(checkMax, 1000);
    return () => clearInterval(interval);
  }, []);






  const filteredHistory = useMemo(() => {
    if (!renameHistory) return [];
    if (!search.trim()) return renameHistory;
    return renameHistory.filter(name => 
      name.toLowerCase().includes(search.toLowerCase())
    );
  }, [renameHistory, search]);

  const toggleMasterPlay = useCallback(() => {
    const newState = !masterPlaying;
    setMasterPlaying(newState);
    setVideos((p) => p.map((v) => ({ ...v, playing: newState })));
  }, [masterPlaying, setMasterPlaying, setVideos]);

  useEffect(() => {
    if (globalControl?.startsWith('batch-rename-selected-')) {
      setShowBatchRename(true);
      setGlobalControl(null);
    }
  }, [globalControl, setGlobalControl]);

  const handleHeaderMouseDown = useCallback(async (e: React.MouseEvent) => {
    if (!isTauri()) return;
    if (e.button !== 0) return; // Only left click

    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]') || target.closest('a') || target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }

    const win = getCurrentWindow();
    const startX = e.screenX;
    const startY = e.screenY;

    const handleMouseMove = async (moveEvent: MouseEvent) => {
      const dist = Math.hypot(moveEvent.screenX - startX, moveEvent.screenY - startY);
      if (dist > 5) {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        const isMax = await win.isMaximized();
        if (isMax || isSpanned) {
          if (isSpanned) {
            await invoke('unspan_monitors').catch(console.error);
            setIsSpanned(false);
          } else {
            await win.unmaximize();
          }
          // Small delay for OS to process state transition
          await new Promise(r => setTimeout(r, 50));
        }

        await win.startDragging().catch(console.error);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isSpanned]);

  const handleHeaderDoubleClick = useCallback(async (e: React.MouseEvent) => {
    if (!isTauri()) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]') || target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }

    const win = getCurrentWindow();
    if (isSpanned) {
      await invoke('unspan_monitors').catch(console.error);
      setIsSpanned(false);
    } else {
      const isMax = await win.isMaximized();
      if (isMax) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    }
  }, [isSpanned]);

  return (
    <>
        <header 
          className="app-header"
          onMouseDown={handleHeaderMouseDown}
          onDoubleClick={handleHeaderDoubleClick}
        >
          <div className="header-row brand-row">
            <div className="header-left">
              {/* BRANDING TITLE */}
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  marginRight: '12px',
                  userSelect: 'none'
                }}
                data-no-drag
              >
                <img src="/logo.png" style={{ height: '16px', objectFit: 'contain' }} alt="Cosmo" />
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: 900, 
                  letterSpacing: '1.5px', 
                  color: '#fff', 
                  fontFamily: 'system-ui, sans-serif',
                  background: 'linear-gradient(90deg, #fff 0%, #a855f7 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  COSMO SYMPHONY
                </span>
              </div>

              <div className="search-box" data-no-drag>
                <Search size={14} className="search-icon-mini" />
                <input 
                  type="text" 
                  placeholder={mediaMode === 'video' ? "Search Videos..." : "Search Pictures..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                  onFocus={() => setShowSearchDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowSearchDropdown(false), 200);
                  }}
                  className="hdr-search-input"
                />
                {search && (
                  <button 
                    className="search-clear-btn" 
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={() => setSearch('')}
                    data-tooltip="Clear Search"
                  >
                    <X size={12} />
                  </button>
                )}

                {showSearchDropdown && filteredHistory.length > 0 && (
                  <div className="search-history-dropdown" onMouseDown={e => e.stopPropagation()}>
                    {filteredHistory.map((item, idx) => (
                      <div
                        key={idx}
                        className="search-history-item"
                        onClick={() => {
                          setSearch(item);
                          setShowSearchDropdown(false);
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mode-switch-group" data-no-drag>
                <button 
                  className={`mode-btn ${mediaMode === 'all' ? 'active' : ''}`}
                  onClick={() => setMediaMode('all')}
                  data-tooltip="Show All Media"
                >
                  <LayoutGrid size={14} />
                  <span>ALL</span>
                </button>
                <button 
                  className={`mode-btn ${mediaMode === 'video' ? 'active' : ''}`}
                  onClick={() => setMediaMode('video')}
                  data-tooltip="Video Mode"
                >
                  <Film size={14} />
                  <span>VIDEO</span>
                </button>
                <button 
                  className={`mode-btn ${mediaMode === 'picture' ? 'active' : ''}`}
                  onClick={() => setMediaMode('picture')}
                  data-tooltip="Picture Mode"
                >
                  <ImageIcon size={14} />
                  <span>STILL</span>
                </button>
              </div>

              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 8px' }} />

              {/* Wi-Fi Sharing Button */}
              <button 
                className="mode-btn"
                onClick={onOpenWifiShare}
                data-tooltip="Wi-Fi Sharing Protocol"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Wifi size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span>WI-FI SHARE</span>
              </button>

              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 8px' }} />

              {/* Quick Folders Dropdown */}
              <div className="quick-folders-container" ref={quickFoldersRef} data-no-drag>
                <button 
                  className={`mode-btn quick-folders-trigger-btn ${showQuickFoldersDropdown ? 'active' : ''}`}
                  onClick={() => setShowQuickFoldersDropdown(!showQuickFoldersDropdown)}
                  data-tooltip="Quick Access Pinned Folders"
                >
                  <FolderOpen size={14} className="quick-folders-icon" />
                  <span>QUICK FOLDERS</span>
                  <ChevronDown size={10} className="quick-folders-arrow-icon" style={{ marginLeft: '4px', opacity: 0.7 }} />
                </button>
                {showQuickFoldersDropdown && (
                  <div className="quick-folders-dropdown">
                    <div className="quick-folders-header">
                      <span className="quick-folders-title">Pinned Folders</span>
                      <button 
                        className="quick-folders-add-btn" 
                        onClick={handlePinNewFolder}
                        title="Pin New Folder"
                      >
                        <Plus size={11} />
                        <span>Pin Folder</span>
                      </button>
                    </div>
                    <div className="quick-folders-list">
                      {quickFolders.length === 0 ? (
                        <div className="quick-folders-empty">No folders pinned. Click Pin Folder to start.</div>
                      ) : (
                        quickFolders.map(folder => (
                          <div key={folder.id} className="quick-folder-item">
                            <button 
                              className="quick-folder-link"
                              onClick={() => handleOpenInAppBrowser(folder.path)}
                              title={folder.path}
                            >
                              <FolderOpen size={12} className="folder-item-icon" />
                              <span className="folder-item-name">{folder.name}</span>
                            </button>
                            <div className="quick-folder-actions">
                              <button 
                                className="quick-folder-action-btn edit" 
                                onClick={() => handleRenamePinnedFolder(folder.id)}
                                title="Rename Pin"
                              >
                                <Type size={11} />
                              </button>
                              <button 
                                className="quick-folder-action-btn delete" 
                                onClick={() => handleUnpinFolder(folder.id)}
                                title="Unpin Folder"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 8px' }} />

              {/* "Open Screenshots Folder" button removed as per user request — it was confusing because it didn't open the currently active image folder */}
              
              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 8px' }} />

              {/* Refresh Tiles Button */}
              <button 
                className="mode-btn"
                onClick={() => {
                  const cacheBuster = `t=${Date.now()}`;
                  setVideos(prev => prev.map(v => {
                    const cleanUrl = v.url.split('?')[0];
                    return { ...v, url: `${cleanUrl}?${cacheBuster}` };
                  }));
                  addLog("SYSTEM: Refreshed all tiles in workspace");
                }}
                data-tooltip="Refresh All Tiles"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <RefreshCw size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span>REFRESH TILES</span>
              </button>
            </div>
            
            {isTauri() && (
              <div 
                className="window-controls" 
                style={{ display: 'flex', gap: '8px', marginLeft: 'auto', paddingRight: '4px', zIndex: 1001, pointerEvents: 'auto', position: 'relative' }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
              >
                <button className="win-dot min" onClick={() => getCurrentWindow().minimize()} title="Minimize" />
                <button className="win-dot max" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMaxMenu(prev => !prev); }} title="Maximize Options" />
                <button className="win-dot close" onClick={() => getCurrentWindow().close()} title="Close" />
                
                {showMaxMenu && (
                  <div className="max-options-dropdown" style={{
                    position: 'absolute',
                    top: '25px',
                    right: '15px',
                    background: 'rgba(15, 15, 20, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    zIndex: 100002
                  }}>
                    <button 
                      onClick={() => {
                        getCurrentWindow().maximize();
                        setShowMaxMenu(false);
                        setIsSpanned(false);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        fontSize: '11px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        fontWeight: 'bold'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      Maximize Single Screen
                    </button>
                    <button 
                      onClick={() => {
                        invoke('span_all_monitors').catch(console.error);
                        setShowMaxMenu(false);
                        setIsSpanned(true);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent, #00ff88)',
                        fontSize: '11px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        fontWeight: 'bold'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      Span Dual/All Screens
                    </button>
                    {(isSpanned || isWindowMaximized) && (
                      <button 
                        onClick={async () => {
                          if (isSpanned) {
                            invoke('unspan_monitors').catch(console.error);
                            setIsSpanned(false);
                          } else {
                            const win = getCurrentWindow();
                            if (await win.isMaximized()) {
                              win.unmaximize();
                            }
                          }
                          setShowMaxMenu(false);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ff4d4d',
                          fontSize: '11px',
                          padding: '6px 12px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          fontWeight: 'bold'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        Restore Window
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="header-row controls-row" data-no-drag>
            <div className="header-menu-container" data-no-drag>


            {/* SYMPHONY WORKSHOP */}
            <div className="ctrl-group symphony-group">
              <button onClick={() => setShowCollections(!showCollections)} className={`hdr-btn ${showCollections ? 'active-accent' : ''}`} data-tooltip="Sets">
                <Bookmark size={14} />
              </button>
              <button onClick={() => setShowBatchRename(!showBatchRename)} className={`hdr-btn ${showBatchRename ? 'active-accent' : ''}`} data-tooltip="Batch Rename">
                <Type size={14} />
              </button>
            </div>

            {/* SORTING CONTROLS */}
            <div className="ctrl-group sort-group">
              <button
                ref={sortButtonRef}
                onClick={() => {
                  if (!showSortDropdown && sortButtonRef.current) {
                    const rect = sortButtonRef.current.getBoundingClientRect();
                    setSortDropdownPos({ top: rect.bottom + 8, left: rect.left });
                  }
                  setShowSortDropdown(v => !v);
                }}
                className={`hdr-btn ${sortOrder !== 'custom' ? 'active-accent' : ''}`}
                data-tooltip="Sort Cards"
              >
                <ArrowUpDown size={14} />
              </button>
            </div>
            {showSortDropdown && (
              <div 
                ref={sortDropdownRef}
                className="sort-dropdown"
                style={{
                  position: 'fixed',
                  top: sortDropdownPos.top,
                  left: sortDropdownPos.left,
                  background: 'var(--bg-glass, rgba(13, 8, 27, 0.92))',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '6px 0',
                  width: '200px',
                  zIndex: 999999,
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1)',
                }}
              >
                {[
                  { label: 'Custom Order', value: 'custom' },
                  { label: 'Sort: Videos First', value: 'videos-first' },
                  { label: 'Sort: Stills First', value: 'pictures-first' },
                  { label: 'Name (A -> Z)', value: 'name-asc' },
                  { label: 'Name (Z -> A)', value: 'name-desc' },
                  { label: 'Size (Small -> Large)', value: 'size-asc' },
                  { label: 'Size (Large -> Small)', value: 'size-desc' },
                  { label: 'Date Modified (Newest)', value: 'modified-newest' },
                  { label: 'Date Modified (Oldest)', value: 'modified-oldest' },
                  { label: 'Date Created (Newest)', value: 'created-newest' },
                  { label: 'Date Created (Oldest)', value: 'created-oldest' },
                ].map(opt => (
                  <div
                    key={opt.value}
                    className={`sort-dropdown-item ${sortOrder === opt.value ? 'active' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      fontSize: '11px',
                      color: sortOrder === opt.value ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.7)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      background: sortOrder === opt.value ? 'rgba(0, 255, 136, 0.05)' : 'transparent',
                    }}
                    onMouseDown={() => {
                      setSortOrder(opt.value as SortOption);
                      setShowSortDropdown(false);
                    }}
                    onMouseEnter={(e) => {
                      if (sortOrder !== opt.value) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                        e.currentTarget.style.color = '#fff';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (sortOrder !== opt.value) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                      }
                    }}
                  >
                    {sortOrder === opt.value ? <Check size={11} className="menu-check" /> : <div style={{ width: 11 }} />}
                    <span>{opt.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* PLAYBACK ENGINE */}
            {mediaMode === 'video' && (
              <div className="ctrl-group playback-group">
                {/* HORIZONTAL SPEED */}
                <div className="slider-h-box" data-tooltip={`Speed: ${speed}x`}>
                  <Gauge size={12} className="slider-h-icon" />
                  <input
                    type="range"
                    min="0.25"
                    max="4"
                    step="0.25"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="h-range speed-range"
                    style={{
                      background: `linear-gradient(to right, var(--accent, #00ff88) 0%, var(--accent, #00ff88) ${((speed - 0.25) / 3.75) * 100}%, rgba(255, 255, 255, 0.12) ${((speed - 0.25) / 3.75) * 100}%, rgba(255, 255, 255, 0.12) 100%)`
                    }}
                  />
                </div>
                
                {/* MODALIZED VOLUME & MIXER BUTTON */}
                <button
                  onClick={onOpenVolumeRepeat}
                  className={`hdr-btn ${masterMuted ? 'active-danger' : globalVolume > 0 ? 'active-accent' : ''}`}
                  data-tooltip={masterMuted ? "Volume: MUTED (Click to Open Mixer)" : `Volume: ${Math.round(globalVolume * 100)}% (Click to Open Mixer)`}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {masterMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>

                {/* MODALIZED REPEAT BUTTON */}
                <button
                  onClick={onOpenVolumeRepeat}
                  className={`hdr-btn ${globalRepeat !== 'none' ? 'active-accent' : ''}`}
                  data-tooltip={`Repeat: ${globalRepeat === 'none' ? 'OFF' : globalRepeat === 'always' ? 'ALWAYS' : 'FOLDER'} (Click to Configure)`}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {globalRepeat === 'always' && <Repeat size={14} />}
                  {globalRepeat === 'folder' && <Repeat size={14} style={{ color: 'var(--accent-dim, #00cc66)' }} />}
                  {(globalRepeat === 'none' || globalRepeat === 'once') && <Repeat size={14} style={{ opacity: 0.5 }} />}
                </button>

                {/* PLAY/PAUSE */}
                <button 
                  onClick={toggleMasterPlay} 
                  className={`hdr-btn main-play ${masterPlaying ? 'active-accent' : ''}`} 
                  data-tooltip="Play/Pause"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {masterPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                </button>
              </div>
            )}

            {/* DENSITY & UI */}
            <div className="ctrl-group density-group">
              {/* HORIZONTAL DENSITY */}
              <div className="slider-h-box" data-tooltip={`Density: ${(MAX_ZOOM + MIN_ZOOM) - zoom}`}>
                <LayoutGrid 
                  size={12} 
                  className="slider-h-icon" 
                  style={{ cursor: 'pointer' }}
                  onClick={() => setZoom(4)}
                />
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  value={ (MAX_ZOOM + MIN_ZOOM) - zoom }
                  onChange={(e) => setZoom((MAX_ZOOM + MIN_ZOOM) - parseInt(e.target.value))}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-range density-range"
                  style={{
                    background: `linear-gradient(to right, var(--accent, #00ff88) 0%, var(--accent, #00ff88) ${((( (MAX_ZOOM + MIN_ZOOM) - zoom ) - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%, rgba(255, 255, 255, 0.12) ${((( (MAX_ZOOM + MIN_ZOOM) - zoom ) - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%, rgba(255, 255, 255, 0.12) 100%)`
                  }}
                />
              </div>
              <button
                onClick={() => setImmersive(!immersive)}
                className={`hdr-btn ${immersive ? 'active-accent' : ''}`}
                data-tooltip="Toggle UI"
              >
                {immersive ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>


            {/* SYSTEM TOOLS */}
            <div className="ctrl-group system-group">
              <button onClick={async () => { if (await showConfirm('Purge Set? This will clear all cards.', { title: 'Purge Set', kind: 'error' })) setVideos([]); }} className="hdr-btn" data-tooltip="Purge Set"><Trash2 size={14} /></button>
              <button 
                onClick={() => {
                  const nextState = !alwaysOnTop;
                  setAlwaysOnTop(nextState);
                  invoke('set_always_on_top', { flag: nextState });
                }} 
                className={`hdr-btn ${alwaysOnTop ? 'active-accent' : ''}`} 
                data-tooltip="Always on Top"
              >
                <Monitor size={14} />
              </button>
              <button 
                onClick={onOpenWifiShare} 
                className="hdr-btn" 
                data-tooltip="Wi-Fi Sharing Protocol"
              >
                <Wifi size={14} style={{ color: 'var(--accent, #00ff88)' }} />
              </button>
              {/* THEME SELECTOR ENGINE */}
              <div className="theme-select-container" onMouseDown={(e) => e.stopPropagation()}>
                <button
                  className="hdr-btn theme-trigger-btn"
                >
                  <Palette size={14} />
                  <span className="theme-text-lbl">
                    {theme === 'symphony' ? 'AURORA' : theme === 'midnight' ? 'VELVET' : theme === 'nordic' ? 'FROST' : 'AURORA'}
                  </span>
                  <ChevronDown size={10} className="theme-arrow-icon" />
                </button>
                <div className="theme-glass-dropdown">
                  <div 
                    className={`theme-dropdown-item ${theme === 'symphony' || (!['symphony', 'midnight', 'nordic'].includes(theme)) ? 'active' : ''}`}
                    onClick={() => {
                      setTheme('symphony');
                      addLog('THEME SHIFT: COSMO AURORA');
                    }}
                  >
                    <span className="theme-preview-dot aurora-dot" />
                    <span className="theme-dropdown-lbl">Cosmo Aurora</span>
                  </div>
                  <div 
                    className={`theme-dropdown-item ${theme === 'midnight' ? 'active' : ''}`}
                    onClick={() => {
                      setTheme('midnight');
                      addLog('THEME SHIFT: NEBULA VELVET');
                    }}
                  >
                    <span className="theme-preview-dot velvet-dot" />
                    <span className="theme-dropdown-lbl">Nebula Velvet</span>
                  </div>
                  <div 
                    className={`theme-dropdown-item ${theme === 'nordic' ? 'active' : ''}`}
                    onClick={() => {
                      setTheme('nordic');
                      addLog('THEME SHIFT: NORDIC FROST');
                    }}
                  >
                    <span className="theme-preview-dot frost-dot" />
                    <span className="theme-dropdown-lbl">Nordic Frost</span>
                  </div>
                </div>
              </div>

              <div 
                onClick={onForceSetup}
                className={`ai-status-badge ${
                  aiHardwareStatus.includes('GPU') 
                    ? 'status-gpu' 
                    : aiHardwareStatus === 'Detecting...' 
                    ? 'status-detecting' 
                    : 'status-cpu'
                }`}
                style={{ cursor: 'pointer' }}
                data-tooltip={
                  aiHardwareStatus.includes('GPU')
                    ? "Nvidia RTX CUDA GPU Upscaler and GFPGAN Face Restore are active & ready. Click to re-run setup."
                    : aiHardwareStatus === 'Detecting...'
                    ? "Detecting AI processing hardware status..."
                    : "Running with Bilateral Filter CPU fallback. Click here to download GPU Acceleration Pack."
                }
              >
                {aiHardwareStatus.includes('GPU') ? (
                  <Sparkles size={11} className="ai-status-icon pulse-gold" />
                ) : (
                  <Cpu size={11} className={`ai-status-icon ${aiHardwareStatus === 'Detecting...' ? 'spin-slow' : ''}`} />
                )}
                <span className="ai-status-lbl">
                  {aiHardwareStatus.includes('GPU') 
                    ? 'AI: GPU' 
                    : aiHardwareStatus === 'Detecting...' 
                    ? 'AI: Checking...' 
                    : 'AI: CPU'}
                </span>
              </div>

              {/* VERSION & DEV BADGES */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', pointerEvents: 'auto' }}>
                <a
                  href="https://cosmowhisper.com"
                  data-no-drag
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      await invoke('open_external_url', { url: 'https://cosmowhisper.com' });
                    } catch (err) {
                      try {
                        window.open('https://cosmowhisper.com', '_blank');
                      } catch (e2) {}
                    }
                  }}
                  style={{
                    color: 'var(--accent, #00ff88)',
                    fontSize: '10px',
                    textDecoration: 'underline',
                    marginRight: '8px',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Discover Cosmo Whisper"
                >
                  🚀 Cosmo Whisper
                </a>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  height: '28px',
                  padding: '0 8px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  letterSpacing: '0.5px',
                  userSelect: 'none',
                  marginLeft: '4px'
                }}>
                  v1.2.1
                </div>
                <div style={{
                  height: '18px',
                  padding: '0 6px',
                  background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                  boxShadow: '0 0 8px rgba(168, 85, 247, 0.4)',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '8px',
                  fontWeight: 900,
                  letterSpacing: '1px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  userSelect: 'none',
                  textTransform: 'uppercase'
                }} title="Cosmo Symphony Developer Build">
                  DEV
                </div>
              </div>
 
              {/* SLIDESHOW TIMER WIDGET */}
              <div 
                className="slideshow-interval-badge"
                data-tooltip={`${isSlideshowActive ? "Pause Slideshow" : "Play All Fullscreen (Slideshow)"} - Interval: ${slideshowInterval}s (Scroll wheel to adjust)`}
                onClick={() => setIsSlideshowActive(!isSlideshowActive)}
                onWheel={(e) => {
                  e.stopPropagation();
                  const direction = e.deltaY < 0 ? 1 : -1;
                  setSlideshowInterval((prev) => {
                    const next = prev + direction;
                    return Math.max(2, Math.min(30, next));
                  });
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isSlideshowActive ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))' : 'rgba(255, 255, 255, 0.05)',
                  border: isSlideshowActive ? '1px solid rgba(0, 255, 136, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  height: '28px',
                  padding: '0 8px',
                  color: isSlideshowActive ? 'var(--accent, #00ff88)' : 'var(--text, #fff)',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.2s',
                  marginLeft: '4px',
                  marginRight: '4px',
                  pointerEvents: 'auto',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isSlideshowActive 
                    ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))'
                    : 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 136, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSlideshowActive
                    ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))'
                    : 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = isSlideshowActive ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {isSlideshowActive ? <Pause size={11} /> : <Play size={11} />}
                <RefreshCw size={11} className={isSlideshowActive ? "spin-slow" : ""} style={{ color: isSlideshowActive ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.7)' }} />
                <span>{slideshowInterval}s</span>
              </div>

              {/* SLIDESHOW PAN & ZOOM TOGGLE */}
              <div
                className="slideshow-panzoom-badge"
                data-tooltip={enableSlideshowPanZoom ? "Slideshow Pan & Zoom: ON" : "Slideshow Pan & Zoom: OFF"}
                onClick={() => setEnableSlideshowPanZoom(!enableSlideshowPanZoom)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: enableSlideshowPanZoom ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))' : 'rgba(255, 255, 255, 0.05)',
                  border: enableSlideshowPanZoom ? '1px solid rgba(0, 255, 136, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  height: '28px',
                  padding: '0 8px',
                  color: enableSlideshowPanZoom ? 'var(--accent, #00ff88)' : 'var(--text, #fff)',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.2s',
                  marginRight: '4px',
                  pointerEvents: 'auto',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = enableSlideshowPanZoom 
                    ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))'
                    : 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 136, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = enableSlideshowPanZoom
                    ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))'
                    : 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = enableSlideshowPanZoom ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <Maximize size={11} />
                <span>Zoom</span>
              </div>
            </div>
            
            </div>
          </div>
        </header>

      {showSettings && (
        <SettingsModal
          confirmDeletion={confirmDeletion}
          setConfirmDeletion={setConfirmDeletion}
          snapshotDir={snapshotDir}
          setSnapshotDir={setSnapshotDir}
          onClose={() => setShowSettings(false)}
          onShowLogs={() => {
            setShowSettings(false);
            setShowLogs(true);
          }}
          onForceSetup={onForceSetup}
        />
      )}

      {showCollections && (
        <CollectionsModal
          videos={videos}
          setVideos={setVideos}
          collections={collections}
          setCollections={setCollections}
          addLog={addLog}
          onClose={() => setShowCollections(false)}
        />
      )}

      {showLogs && (
        <div className="logs-overlay" onClick={() => setShowLogs(false)}>
          <div className="logs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="logs-header">
              <h2>COSMO SYMPHONY LOGS</h2>
              <button onClick={() => setShowLogs(false)} className="premium-close-btn">
                <X size={18} />
              </button>
            </div>
            <div className="logs-body">
              {logs.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No logs yet.</p>}
              {logs.map((log, i) => (
                <div key={i} className="log-entry">
                  <span className="log-time">{log.t}</span>
                  <span className="log-msg">{log.m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {showBatchRename && (
        <BatchRenameModal
          videos={videos}
          setVideos={setVideos}
          addLog={addLog}
          onClose={() => setShowBatchRename(false)}
        />
      )}
    </>
  );
}

