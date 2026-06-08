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
  showSymphonyWorkshop: boolean;
  setShowSymphonyWorkshop: (val: boolean) => void;
  toggleMasterMute: (soloId?: string) => void;
  globalControl: string | null;
  rotating: boolean;
  setRotating: (val: boolean) => void;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (val: boolean) => void;
  slideshowInterval: number;
  setSlideshowInterval: React.Dispatch<React.SetStateAction<number>>;
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
  isSlideshowActive,
  setIsSlideshowActive,
  slideshowInterval,
  setSlideshowInterval,
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
    aiHardwareStatus
  } = useStore();
  const [showBatchRename, setShowBatchRename] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isSpanned, setIsSpanned] = useState(false);
  const [showMaxMenu, setShowMaxMenu] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

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


  return (
    <>
        <header 
          className="app-header"
          data-tauri-drag-region
        >
          <div className="header-row brand-row" data-tauri-drag-region>
            <div className="header-left" data-tauri-drag-region>
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
                    style={{
                      background: `linear-gradient(to right, var(--accent, #00ff88) 0%, var(--accent, #00ff88) ${(masterMuted ? 0 : globalVolume) * 100}%, rgba(255, 255, 255, 0.12) ${(masterMuted ? 0 : globalVolume) * 100}%, rgba(255, 255, 255, 0.12) 100%)`
                    }}
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

              {/* VERSION BADGE */}
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
                v4.0.0
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
