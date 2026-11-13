import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { showConfirm } from '../utils/videoUtils';
import type { VideoItem } from '../types';
import { useStore } from '../store/useStore';
import { CollectionsModal } from './modals/CollectionsModal';
import { SettingsModal } from './modals/SettingsModal';
import { MIN_ZOOM, MAX_ZOOM } from '../constants';
import { SortDropdown } from './controlbar/SortDropdown';
import { QuickFoldersMenu } from './controlbar/QuickFoldersMenu';
import { SystemBadges } from './controlbar/SystemBadges';
import { ColorTagFilterBar } from './controlbar/ColorTagFilterBar';
import { LayoutPresetDropdown } from './controlbar/LayoutPresetDropdown';
import { WindowControlsMenu } from './controlbar/WindowControlsMenu';
import { ThemeSelector } from './controlbar/ThemeSelector';
import { useWindowControls } from './controlbar/useWindowControls';
import {
  Play,
  Pause,
  RefreshCw,
  Repeat,
  Volume2,
  VolumeX,
  X,
  LayoutGrid,
  Bookmark,
  Search,
  Eye,
  EyeOff,
  Trash2,
  Monitor,
  Gauge,
  Type,
  Image as ImageIcon,
  Film,
  Wifi
} from 'lucide-react';

interface ControlBarProps {
  videos: VideoItem[];
  collections: Record<string, VideoItem[]>;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  setCollections: React.Dispatch<React.SetStateAction<Record<string, VideoItem[]>>>;
  snapshotDir: string;
  setSnapshotDir: React.Dispatch<React.SetStateAction<string>>;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  addLog: (msg: string) => void;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showCollections: boolean;
  setShowCollections: React.Dispatch<React.SetStateAction<boolean>>;
  showLogs: boolean;
  setShowLogs: React.Dispatch<React.SetStateAction<boolean>>;
  logs: { t: string; m: string }[];
  setGlobalControl: React.Dispatch<React.SetStateAction<string | null>>;
  confirmDeletion: boolean;
  setConfirmDeletion: React.Dispatch<React.SetStateAction<boolean>>;
  globalControl: string | null;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (val: boolean) => void;
  slideshowInterval: number;
  setSlideshowInterval: React.Dispatch<React.SetStateAction<number>>;
  onOpenWifiShare?: () => void;
  onOpenVolumeRepeat?: () => void;
  onForceSetup?: () => void;
  onPurgeWorkspace?: () => void;
}

export function ControlBar({
  videos,
  collections,
  setVideos,
  setCollections,
  snapshotDir,
  setSnapshotDir,
  search,
  setSearch,
  addLog,
  showSettings,
  setShowSettings,
  showCollections,
  setShowCollections,
  showLogs,
  setShowLogs,
  logs,
  setGlobalControl,
  confirmDeletion,
  setConfirmDeletion,
  globalControl,
  isSlideshowActive,
  setIsSlideshowActive,
  slideshowInterval,
  setSlideshowInterval,
  onOpenWifiShare,
  onOpenVolumeRepeat,
  onForceSetup,
  onPurgeWorkspace
}: ControlBarProps) {
  const {
    mediaMode, setMediaMode,
    theme, setTheme,
    alwaysOnTop, setAlwaysOnTop,
    masterPlaying, setMasterPlaying,
    masterMuted,
    globalVolume,
    speed, setSpeed,
    globalRepeat,
    zoom, setZoom,
    immersive, setImmersive,
    renameHistory,
    aiHardwareStatus,
    enableSlideshowPanZoom, setEnableSlideshowPanZoom,
    sortOrder, setSortOrder,
    slideshowInterval: storeSlideshowInterval,
    setSlideshowInterval: setStoreSlideshowInterval,
    showBatchRename,
    setShowBatchRename
  } = useStore();

  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [sortDropdownPos, setSortDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const windowCtrl = useWindowControls();

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

  const filteredHistory = useMemo(() => {
    if (!renameHistory) return [];
    if (!search.trim()) return renameHistory;
    return renameHistory.filter((name) =>
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
  }, [globalControl, setGlobalControl, setShowBatchRename]);

  const densityValue = (MAX_ZOOM + MIN_ZOOM) - zoom;
  const densityPct = ((densityValue - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100;
  const speedPct = ((speed - 0.25) / 3.75) * 100;

  return (
    <>
      <header
        className="app-header"
        onMouseDown={windowCtrl.handleHeaderMouseDown}
        onDoubleClick={windowCtrl.handleHeaderDoubleClick}
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
              <img src="/logo.png" style={{ height: '20px', width: '20px', objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.85))' }} alt="Cosmo" />
              <span style={{
                fontSize: '11.5px',
                fontWeight: 800,
                letterSpacing: '1.8px',
                color: '#f4f4f5',
                fontFamily: 'var(--font-display)',
                background: 'linear-gradient(90deg, #ffffff 0%, #e4e4e7 55%, var(--accent-bright, #34d399) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                COSMO SYMPHONY
              </span>
              <span style={{
                fontSize: '8px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '1px',
                color: 'var(--accent-warm, #f59e0b)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                background: 'rgba(245, 158, 11, 0.08)',
                padding: '1px 5px',
                borderRadius: '4px',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)'
              }}>
                STUDIO
              </span>
            </div>

            <div className="search-box" data-no-drag>
              <Search size={14} className="search-icon-mini" />
              <input
                type="text"
                placeholder={mediaMode === 'video' ? 'Search Videos...' : 'Search Pictures...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
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
                <div className="search-history-dropdown" onMouseDown={(e) => e.stopPropagation()}>
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

            <button
              className="mode-btn"
              onClick={onOpenWifiShare}
              data-tooltip="Wi-Fi Sharing Protocol"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Wifi size={14} style={{ color: 'var(--accent, #00ff88)' }} />
              <span>WI-FI SHARE</span>
            </button>

            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 8px' }} />

            <QuickFoldersMenu addLog={addLog} />

            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 16px' }} />

            <button
              className="mode-btn"
              onClick={() => {
                const cacheBuster = `t=${Date.now()}`;
                setVideos((prev) => prev.map((v) => ({
                  ...v,
                  url: `${v.url.split('?')[0]}?${cacheBuster}`
                })));
                addLog('SYSTEM: Refreshed all tiles in workspace');
              }}
              data-tooltip="Refresh All Tiles"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} style={{ color: 'var(--accent, #00ff88)' }} />
              <span>REFRESH TILES</span>
            </button>
          </div>

          <WindowControlsMenu
            isSpanned={windowCtrl.isSpanned}
            setIsSpanned={windowCtrl.setIsSpanned}
            showMaxMenu={windowCtrl.showMaxMenu}
            setShowMaxMenu={windowCtrl.setShowMaxMenu}
            isWindowMaximized={windowCtrl.isWindowMaximized}
          />
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

            <SortDropdown
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              showSortDropdown={showSortDropdown}
              setShowSortDropdown={setShowSortDropdown}
              sortDropdownPos={sortDropdownPos}
              setSortDropdownPos={setSortDropdownPos}
              sortButtonRef={sortButtonRef}
              sortDropdownRef={sortDropdownRef}
            />

            <ColorTagFilterBar videos={videos} />

            {/* PLAYBACK ENGINE */}
            {mediaMode === 'video' && (
              <div className="ctrl-group playback-group">
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
                      background: `linear-gradient(to right, var(--accent, #00ff88) 0%, var(--accent, #00ff88) ${speedPct}%, rgba(255, 255, 255, 0.12) ${speedPct}%, rgba(255, 255, 255, 0.12) 100%)`
                    }}
                  />
                </div>

                <button
                  onClick={onOpenVolumeRepeat}
                  className={`hdr-btn ${masterMuted ? 'active-danger' : globalVolume > 0 ? 'active-accent' : ''}`}
                  data-tooltip={masterMuted ? 'Volume: MUTED (Click to Open Mixer)' : `Volume: ${Math.round(globalVolume * 100)}% (Click to Open Mixer)`}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {masterMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>

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
              <LayoutPresetDropdown onApplyPreset={(p) => addLog('Layout Preset: ' + p.name + ' applied')} />
              <div className="slider-h-box" data-tooltip={`Density: ${densityValue}`}>
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
                  value={densityValue}
                  onChange={(e) => setZoom((MAX_ZOOM + MIN_ZOOM) - parseInt(e.target.value))}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-range density-range"
                  style={{
                    background: `linear-gradient(to right, var(--accent, #00ff88) 0%, var(--accent, #00ff88) ${densityPct}%, rgba(255, 255, 255, 0.12) ${densityPct}%, rgba(255, 255, 255, 0.12) 100%)`
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
              <button
                onClick={() => {
                  if (onPurgeWorkspace) onPurgeWorkspace();
                  else {
                    showConfirm('Purge Set? This will clear all cards.', { title: 'Purge Set', kind: 'error' }).then((yes) => {
                      if (yes) setVideos([]);
                    });
                  }
                }}
                className="hdr-btn"
                data-tooltip="Purge Set"
              >
                <Trash2 size={14} />
              </button>
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

              <ThemeSelector theme={theme} setTheme={setTheme} addLog={addLog} />

              <SystemBadges
                onForceSetup={onForceSetup}
                aiHardwareStatus={aiHardwareStatus}
                slideshowInterval={slideshowInterval}
                storeSlideshowInterval={storeSlideshowInterval}
                setSlideshowInterval={setSlideshowInterval}
                setStoreSlideshowInterval={setStoreSlideshowInterval}
                isSlideshowActive={isSlideshowActive}
                setIsSlideshowActive={setIsSlideshowActive}
                enableSlideshowPanZoom={enableSlideshowPanZoom}
                setEnableSlideshowPanZoom={setEnableSlideshowPanZoom}
              />
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
    </>
  );
}
