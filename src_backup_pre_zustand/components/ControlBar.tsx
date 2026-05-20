import { useState, useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toCosmoUrl } from '../utils/videoUtils';
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
  Download,
  ExternalLink,
  Command,
  Keyboard,
  Info,
  Hash,
  Type,
  Image as ImageIcon,
  Film,
  ChevronDown
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
  isFS: boolean;

  setIsFS: React.Dispatch<React.SetStateAction<boolean>>;
  isPopout: boolean;
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  showSymphonyWorkshop: boolean;
  setShowSymphonyWorkshop: (val: boolean) => void;
  toggleMasterMute: (soloId?: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectionMode: boolean;
  setSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  globalControl: string | null;
  mediaMode: 'video' | 'picture';
  setMediaMode: (mode: 'video' | 'picture') => void;
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
  isFS,

  setIsFS,
  isPopout,
  showHelp,
  setShowHelp,
  showSymphonyWorkshop,
  setShowSymphonyWorkshop,
  theme,
  setTheme,
  toggleMasterMute,
  selectedIds,
  setSelectedIds,
  selectionMode,
  setSelectionMode,
  globalControl,
  mediaMode,
  setMediaMode,
}: ControlBarProps) {
  const [collectionName, setCollectionName] = useState('');
  const [showBatchRename, setShowBatchRename] = useState(false);
  const [batchPrefix, setBatchPrefix] = useState('UNIT');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameHistory, setRenameHistory] = useState<string[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  useEffect(() => {
    if (showBatchRename) {
      // Load from Tauri persistent storage
      invoke<string | null>('load_persistence', { key: 'rename_history' }).then(saved => {
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) setRenameHistory(parsed);
          } catch { setRenameHistory([]); }
        } else {
          setRenameHistory([]);
        }
      }).catch(() => setRenameHistory([]));
      setShowHistoryDropdown(false);
    }
  }, [showBatchRename]);

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

  const saveCollection = () => {
    if (!collectionName.trim()) return;
    setCollections(p => ({ ...p, [collectionName]: videos }));
    setCollectionName('');
    addLog(`Saved Set: ${collectionName}`);
  };

  const loadCollection = (col: VideoItem[]) => {
    setVideos(col);
    setShowCollections(false);
    addLog('Loaded workspace set.');
  };

  const deleteCollection = (name: string) => {
    setCollections(p => {
      const n = { ...p };
      delete n[name];
      return n;
    });
  };
  
  const executeBatchRename = async () => {
    // Target selected videos, or fallback to all visible videos if none are selected
    const targets = selectedIds.size > 0 ? videos.filter(v => selectedIds.has(v.id)) : videos;
    
    if (targets.length === 0) {
      addLog("REJECTED: NO UNITS AVAILABLE FOR BATCH RENAMING.");
      return;
    }
    
    if (!confirm(`CAUTION: This will rename ${targets.length} selected physical assets. Proceed?`)) return;
    
    setIsRenaming(true);
    addLog(`INITIALIZING SMART BATCH RENAME: ${batchPrefix}_###`);
    
    // Sort selected items by their current order in the grid
    const sorted = [...targets].sort((a, b) => {
      const idxA = videos.findIndex(v => v.id === a.id);
      const idxB = videos.findIndex(v => v.id === b.id);
      return idxA - idxB;
    });
    
    const newVideos = [...videos];
    
    // Track sequence continuation per parent folder
    const folderStartNums: { [key: string]: number } = {};
    const getParentDir = (filePath: string) => {
      const lastSlash = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
      return lastSlash !== -1 ? filePath.substring(0, lastSlash) : '';
    };
    
    for (let i = 0; i < sorted.length; i++) {
      const v = sorted[i];
      if (!v.realPath) continue;

      const parentDir = getParentDir(v.realPath);
      
      // Initialize start number for this folder if not done yet
      if (parentDir && folderStartNums[parentDir] === undefined) {
        try {
          const existingFiles = await invoke<any[]>('get_folder_videos', { path: parentDir, mode: 'all' });
          const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`^${escapeRegExp(batchPrefix)}_(\\d+)`, 'i');
          let maxNum = 0;
          for (const file of existingFiles) {
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            const match = regex.exec(nameWithoutExt);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNum) {
                maxNum = num;
              }
            }
          }
          folderStartNums[parentDir] = maxNum + 1;
          addLog(`Sequence continuation for "${batchPrefix}" in "${parentDir.split(/[\\/]/).pop()}": starting at ${String(maxNum + 1).padStart(3, '0')}`);
        } catch (err) {
          console.error("Failed to check existing folder files:", err);
          folderStartNums[parentDir] = 1;
        }
      }

      const currentStartNum = folderStartNums[parentDir] || 1;
      // Increment the next sequence number for this folder
      folderStartNums[parentDir] = currentStartNum + 1;

      let baseNewName = `${batchPrefix}_${String(currentStartNum).padStart(3, '0')}`;
      let finalNewName = baseNewName;
      let attempt = 0;
      let success = false;
      let lastError = "";

      // CLEVER CONFLICT RESOLUTION LOOP
      while (!success && attempt < 10) {
        try {
          const resultPath = await invoke<string>('rename_video', { 
            oldPath: v.realPath, 
            newName: finalNewName 
          });
          
          const finalName = resultPath.split(/[\\/]/).pop() || resultPath;
          
          // First, remove any other cards that were physically overwritten
          const overwrittenIdx = newVideos.findIndex(nv => nv.id !== v.id && nv.realPath === resultPath);
          if (overwrittenIdx !== -1) {
            newVideos.splice(overwrittenIdx, 1);
          }
          
          // Comprehensive update on newVideos (batch rename in progress)
          for (let k = 0; k < newVideos.length; k++) {
            let updated = false;
            let nv = { ...newVideos[k] };
            
            if (nv.id === v.id) {
              nv.title = finalName;
              nv.realPath = resultPath;
              nv.url = toCosmoUrl(resultPath);
              updated = true;
            } else if (nv.realPath === v.realPath) {
              nv.title = finalName;
              nv.realPath = resultPath;
              nv.url = toCosmoUrl(resultPath);
              updated = true;
            }
            
            if (nv.folderFiles) {
              // Remove overwritten entry from folderFiles if present
              let newFiles = nv.folderFiles;
              const hasOverwritten = newFiles.some(f => f.path === resultPath);
              if (hasOverwritten) {
                newFiles = newFiles.filter(f => f.path !== resultPath);
              }
              
              const hasFile = newFiles.some(f => f.path === v.realPath);
              if (hasFile || hasOverwritten) {
                nv.folderFiles = newFiles.map(f => {
                  if (f.path === v.realPath) {
                    return {
                      ...f,
                      name: finalName,
                      path: resultPath,
                      url: toCosmoUrl(resultPath)
                    };
                  }
                  return f;
                });
                updated = true;
              }
            }
            
            if (updated) {
              newVideos[k] = nv;
            }
          }
          addLog(`SYNCED [${i+1}/${sorted.length}]: ${v.title} -> ${finalNewName}`);
          success = true;
        } catch (err: any) {
          lastError = err.toString();
          if (lastError.includes("already exists")) {
            attempt++;
            finalNewName = `${baseNewName}_${attempt}`;
            addLog(`CONFLICT: ${baseNewName} exists. Retrying as ${finalNewName}...`);
          } else {
            break; // Non-collision error, stop trying
          }
        }
      }

      if (!success) {
        addLog(`FAILED [${v.title}]: ${lastError}`);
      }
    }
    
    // Save to persistent history (Tauri AppData)
    const newPrefix = batchPrefix.trim();
    if (newPrefix) {
      invoke<string | null>('load_persistence', { key: 'rename_history' }).then(saved => {
        const prevHistory: string[] = saved ? JSON.parse(saved) : [];
        const nextHistory = [newPrefix, ...prevHistory.filter(item => item !== newPrefix)].slice(0, 50);
        invoke('save_persistence', { key: 'rename_history', data: JSON.stringify(nextHistory) }).catch(() => {});
        setRenameHistory(nextHistory);
      }).catch(() => {});
    }

    setVideos(newVideos);
    setIsRenaming(false);
    setShowBatchRename(false);
    setSelectedIds(new Set()); 
    setSelectionMode(false);
    addLog(mediaMode === 'picture' ? "BATCH IMAGE RENAME COMPLETE." : "SMART BATCH ORCHESTRATION COMPLETE.");
  };

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
                  className="hdr-search-input"
                />
                {search && (
                  <button 
                    className="search-clear-btn" 
                    onClick={() => setSearch('')}
                    data-tooltip="Clear Search"
                  >
                    <X size={12} />
                  </button>
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
                    if (window.confirm(`Are you sure you want to decommission ${selectedIds.size} units?`)) {
                      onBatchRemove();
                    }
                  }} 
                  className="hdr-btn danger" 
                  data-tooltip="DECOMMISSION SELECTION"
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
              <button onClick={() => { if (confirm('Purge Set?')) setVideos([]); }} className="hdr-btn" data-tooltip="Purge Set"><Trash2 size={14} /></button>
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
                  const nextTheme = themes[(themes.indexOf(theme) + 1) % themes.length];
                  setTheme(nextTheme);
                  addLog(`THEME SHIFT: ${nextTheme.toUpperCase()}`);
                }}
                className="hdr-btn"
                data-tooltip={`PALETTE: ${theme.toUpperCase()}`}
              >
                <Palette size={14} />
              </button>
              <button onClick={() => setShowLogs(!showLogs)} className={`hdr-btn ${showLogs ? 'active-accent' : ''}`} data-tooltip="Logs"><Layers size={14} /></button>
              <div className="merged-system-btns">
                <button onClick={() => setShowSettings(!showSettings)} className={`hdr-btn ${showSettings ? 'active-accent' : ''}`} data-tooltip="Settings & Guide"><Settings size={14} /></button>
              </div>
            </div>

            </div>
          </div>
        </header>

      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>System Configuration</h2>
              <button onClick={() => setShowSettings(false)} className="premium-close-btn">
                <X size={18} />
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
                  <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>DISPLAY ARCHITECTURE</label>
                  <div className="premium-segmented-control">
                    <div 
                      className="control-highlight" 
                      style={{ transform: `translateX(${fitMode === 'cover' ? '0%' : '100%'})` }}
                    />
                    <button className={fitMode === 'cover' ? 'active' : ''} onClick={() => setFitMode('cover')}>
                      WALL
                    </button>
                    <button className={fitMode === 'contain' ? 'active' : ''} onClick={() => setFitMode('contain')}>
                      NATIVE
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>DELETION SAFEGUARD</label>
                    <button 
                      className={`premium-switch ${confirmDeletion ? 'active' : ''}`}
                      onClick={() => setConfirmDeletion(!confirmDeletion)}
                      data-label={confirmDeletion ? 'SECURE' : 'EXPOSED'}
                    >
                      <div className="switch-rail">
                        <div className="switch-thumb" />
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="protocol-box">
                <div className="protocol-header">
                  <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--accent)', letterSpacing: '1px' }}>OPERATIONAL PROTOCOLS</label>
                </div>
                <div className="protocol-content">
                  <div className="protocol-row">
                    <strong>DECOMMISSION:</strong>
                    <span>Removes from list only. File stays on disk.</span>
                  </div>
                  <div className="protocol-row">
                    <strong>ANNIHILATE:</strong>
                    <span>Moves physical file to Windows Recycle Bin.</span>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3>Symphony Controls & Key Bindings</h3>
                <div className="shortcut-list" style={{ gap: '12px', display: 'flex', flexDirection: 'column' }}>
                  
                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginTop: '6px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>CORE SYSTEM COMMANDS</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>i</kbd>
                    <span>Toggle System Configuration & Guide</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>SPACE</kbd>
                    <span>Master Play / Pause (or Toggle Focused Unit)</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>M</kbd>
                    <span>Toggle Master Mute / Unmute</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>L</kbd>
                    <span>Cycle Loop Mode (None ➔ Once ➔ Always ➔ Folder)</span>
                  </div>

                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginTop: '12px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>IMMERSIVE & FOCUS MODES</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>F</kbd>
                    <span>Toggle Solo / Immersive Mode (Focused Unit)</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>ESC</kbd>
                    <span>Close Active Overlay / Exit Solo Mode</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Double Click</kbd>
                    <span>Enter Deep Immersive Focus on a Unit</span>
                  </div>

                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginTop: '12px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>NAVIGATION & ROTATION</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>▲</kbd> / <kbd>▼</kbd>
                    <span>Navigate Previous / Next Unit (Solo/Immersive Mode)</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>◀</kbd> / <kbd>▶</kbd>
                    <span>Rotate Focused Video (-90° / +90°)</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>1</kbd> — <kbd>8</kbd>
                    <span>Instant Grid Density presets (2 to 16 Units)</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>CTRL + Scroll</kbd>
                    <span>Dynamic / Precision Zoom grid scaling</span>
                  </div>

                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginTop: '12px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>DESTRUCTIVE COMMANDS</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>DELETE</kbd>
                    <span>Decommission Unit (Keeps local file, removes from list)</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>SHIFT + DELETE</kbd>
                    <span>Annihilate Unit (Moves physical file to Windows Recycle Bin)</span>
                  </div>

                </div>
              </div>

              {/* MERGED GUIDE CONTENT */}
              <div className="settings-section guide-section">
                <div className="section-header">
                  <Monitor size={16} />
                  <h3>SYMPHONY PLAYBACK & SYSTEM MECHANICS</h3>
                </div>
                <div className="format-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                  <div className="format-box" style={{ background: 'rgba(0,255,136,0.05)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(0,255,136,0.2)' }}>
                    <span style={{ fontSize: '10px', color: 'var(--success-color)', fontWeight: 'bold' }}>NATIVE VIDEO CORE</span>
                    <p style={{ margin: '5px 0', fontSize: '11px' }}>MP4, WebM, MOV, M4V, HLS</p>
                  </div>
                  <div className="format-box" style={{ background: 'rgba(0,180,255,0.05)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(0,180,255,0.2)' }}>
                    <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 'bold' }}>IMAGE ENGINE</span>
                    <p style={{ margin: '5px 0', fontSize: '11px' }}>PNG, JPG, JPEG, SVG, WEBP</p>
                  </div>
                </div>

                <div style={{ marginTop: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
                  <h3 style={{ fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', margin: 0, color: 'var(--text-color)' }}>Premium Mouse Gestures</h3>
                </div>

                <div className="interaction-list" style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  
                  <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                      <MousePointer2 size={18} />
                    </div>
                    <div className="i-content">
                      <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>Double Click</strong>
                      <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>Double click any media card to instantly enter "Deep Focus" solo fullscreen mode.</span>
                    </div>
                  </div>

                  <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                      <Monitor size={18} />
                    </div>
                    <div className="i-content">
                      <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>ALT + Scroll & Alt + Click/Drag (Precision Picture Zoom)</strong>
                      <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>In focus mode, hold <kbd>Alt</kbd> and use the <strong>Scroll Wheel</strong> to dynamically zoom in and out. **Click & Drag** to pan. Clicking on the picture will keep the zoom state intact; it will never reset accidentally.</span>
                    </div>
                  </div>

                  <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                      <Gauge size={18} />
                    </div>
                    <div className="i-content">
                      <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>Hover + Scroll Slideshow Timer</strong>
                      <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>Hover your mouse over the slideshow button and <strong>scroll with the mouse wheel</strong> to dynamically fine-tune the timer interval (from 2 to 30 seconds).</span>
                    </div>
                  </div>

                  <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                      <Zap size={18} />
                    </div>
                    <div className="i-content">
                      <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>Drag & Drop Workspace Ordering</strong>
                      <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>Left click and drag cards to freely reorder files. Drop folders or multiple files directly onto the app window to bulk-add them to the workspace.</span>
                    </div>
                  </div>

                  <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                      <ListRestart size={18} />
                    </div>
                    <div className="i-content">
                      <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>Stable Hand-Grab Custom Scrollbar</strong>
                      <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>The grid features a customized, highly visible scrollbar that blends with the theme. Use the <strong>Grab Hand</strong> cursor to easily navigate without layout jumping.</span>
                    </div>
                  </div>

                  <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                      <Layers size={18} />
                    </div>
                    <div className="i-content">
                      <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>Adaptive Buffer Memory (Pre-caching)</strong>
                      <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>When scrolling through images or videos in fullscreen, the engine automatically pre-caches the next 2 and previous 2 media items into memory for navigation.</span>
                    </div>
                  </div>

                </div>
              </div>

              <div className="settings-footer" style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.6, fontSize: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Info size={12} />
                  <span>COSMO SYMPHONY v3.4.0</span>
                </div>
                <span>SYSTEM STABLE</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCollections && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '400px' }}>
            <div className="modal-header">
              <h2>Workspace Collections</h2>
              <button onClick={() => setShowCollections(false)} className="premium-close-btn">
                <X size={18} />
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
        <div className="modal-overlay">
          <div className="modal-content premium-glass" onClick={(e) => e.stopPropagation()} style={{ width: '420px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="accent-icon-box">
                  <Hash size={20} className="text-accent" />
                </div>
                <div>
                  <h2 style={{ fontSize: '16px', letterSpacing: '1px' }}>
                    {mediaMode === 'picture' ? 'BATCH IMAGE RENAME' : 'BATCH ORCHESTRATION'}
                  </h2>
                  <span style={{ fontSize: '9px', opacity: 0.5, fontWeight: 800 }}>
                    {mediaMode === 'picture' ? 'SEQUENTIAL PHOTO INDEXING' : 'SEQUENTIAL ASSET RE-INDEXING'}
                  </span>
                </div>
              </div>
              {!isRenaming && (
                <button onClick={() => setShowBatchRename(false)} className="premium-close-btn">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="modal-body">
              <div className="settings-section">
                <div className="setting-item">
                  <label style={{ color: 'var(--accent)', fontSize: '10px', fontWeight: 900 }}>
                    {mediaMode === 'picture' ? 'IMAGE PREFIX' : 'RE-INDEX PREFIX'}
                  </label>
                  <div style={{ position: 'relative', width: '100%', marginTop: '6px' }}>
                    <input 
                      type="text" 
                      value={batchPrefix}
                      onChange={(e) => {
                        setBatchPrefix(e.target.value);
                        setShowHistoryDropdown(true);
                      }}
                      onFocus={() => setShowHistoryDropdown(true)}
                      onBlur={() => {
                        setTimeout(() => setShowHistoryDropdown(false), 200);
                      }}
                      placeholder={mediaMode === 'picture' ? "e.g. PHOTO, ALBUM, IMAGE" : "e.g. UNIT, SHOT, SCENE"}
                      disabled={isRenaming}
                      onMouseDown={e => e.stopPropagation()}
                      className="premium-input"
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.7,
                        transition: 'opacity 0.2s',
                      }}
                      disabled={isRenaming}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                    >
                      <ChevronDown size={16} />
                    </button>
                    
                    {showHistoryDropdown && renameHistory.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 4px)',
                          left: 0,
                          width: '100%',
                          maxHeight: '150px',
                          overflowY: 'auto',
                          background: 'rgba(15, 15, 15, 0.95)',
                          backdropFilter: 'blur(10px)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          zIndex: 9999,
                          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
                        }}
                      >
                        {renameHistory
                          .filter(item => !batchPrefix || item.toLowerCase().includes(batchPrefix.toLowerCase()))
                          .map((item, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                setBatchPrefix(item);
                                setShowHistoryDropdown(false);
                              }}
                              style={{
                                padding: '10px 16px',
                                fontSize: '12px',
                                color: '#fff',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                borderBottom: idx < renameHistory.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                              }}
                              className="history-item-hover"
                              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.15)'}
                              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              {item}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="orchestration-preview">
                   <div className="preview-header">
                     <span>{mediaMode === 'picture' ? 'RENAME PREVIEW' : 'SEQUENCE PREVIEW'}</span>
                     <span className="unit-count">
                       {(selectedIds.size > 0 ? selectedIds.size : videos.length)}{' '}
                       {mediaMode === 'picture' ? (selectedIds.size === 1 ? 'IMAGE TARGETED' : 'IMAGES TARGETED') : (selectedIds.size === 1 ? 'UNIT TARGETED' : 'UNITS TARGETED')}
                     </span>
                   </div>
                   <div className="preview-list">
                     <div className="preview-row">
                       <span className="old">{mediaMode === 'picture' ? 'OLD_NAME.jpg' : 'OLD_NAME.mp4'}</span>
                       <span className="arrow">→</span>
                       <span className="new">{batchPrefix || '...'}_001.{mediaMode === 'picture' ? 'jpg' : 'mp4'}</span>
                     </div>
                     <div className="preview-row">
                       <span className="old">{mediaMode === 'picture' ? 'OLD_NAME.jpg' : 'OLD_NAME.mp4'}</span>
                       <span className="arrow">→</span>
                       <span className="new">{batchPrefix || '...'}_002.{mediaMode === 'picture' ? 'jpg' : 'mp4'}</span>
                     </div>
                     <div className="preview-row muted">
                       {mediaMode === 'picture' 
                         ? '...Sequential renaming applied to all images.' 
                         : '...Sequential re-indexing applied to all units.'}
                     </div>
                   </div>
                </div>
                
                <button 
                  onClick={executeBatchRename} 
                  disabled={isRenaming || !batchPrefix.trim()}
                  className={`execute-btn ${isRenaming ? 'loading' : ''} ${(selectedIds.size > 0 ? selectedIds.size : videos.length) === 0 ? 'disabled-selection' : ''}`}
                >
                  {isRenaming ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      <span>{mediaMode === 'picture' ? 'RENAMING IMAGES...' : 'INITIALIZING SYNC...'}</span>
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      <span>{mediaMode === 'picture' ? 'RENAME IMAGES' : 'EXECUTE SEQUENCE'}</span>
                    </>
                  )}
                </button>
                
                <p style={{ fontSize: '9px', opacity: 0.4, textAlign: 'center', marginTop: '12px', lineHeight: '1.4' }}>
                  CAUTION: Physical {mediaMode === 'picture' ? 'images' : 'assets'} will be renamed on disk. This operation is non-reversible within the Symphony Workshop.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
