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
  isFS: boolean;
  setIsFS: React.Dispatch<React.SetStateAction<boolean>>;
  isPopout: boolean;
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  showPromo: boolean;
  setShowPromo: React.Dispatch<React.SetStateAction<boolean>>;
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
  isFS,
  setIsFS,
  isPopout,
  showHelp,
  setShowHelp,
  showPromo,
  setShowPromo,
  theme,
  setTheme,
}: ControlBarProps) {
  const toggleMasterPlay = useCallback(() => {
    const newState = !masterPlaying;
    setMasterPlaying(newState);
    setVideos((p) => p.map((v) => ({ ...v, playing: newState })));
  }, [masterPlaying, setMasterPlaying, setVideos]);

  const toggleMasterMute = useCallback(() => {
    const newState = !masterMuted;
    setMasterMuted(newState);
    setVideos((p) => p.map((v) => ({ ...v, muted: newState })));
    addLog(`System Volume: ${newState ? 'OFF' : 'ON'}`);
  }, [masterMuted, setMasterMuted, setVideos, addLog]);

  return (
    <>
      <header className="app-header">
        <div className="header-row-brand" data-tauri-drag-region>
          <div className="header-left">
            <img src="/logo.png" className="app-logo-img" alt="Logo" data-tauri-drag-region />
            <div className="logo-text" data-tauri-drag-region>
              <h1 className="brand-main" data-tauri-drag-region>COSMO <span className="brand-sub" data-tauri-drag-region>SYMPHONY</span></h1>
            </div>
            <div className="search-container">
              <Search size={14} className="search-icon-mini" />
              <input
                type="text"
                placeholder="Search Workspace..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="hdr-search-input"
              />
            </div>
            {videos.length > 0 && <span className="count-badge">{videos.length}</span>}
          </div>
          
          <div data-tauri-drag-region style={{ flex: 1, height: '100%', minHeight: '32px' }} />

          <div className="window-controls">
            <button className="win-dot min" onClick={() => getCurrentWindow().minimize()} data-tooltip="Minimize" />
            <button className="win-dot max" onClick={() => getCurrentWindow().toggleMaximize()} data-tooltip="Maximize" />
            <button className="win-dot close" onClick={() => getCurrentWindow().close()} data-tooltip="Close" />
          </div>


        </div>
        <div className="header-row-controls" data-tauri-drag-region>
          <div className="ctrl-group">
            <div className="slider-box" data-tooltip="Density">
              <LayoutGrid size={12} />
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  value={zoom}
                  onChange={(e) => setZoom(parseInt(e.target.value))}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="zoom-slider"
                />
            </div>
            <button
              onClick={() => {
                setVideos((p) => p.map((v) => ({ ...v, cols: 1 })));
                setZoom(4);
              }}
              className="hdr-btn"
              data-tooltip="Reset"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => setImmersive(!immersive)}
              className={`hdr-btn ${immersive ? 'active-accent' : ''}`}
              data-tooltip="Toggle UI"
            >
              {immersive ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={() => {
                if (confirm('Purge?')) setVideos([]);
              }}
              className="hdr-btn purge-btn"
              data-tooltip="Purge"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div className="ctrl-group">
            <button
              onClick={() => setShowCollections(!showCollections)}
              className={`hdr-btn ${showCollections ? 'active-accent' : ''}`}
              data-tooltip="Sets"
            >
              <Bookmark size={14} />
            </button>
            <button
              onClick={() => setShowLogs(!showLogs)}
              className={`hdr-btn ${showLogs ? 'active-accent' : ''}`}
              data-tooltip="Logs"
            >
              <Layers size={14} />
            </button>
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
            <button onClick={() => window.location.reload()} className="hdr-btn" data-tooltip="Reload">
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="ctrl-group">
            <button
              onClick={async () => {
                const path = await invoke<string | null>('select_folder_cmd');
                if (path) {
                  const folderVids = await invoke<{ name: string; url: string }[]>('get_folder_videos', { path });
                  const toAssetUrl = (filePath: string) => {
                    return convertFileSrc(filePath);
                  };
                  if (folderVids && folderVids.length > 0) {
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
              className="hdr-btn folder-btn"
              data-tooltip="Add Folder"
            >
              <Plus size={14} /> FOLDER
            </button>

            <div className="cycle-group">
              <button
                onClick={() => setRotating(!rotating)}
                className={`hdr-btn cycle-toggle ${rotating ? 'active-accent' : ''}`}
                data-tooltip="Auto-Cycle"
              >
                <ListRestart size={14} />
                <span>{rotating ? 'AUTO' : 'OFF'}</span>
              </button>
              <select
                value={rotationInterval}
                onChange={(e) => setRotationInterval(parseInt(e.target.value))}
                className="interval-select"
              >
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
              </select>
            </div>
          </div>

          <div className="ctrl-group">
            <div className="slider-box" data-tooltip={`Speed: ${speed}x`}>
              <Gauge size={12} />
              <input
                type="range"
                min="0.25"
                max="4"
                step="0.25"
                value={speed}
                 onChange={(e) => {
                   const s = parseFloat(e.target.value);
                   setSpeed(s);
                 }}
                 className="zoom-slider"
              />
            </div>
            <button onClick={toggleMasterPlay} className={`hdr-btn main-play ${masterPlaying ? 'active-accent' : ''}`} data-tooltip="Master Play">
              {masterPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </button>
            <div className="slider-box" data-tooltip="Volume">
              <Volume2 size={12} />
               <input
                 type="range"
                 min="0"
                 max="1"
                 step="0.01"
                 value={globalVolume}
                 onChange={(e) => setGlobalVolume(parseFloat(e.target.value))}
                 onMouseDown={(e) => e.stopPropagation()}
                 className="zoom-slider volume-slider"
               />
            </div>
            <button onClick={toggleMasterMute} className={`hdr-btn ${masterMuted ? 'active-accent' : ''}`} data-tooltip="Mute">
              {masterMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button
              onClick={() => {
                const modes: RepeatMode[] = ['none', 'always', 'folder'];
                const n = modes[(modes.indexOf(globalRepeat) + 1) % modes.length];
                setGlobalRepeat(n);
              }}
              className={`hdr-btn repeat-master-btn ${globalRepeat !== 'none' ? 'active-accent' : ''}`}
              data-tooltip={`Repeat: ${globalRepeat.toUpperCase()}`}
            >
              {globalRepeat === 'always' ? <Repeat1 size={14} /> : <Repeat size={14} />}
              <span className="repeat-label">{globalRepeat === 'none' ? 'OFF' : globalRepeat === 'always' ? 'ONE' : 'FOLDER'}</span>
              </button>
            <button onClick={() => setShowHelp(true)} className={`hdr-btn ${showHelp ? 'active-accent' : ''}`} data-tooltip="Guide">
              <HelpCircle size={14} />
            </button>
            <button
              onClick={() => {
                const themes = ['symphony', 'midnight', 'nordic', 'solarized', 'cyberpunk'];
                const next = themes[(themes.indexOf(theme) + 1) % themes.length];
                setTheme(next);
                addLog(`Theme: ${next.toUpperCase()}`);
              }}
              className="hdr-btn"
              data-tooltip="Switch Theme"
            >
              <Palette size={14} />
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className={`hdr-btn ${showSettings ? 'active-accent' : ''}`} data-tooltip="Settings">
              <Settings size={14} />
            </button>
            <button 
              onClick={() => setShowPromo(true)} 
              className={`hdr-btn promo-btn ${showPromo ? 'active-accent' : ''}`} 
              data-tooltip="Social Promo Studio"
            >
              <Share2 size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
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
                    <span>Master Play / Pause Toggle</span>
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

      {/* Collections Modal */}
      {showCollections && (
        <div className="settings-overlay" onClick={() => setShowCollections(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>Cosmo Sets</h2>
              <button onClick={() => setShowCollections(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-body">
              <div className="collection-save">
                <input
                  type="text"
                  placeholder="New Set Name..."
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                />
                   <button
                   onClick={() => {
                     const validationError = validateCollectionName(newCollectionName);
                     if (validationError) {
                       addLog(`Error: ${validationError}`);
                       return;
                     }
                     setCollections((p) => ({ ...p, [newCollectionName]: videos }));
                     setNewCollectionName('');
                     addLog(`Saved Collection: ${newCollectionName}`);
                   }}
                   className="save-btn"
                 >
                  <Plus size={16} /> SAVE CURRENT
                </button>
              </div>
              <div className="collection-list">
                {Object.entries(collections).map(([name, vids]) => (
                  <div key={name} className="collection-item">
                    <div className="coll-info">
                      <span className="coll-name">{name}</span>
                      <span className="coll-meta">{vids.length} VIDEOS</span>
                    </div>
                    <div className="coll-actions">
                      <button
                        onClick={() => {
                          setVideos(vids);
                          setShowCollections(false);
                          addLog(`Loaded: ${name}`);
                        }}
                        className="coll-btn load"
                      >
                        <Play size={14} /> LOAD
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete Set?'))
                            setCollections((p) => {
                              const n = { ...p };
                              delete n[name];
                              return n;
                            });
                        }}
                        className="coll-btn del"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogs && (
        <div className="logs-overlay" onClick={() => setShowLogs(false)}>
          <motion.div
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            className="logs-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="logs-header">
              <h2>ACTIVITY TELEMETRY</h2>
              <button onClick={() => setShowLogs(false)} className="close-logs">
                <X size={20} />
              </button>
            </div>
            <div className="logs-body">
              {logs.length === 0 ? (
                <div className="no-logs">System ready. Awaiting commands...</div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-time">[{l.t}]</span>
                    <span className="log-msg">{l.m}</span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
       )}

       {/* Help Modal */}
       {showHelp && (
         <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
       )}

       {/* Dropdown Context Menu */}
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
               // Trigger snapshot via global control
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
