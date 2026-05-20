import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toCosmoUrl, isTauri } from '../utils/videoUtils';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion } from 'framer-motion';
import type { VideoItem, RepeatMode } from '../types';
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
  Sparkles
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
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
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
  showSymphonyWorkshop: boolean;
  setShowSymphonyWorkshop: (val: boolean) => void;
  toggleMasterMute: (soloId?: string) => void;
  globalControl: string | null;
  rotating: boolean;
  setRotating: (val: boolean) => void;
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
  showSymphonyWorkshop,
  setShowSymphonyWorkshop,
  toggleMasterMute,
  globalControl,
  rotating,
  setRotating,
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
    selectionMode, setSelectionMode,
    renameHistory,
    aiHardwareStatus
  } = useStore();
  const [showBatchRename, setShowBatchRename] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files).filter(file => {
      const type = file.type;
      const isVideo = type.startsWith('video/');
      const isImg = type.startsWith('image/');
      if (mediaMode === 'video') return isVideo;
      if (mediaMode === 'image') return isImg;
      return isVideo || isImg;
    });

    if (fileList.length === 0) {
      addLog("No matching media files found in selected folder.");
      return;
    }

    const folderWithUrls = fileList.map((file) => {
      const objectUrl = URL.createObjectURL(file);
      return {
        name: file.name,
        url: objectUrl,
        path: objectUrl,
      };
    });

    const folderName = fileList[0].webkitRelativePath
      ? fileList[0].webkitRelativePath.split('/')[0]
      : "Uploaded Folder";

    setVideos((p) => [
      ...p,
      {
        id: crypto.randomUUID(),
        url: folderWithUrls[0].url,
        realPath: folderWithUrls[0].url,
        title: folderName,
        repeatMode: 'folder',
        repeatCount: 0,
        cols: 1,
        folderFiles: folderWithUrls,
        currentIdx: 0,
        playing: masterPlaying,
        muted: masterMuted,
      },
    ]);
    addLog(`Uploaded Folder: ${folderName} (${folderWithUrls.length} items)`);
    e.target.value = '';
  };

  const handleFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    
    fileList.forEach(file => {
      const objectUrl = URL.createObjectURL(file);
      setVideos((p) => [
        ...p,
        {
          id: crypto.randomUUID(),
          url: objectUrl,
          realPath: objectUrl,
          title: file.name,
          repeatMode: 'none',
          repeatCount: 0,
          cols: 1,
          playing: masterPlaying,
          muted: masterMuted,
        },
      ]);
      addLog(`Added file: ${file.name}`);
    });
    e.target.value = '';
  };

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


  return (
    <>
        <header 
          className="app-header"
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            const isInteractive = target.closest('button, input, select, [role="button"], .mini-btn, .win-dot');
            if (e.button === 0 && !isInteractive) {
              getCurrentWindow().startDragging();
            }
          }}
        >
          <div className="header-row brand-row">
            <div className="header-left">
              <img src="/logo.png" className="app-logo-img" alt="Logo" />
              <div className="logo-text">
                <h1 className="brand-main">COSMO <span className="brand-sub">SYMPHONY <span className="version-tag">v3.4.0</span></span></h1>
              </div>
              
              <div className="search-box">
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

              <div className="mode-switch-group">
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

              {/* "Open Screenshots Folder" button removed as per user request — it was confusing because it didn't open the currently active image folder */}
            </div>
            
            {isTauri() && (
              <div 
                className="window-controls" 
                style={{ display: 'flex', gap: '8px', marginLeft: 'auto', paddingRight: '4px', zIndex: 1001, pointerEvents: 'auto' }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
              >
                <button className="win-dot min" onClick={() => getCurrentWindow().minimize()} title="Minimize" />
                <button className="win-dot max" onClick={() => getCurrentWindow().toggleMaximize()} title="Maximize" />
                <button className="win-dot close" onClick={() => getCurrentWindow().close()} title="Close" />
              </div>
            )}
          </div>
          
          <div className="header-row controls-row">
            <div className="header-menu-container">
            {/* INGESTION & AUTO */}
            <div className="ctrl-group ingestion-group">
               <input
                 type="file"
                 ref={folderInputRef}
                 style={{ display: 'none' }}
                 {...{
                   webkitdirectory: "",
                   directory: ""
                 } as any}
                 multiple
                 onChange={handleFolderUpload}
               />
               <input
                 type="file"
                 ref={fileInputRef}
                 style={{ display: 'none' }}
                 multiple
                 accept={mediaMode === 'video' ? 'video/*' : mediaMode === 'image' ? 'image/*' : 'video/*,image/*'}
                 onChange={handleFilesUpload}
               />
               <button
                onClick={async () => {
                  if (isTauri()) {
                    const path = await invoke<string | null>('select_folder_cmd');
                    if (path) {
                      const folderVids = await invoke<{ name: string; url: string }[]>('get_folder_videos', { path, mode: mediaMode });
                      if (folderVids && folderVids.length > 0) {
                        const toAssetUrl = (filePath: string) => toCosmoUrl(filePath);
                        const folderWithUrls = folderVids.map((v) => ({ 
                          ...v, 
                          url: toCosmoUrl(v.url),
                          path: v.url // Store raw path for physical operations
                        }));
                        setVideos((p) => [
                          ...p,
                          {
                            id: crypto.randomUUID(),
                            url: toAssetUrl(folderVids[0].url),
                            realPath: folderVids[0].url,
                            title: folderVids[0].name,
                            repeatMode: 'folder',
                            repeatCount: 0,
                            cols: 1,
                            folderFiles: folderWithUrls,
                            currentIdx: 0,
                            playing: masterPlaying,
                            muted: masterMuted,
                          },
                        ]);
                        addLog(`Added folder: ${path}`);
                      }
                    }
                  } else {
                    folderInputRef.current?.click();
                  }
                }}
                className="hdr-btn"
                data-tooltip={isTauri() ? "Add Folder" : "Upload Folder"}
              >
                <Plus size={14} />
              </button>
              {!isTauri() && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="hdr-btn"
                  data-tooltip="Upload Files"
                >
                  <FilePlus size={14} />
                </button>
              )}
              <div className="cycle-group" style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => setRotating(!rotating)}
                  className={`hdr-btn ${rotating ? 'active-accent' : ''}`}
                  data-tooltip="Auto-Cycle"
                >
                  <ListRestart size={14} />
                </button>
                <select
                  value={rotationInterval}
                  onChange={(e) => setRotationInterval(parseInt(e.target.value))}
                  className="interval-select"
                  onMouseDown={e => e.stopPropagation()}
                >
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                </select>
              </div>
              <button
                onClick={() => {
                  setSelectionMode(!selectionMode);
                  if (!selectionMode) setSelectedIds(new Set());
                }}
                className={`hdr-btn select-mode-btn ${selectionMode ? 'active-accent' : ''}`}
                data-tooltip={selectionMode ? "Exit Selection" : "Multi-Select"}
              >
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <MousePointer2 size={14} />
                </div>
              </button>
            </div>

            {selectedIds.size > 0 && (
              <div className="ctrl-group selection-group" style={{ 
                background: 'rgba(0, 0, 0, 0.85)', 
                border: '1px solid var(--accent)',
                boxShadow: '0 0 20px rgba(var(--accent-rgb), 0.2)',
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '8px',
                height: '34px',
                backdropFilter: 'blur(10px)'
              }}>
                <span style={{ fontSize: '10px', fontWeight: 900, padding: '0 8px', color: 'var(--accent)', letterSpacing: '0.1em' }}>
                  {selectedIds.size} UNITS CAPTURED
                </span>
                <div className="mini-divider" style={{ background: 'rgba(255,255,255,0.1)', height: '20px' }} />
                <button onClick={() => onBatchPlay(true)} className="hdr-btn" data-tooltip="Batch Sync: Play"><Play size={16} color="var(--accent)" /></button>
                <button onClick={() => onBatchPlay(false)} className="hdr-btn" data-tooltip="Batch Sync: Stop"><Square size={16} color="var(--accent)" /></button>
                <button onClick={() => onBatchMute(false)} className="hdr-btn" data-tooltip="Batch Sync: Unmute"><Volume2 size={16} color="var(--accent)" /></button>
                <button onClick={() => onBatchMute(true)} className="hdr-btn" data-tooltip="Batch Sync: Mute"><VolumeX size={16} color="var(--accent)" /></button>
                <div className="mini-divider" style={{ background: 'rgba(255,255,255,0.1)', height: '20px' }} />
                <button 
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to remove the ${selectedIds.size} selected items from the grid?`)) {
                      onBatchRemove();
                    }
                  }} 
                  className="hdr-btn danger" 
                  data-tooltip="Remove Selection from Grid"
                >
                  <Trash2 size={16} color="#ff4444" />
                </button>
              </div>
            )}

            {/* SYMPHONY WORKSHOP */}
            <div className="ctrl-group symphony-group">
              <button onClick={() => setShowCollections(!showCollections)} className={`hdr-btn ${showCollections ? 'active-accent' : ''}`} data-tooltip="Sets">
                <Bookmark size={14} />
              </button>
              <button onClick={() => setShowBatchRename(!showBatchRename)} className={`hdr-btn ${showBatchRename ? 'active-accent' : ''}`} data-tooltip="Batch Rename">
                <Type size={14} />
              </button>
            </div>

            {/* PLAYBACK ENGINE */}
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
                />
              </div>
              
              {/* HORIZONTAL VOLUME */}
              <div className="slider-h-box" data-tooltip={`Vol: ${Math.round(globalVolume*100)}%`}>
                <Volume2 
                  size={12} 
                  className="slider-h-icon" 
                  style={{ cursor: 'pointer' }}
                  onClick={toggleMasterMute}
                />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={globalVolume}
                  onChange={(e) => {
                    setGlobalVolume(parseFloat(e.target.value));
                    if (parseFloat(e.target.value) > 0 && masterMuted) toggleMasterMute();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-range volume-range"
                />
              </div>

              <button
                onClick={() => {
                  const modes: RepeatMode[] = ['none', 'always', 'folder'];
                  setGlobalRepeat(modes[(modes.indexOf(globalRepeat) + 1) % modes.length]);
                }}
                className={`hdr-btn ${globalRepeat !== 'none' ? 'active-accent' : ''}`}
                data-tooltip={`Repeat: ${globalRepeat.toUpperCase()}`}
              >
                {globalRepeat === 'always' ? <Repeat1 size={14} /> : <Repeat size={14} />}
              </button>
              <button onClick={toggleMasterPlay} className={`hdr-btn main-play ${masterPlaying ? 'active-accent' : ''}`} data-tooltip="Play/Pause">
                {masterPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              </button>
              <button onClick={toggleMasterMute} className={`hdr-btn ${masterMuted ? 'active-accent' : ''}`} data-tooltip="Mute">
                {masterMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>

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
              <button onClick={() => { if (confirm('Purge Set?')) setVideos([]); }} className="hdr-btn" data-tooltip="Purge Set"><Trash2 size={14} /></button>
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

              {/* AI STATUS BADGE */}
              <div 
                className={`ai-status-badge ${
                  aiHardwareStatus.includes('GPU') 
                    ? 'status-gpu' 
                    : aiHardwareStatus === 'Detecting...' 
                    ? 'status-detecting' 
                    : 'status-cpu'
                }`}
                data-tooltip={
                  aiHardwareStatus.includes('GPU')
                    ? "Nvidia RTX CUDA GPU Upscaler and GFPGAN Face Restore are active & ready."
                    : aiHardwareStatus === 'Detecting...'
                    ? "Detecting AI processing hardware status..."
                    : "Running with Bilateral Filter CPU fallback. Install Nvidia PyTorch/CUDA for 4x Real-ESRGAN/GFPGAN AI Upscale."
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

              <button onClick={() => setShowSettings(!showSettings)} className={`hdr-btn ${showSettings ? 'active-accent' : ''}`} data-tooltip="Settings & Guide"><Settings size={14} /></button>
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
        <div className="logs-overlay">
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
