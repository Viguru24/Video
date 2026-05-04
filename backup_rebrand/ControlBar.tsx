import { useState, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion } from 'framer-motion';
import type { VideoItem, RepeatMode } from '../types';
import { ContextMenu } from './ContextMenu';
import { HelpModal } from './HelpModal';
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
  Gauge,
  FastForward,
  HelpCircle,
  Palette,
  Share2,
  Save,
  MousePointer2,
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
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  speed: number;
  setSpeed: React.Dispatch<React.SetStateAction<number>>;
  theme: string;
  setTheme: (t: string) => void;
  alwaysOnTop: boolean;
  setAlwaysOnTop: React.Dispatch<React.SetStateAction<boolean>>;
  masterPlaying: boolean;
  setMasterPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  masterMuted: boolean;
  setMasterMuted: React.Dispatch<React.SetStateAction<boolean>>;
  globalVolume: number;
  setGlobalVolume: React.Dispatch<React.SetStateAction<number>>;
  globalRepeat: RepeatMode;
  setGlobalRepeat: React.Dispatch<React.SetStateAction<RepeatMode>>;
  immersive: boolean;
  setImmersive: React.Dispatch<React.SetStateAction<boolean>>;
  rotating: boolean;
  setRotating: React.Dispatch<React.SetStateAction<boolean>>;
  sessionDuration: number;
  setSessionDuration: React.Dispatch<React.SetStateAction<number>>;
  fitMode: 'cover' | 'contain';
  setFitMode: React.Dispatch<React.SetStateAction<'cover' | 'contain'>>;
  masterShowUI: boolean;
  setMasterShowUI: React.Dispatch<React.SetStateAction<boolean>>;
  addLog: (msg: string) => void;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  onRemoveVideo: (id: string) => void;
  onToggleFocus: (id: string | null) => void;
  onLog: (msg: string) => void;
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
  setMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; id: string } | null>>;
  menu: { x: number; y: number; id: string } | null;
  setGlobalControl: React.Dispatch<React.SetStateAction<string | null>>;
  isFS: boolean;

  setIsFS: React.Dispatch<React.SetStateAction<boolean>>;
  isPopout: boolean;
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  showShare: boolean;
  setShowShare: React.Dispatch<React.SetStateAction<boolean>>;
  showSymphonyWorkshop: boolean;
  setShowSymphonyWorkshop: (val: boolean) => void;
  toggleMasterMute: () => void;
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
  zoom,
  setZoom,
  speed,
  setSpeed,
  alwaysOnTop,
  setAlwaysOnTop,
  masterPlaying,
  setMasterPlaying,
  masterMuted,
  setMasterMuted,
  globalVolume,
  setGlobalVolume,
  globalRepeat,
  setGlobalRepeat,
  immersive,
  setImmersive,
  rotating,
  setRotating,
  sessionDuration,
  setSessionDuration,
  fitMode,
  setFitMode,
  masterShowUI,
  setMasterShowUI,
  addLog,
  onUpdateVideo,
  onRemoveVideo,
  onToggleFocus,
  onLog,
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
  setMenu,
  menu,
  setGlobalControl,
  isFS,

  setIsFS,
  isPopout,
  showHelp,
  setShowHelp,
  showShare,
  setShowShare,
  showSymphonyWorkshop,
  setShowSymphonyWorkshop,
  theme,
  setTheme,
  toggleMasterMute,
}: ControlBarProps) {
  const [collectionName, setCollectionName] = useState('');

  const toggleMasterPlay = useCallback(() => {
    const newState = !masterPlaying;
    setMasterPlaying(newState);
    setVideos((p) => p.map((v) => ({ ...v, playing: newState })));
  }, [masterPlaying, setMasterPlaying, setVideos]);

  const saveCollection = () => {
    if (!collectionName.trim()) return;
    setCollections(p => ({ ...p, [collectionName]: videos }));
    setCollectionName('');
    addLog(`Saved Set: ${collectionName}`);
  };

  const loadCollection = (col: VideoItem[]) => {
    setVideos(col);
    addLog('Loaded workspace set.');
  };

  const deleteCollection = (name: string) => {
    setCollections(p => {
      const n = { ...p };
      delete n[name];
      return n;
    });
  };

  return (
    <>
        <header className="app-header">
          <div 
            className="header-drag-handle" 
            onMouseDown={(e) => {
              if (e.button === 0) getCurrentWindow().startDragging();
            }}
          />
          <div className="header-row brand-row">
            <div className="header-left">
              <img src="/logo.png" className="app-logo-img" alt="Logo" />
              <div className="logo-text">
                <h1 className="brand-main">COSMO <span className="brand-sub">WHISPER</span></h1>
              </div>
              
              <div className="search-container">
                <Search size={14} className="search-icon-mini" />
                <input
                  type="text"
                  placeholder="Search units..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                  className="hdr-search-input"
                />
              </div>
            </div>
            
            <div className="window-controls" style={{ display: 'flex', gap: '8px', marginLeft: 'auto', paddingRight: '4px', zIndex: 1001, pointerEvents: 'auto' }}>
              <button className="win-dot min" onClick={() => getCurrentWindow().minimize()} title="Minimize" />
              <button className="win-dot max" onClick={() => getCurrentWindow().toggleMaximize()} title="Maximize" />
              <button className="win-dot close" onClick={() => getCurrentWindow().close()} title="Close" />
            </div>
          </div>
          
          <div className="header-row controls-row">
            <div className="header-menu-container">
            {/* INGESTION & AUTO */}
            <div className="ctrl-group ingestion-group">
               <button
                onClick={async () => {
                  const path = await invoke<string | null>('select_folder_cmd');
                  if (path) {
                    const folderVids = await invoke<{ name: string; url: string }[]>('get_folder_videos', { path });
                    if (folderVids && folderVids.length > 0) {
                      const toAssetUrl = (filePath: string) => convertFileSrc(filePath);
                      const folderWithUrls = folderVids.map((v) => ({ ...v, url: toAssetUrl(v.url) }));
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
                }}
                className="hdr-btn"
                data-tooltip="Add Folder"
              >
                <Plus size={14} />
              </button>
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
            </div>

            {/* SYMPHONY WORKSHOP */}
            <div className="ctrl-group symphony-group">
              <button onClick={() => setShowShare(true)} className={`hdr-btn promo-btn ${showShare ? 'active-accent' : ''}`} data-tooltip="Share Experience">
                <Share2 size={14} />
              </button>
              <button onClick={() => setShowCollections(!showCollections)} className={`hdr-btn ${showCollections ? 'active-accent' : ''}`} data-tooltip="Sets">
                <Bookmark size={14} />
              </button>
            </div>

            {/* PLAYBACK ENGINE */}
            <div className="ctrl-group playback-group">
              {/* VERTICAL SPEED */}
              <div className="slider-v-box" data-tooltip={`Speed: ${speed}x`}>
                <input
                  type="range"
                  min="0.25"
                  max="4"
                  step="0.25"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="v-range"
                />
                <Gauge size={10} />
              </div>
              
              {/* VERTICAL VOLUME */}
              <div className="slider-v-box" data-tooltip={`Vol: ${Math.round(globalVolume*100)}%`}>
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
                  className="v-range"
                />
                <Volume2 size={10} />
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
              {/* VERTICAL DENSITY */}
              <div className="slider-v-box" data-tooltip="Density">
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  value={ (MAX_ZOOM + MIN_ZOOM) - zoom }
                  onChange={(e) => setZoom((MAX_ZOOM + MIN_ZOOM) - parseInt(e.target.value))}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="v-range"
                />
                <LayoutGrid size={10} />
              </div>
              <button onClick={() => setZoom(4)} className="hdr-btn" data-tooltip="Reset Zoom"><RotateCcw size={14} /></button>
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
              <button onClick={() => { if (confirm('Purge?')) setVideos([]); }} className="hdr-btn" data-tooltip="Purge"><Trash2 size={14} /></button>
              <button onClick={() => window.location.reload()} className="hdr-btn" data-tooltip="Reload"><RefreshCw size={14} /></button>
              <button 
                onClick={() => {
                  setAlwaysOnTop(!alwaysOnTop);
                  invoke('set_always_on_top', { flag: !alwaysOnTop });
                }} 
                className={`hdr-btn ${alwaysOnTop ? 'active-accent' : ''}`} 
                data-tooltip="Top"
              >
                <Monitor size={14} />
              </button>
              <button
                onClick={() => {
                  const themes = ['symphony', 'midnight', 'nordic', 'solarized', 'cyberpunk'];
                  setTheme(themes[(themes.indexOf(theme) + 1) % themes.length]);
                }}
                className="hdr-btn"
                data-tooltip={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`}
              >
                <Palette size={14} />
              </button>
              <button onClick={() => setShowLogs(!showLogs)} className={`hdr-btn ${showLogs ? 'active-accent' : ''}`} data-tooltip="Logs"><Layers size={14} /></button>
              <div className="merged-system-btns">
                <button onClick={() => setShowHelp(true)} className={`hdr-btn ${showHelp ? 'active-accent' : ''}`} data-tooltip="Guide"><HelpCircle size={14} /></button>
                <button onClick={() => setShowSettings(!showSettings)} className={`hdr-btn ${showSettings ? 'active-accent' : ''}`} data-tooltip="Settings"><Settings size={14} /></button>
              </div>
            </div>

            </div>
          </div>
        </header>

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>System Configuration</h2>
              <button onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-body">
              <div className="settings-section">
                <h3>Global Configuration</h3>
                <div className="setting-item">
                  <label>Snapshot Destination</label>
                  <div className="path-picker">
                    <input type="text" readOnly value={snapshotDir || 'Default'} />
                    <button
                      onClick={async () => {
                        const res = await invoke<string | null>('select_folder_cmd');
                        if (res) setSnapshotDir(res);
                      }}
                      className="browse-btn"
                    >
                      Browse
                    </button>
                  </div>
                </div>
                <div className="setting-item">
                  <label>Display Mode</label>
                  <div className="mode-toggle">
                    <button className={fitMode === 'cover' ? 'active' : ''} onClick={() => setFitMode('cover')}>
                      WALL
                    </button>
                    <button className={fitMode === 'contain' ? 'active' : ''} onClick={() => setFitMode('contain')}>
                      NATIVE
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3>Workspace Shortcuts</h3>
                <div className="shortcut-list">
                  <div className="shortcut-item">
                    <kbd>SPACE</kbd>
                    <span>COSMO SYMPHONY — v3.2.1 (BETA-ACTIVE)</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>S</kbd>
                    <span>Snapshot (Focused Unit Only)</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>ESC</kbd>
                    <span>Exit Focus / Solo Mode</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>DOUBLE CLICK</kbd>
                    <span>Enter Deep Focus Mode</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCollections && (
        <div className="modal-overlay" onClick={() => setShowCollections(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '400px' }}>
            <div className="modal-header">
              <h2>Workspace Collections</h2>
              <button onClick={() => setShowCollections(false)} className="close-logs">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="collection-save">
                <input
                  placeholder="Set Name..."
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                />
                <button onClick={saveCollection} className="save-btn">
                  <Save size={14} /> SAVE
                </button>
              </div>
              <div className="collection-list">
                {Object.entries(collections).length === 0 && <p className="empty-msg" style={{ textAlign: 'center', opacity: 0.5, fontSize: '12px', padding: '20px' }}>No sets saved yet.</p>}
                {Object.entries(collections).map(([name, vids]) => (
                  <div key={name} className="collection-item">
                    <div className="coll-info">
                      <span className="coll-name">{name}</span>
                      <span className="coll-meta">{vids.length} units</span>
                    </div>
                    <div className="coll-actions">
                      <button onClick={() => loadCollection(vids)} className="coll-btn load" title="Load Set">
                        <Play size={12} fill="currentColor" />
                      </button>
                      <button onClick={() => deleteCollection(name)} className="coll-btn del" title="Delete Set">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="logs-overlay" onClick={() => setShowLogs(false)}>
          <div className="logs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="logs-header">
              <h2>COSMO SYMPHONY LOGS</h2>
              <button onClick={() => setShowLogs(false)} className="close-logs">
                <X size={20} />
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

      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>COSMO SYMPHONY GUIDE</h2>
              <button onClick={() => setShowHelp(false)} className="close-logs">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
               <div className="settings-section">
                <h3>Workspace Interaction</h3>
                <div className="interaction-list">
                   <div className="interaction-item">
                    <div className="i-icon"><MousePointer2 size={16}/></div>
                    <div className="i-content">
                      <strong>Drag & Drop</strong>
                      <span>Drop video files or folders anywhere to ingest.</span>
                    </div>
                  </div>
                   <div className="interaction-item">
                    <div className="i-icon"><Maximize2 size={16}/></div>
                    <div className="i-content">
                      <strong>Deep Focus</strong>
                      <span>Double click any unit to solo. ESC to return to wall.</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="settings-section" style={{ marginTop: '20px' }}>
                <h3>Autonomous Production</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  The <strong>Workshop</strong> button opens the generative creation pipeline. Describe the video you want, 
                  and the system will orchestrate local assets and AI generation to produce it.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          playing={videos.find((x) => x.id === menu.id)?.playing}
          muted={videos.find((x) => x.id === menu.id)?.muted}
          onAction={(a) => {
            const v = videos.find((x) => x.id === menu.id);
            if (!v) return;
            if (a === 'remove') onRemoveVideo(menu.id);
            if (a === 'folder') invoke('open_folder', { path: v.realPath || v.url });
            if (a === 'popout') invoke('pop_out', { url: v.url, title: v.title });
            if (a === 'focus') onToggleFocus(v.id === focusedId ? null : v.id);
             if (a === 'snapshot') {
               setGlobalControl(`snapshot-${v.id}-${Date.now()}`);
             }
             if (a === 'play') onUpdateVideo(v.id, { playing: !v.playing });
             if (a === 'stop') {
               onUpdateVideo(v.id, { playing: false });
               setGlobalControl(`stop-${v.id}-${Date.now()}`);
             }
            if (a === 'mute') onUpdateVideo(v.id, { muted: !v.muted });
          }}
        />
      )}
    </>
  );
}
