import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AnimatePresence } from 'framer-motion';
import type { VideoItem, RepeatMode } from './types';
import { useStore } from './store/useStore';
import { ContextMenu } from './components/ContextMenu';
import { ColorAdjustmentPanel } from './components/ColorAdjustmentPanel';
import { sortVideoItems } from './utils/sortUtils';

// Modular Component and Hook Imports
import { ErrorFallback } from './components/ErrorFallback';
import { TelemetrySystem } from './components/TelemetrySystem';
import { SoloPlayerWrapper } from './components/SoloPlayerWrapper';
import { PopoutPlayer } from './components/PopoutPlayer';
import { BgContextMenu } from './components/BgContextMenu';
import { AppOverlays } from './components/AppOverlays';
import { AppModalsContainer } from './components/AppModalsContainer';
import { AppWorkspaceLayout } from './components/AppWorkspaceLayout';

import { useMediaImport } from './hooks/useMediaImport';
import { useMediaPlayback } from './hooks/useMediaPlayback';
import { useVideoOperations } from './hooks/useVideoOperations';
import { useStickerCreator } from './hooks/useStickerCreator';
import { useWorkspaceDnd } from './hooks/useWorkspaceDnd';
import { useDemoLoader } from './hooks/useDemoLoader';
import { useWorkspacePersistence } from './hooks/useWorkspacePersistence';
import { useWorkspaceControls } from './hooks/useWorkspaceControls';
import { useIngestion } from './hooks/useIngestion';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSessionControl } from './hooks/useSessionControl';
import { useLayoutOrchestration } from './hooks/useLayoutOrchestration';
import { usePlaybackSync } from './hooks/usePlaybackSync';
import { usePopoutWindowDetection } from './hooks/usePopoutWindowDetection';
import { useAppShutdown } from './hooks/useAppShutdown';
import { useCollageState } from './hooks/useCollageState';
import { useAutoSyncWatcher } from './hooks/useAutoSyncWatcher';
import { useClipboardPaste } from './hooks/useClipboardPaste';
import { useWorkspaceActions } from './hooks/useWorkspaceActions';
import { useSlideshowController } from './hooks/useSlideshowController';
import { useSoloGestures } from './hooks/useSoloGestures';
import { useContextMenuController } from './hooks/useContextMenuController';
import { useContextMenuActions } from './hooks/useContextMenuActions';
import { useLaunchArgs } from './hooks/useLaunchArgs';
import { useWorkspaceDrop } from './hooks/useWorkspaceDrop';
import { useWorkspaceSelection } from './hooks/useWorkspaceSelection';
import { useAppSystemEvents } from './hooks/useAppSystemEvents';
import { useAppModalState } from './hooks/useAppModalState';

import { 
  toRealPath,
  isValidVideoExtension, 
  isValidPictureExtension,
  isTauri, 
  fuzzyMatchScore 
} from './utils/videoUtils';

export default function App() {
  const { 
    mediaMode, setMediaMode, theme, isFS, setIsFS, masterPlaying, setMasterPlaying, masterMuted, setMasterMuted, 
    globalVolume, setGlobalVolume, speed, fitMode, zoom, immersive, setImmersive, masterShowUI, 
    setMasterShowUI, selectedIds, setSelectedIds, selectionMode, setSelectionMode, 
    renameHistory, setRenameHistory, addToRenameHistory, setAiHardwareStatus, 
    enableOSFullscreen, sortOrder, quickFolders, setQuickFolders, 
    autoSyncFolders, folderSwitchDelay, slideshowInterval, setSlideshowInterval 
  } = useStore();

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const { isWindowMaximized } = useAppSystemEvents({
    quickFolders,
    setQuickFolders,
    setAiHardwareStatus,
    setIsCommandPaletteOpen
  });

  const handleOpenWebsite = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      if (isTauri()) {
        await openUrl('https://cosmowhisper.com');
      } else {
        window.open('https://cosmowhisper.com', '_blank');
      }
    } catch {
      window.open('https://cosmowhisper.com', '_blank');
    }
  };

  const [needsSetup, setNeedsSetup] = useState(false);
  const [forceSetup, setForceSetup] = useState(false);
  const { isPopout, popoutUrl, isPopoutChecking } = usePopoutWindowDetection();
  const { showShutdown } = useAppShutdown({ isPopout });

  const [globalControl, setGlobalControl] = useState<string | null>(null);
  const [sessionDuration] = useState(0); 
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  const [convertingStatus, setConvertingStatus] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [colorAdjustId, setColorAdjustId] = useState<string | null>(null);
  const [, setMasterMutedOverride] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCollections, setShowCollections] = useState(false);

  const {
    showCollageCanvas,
    setShowCollageCanvas,
    collageItems,
    setCollageItems,
    collageConfig,
    setCollageConfig
  } = useCollageState();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', sidebarCollapsed.toString());
  }, [sidebarCollapsed]);

  useEffect(() => {
    invoke<string | null>('load_persistence', { key: 'rename_history' }).then(saved => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setRenameHistory(parsed);
        } catch {}
      }
    }).catch(() => {});

    if (isTauri()) {
      invoke<string>('get_drag_icon_path').then(p => {
        (window as any).__CRAB_DRAG_ICON__ = p;
      }).catch(err => console.error("Failed to get drag icon path:", err));

      invoke<any>('check_dependencies').then(status => {
        if (!status.python_ok || !status.packages_ok || !status.models_ok) {
          setNeedsSetup(true);
        }
      }).catch(err => console.error("Dependency check failed:", err));
    }
  }, [setRenameHistory]);

  const [singleRenameTarget, setSingleRenameTarget] = useState<VideoItem | null>(null);

  useEffect(() => {
    localStorage.setItem('cosmo-media-mode', mediaMode);
  }, [mediaMode]);

  const [newCollectionName, setNewCollectionName] = useState('');
  const showImmersiveUI = masterShowUI;
  const setShowImmersiveUI = setMasterShowUI;
  const pendingScrollIdRef = useRef<string | null>(null);
  
  const [toast, setToast] = useState<string | null>(null);
  const [toastPath, setToastPath] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const modalState = useAppModalState();

  const [globalHud, setGlobalHud] = useState<{ label: string; val: string } | null>(null);
  const globalHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerGlobalHud = useCallback((label: string, val: string) => {
    setGlobalHud({ label, val });
    if (globalHudTimerRef.current) clearTimeout(globalHudTimerRef.current);
    globalHudTimerRef.current = setTimeout(() => {
      setGlobalHud(null);
    }, 1800);
  }, []);

  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [navDirection, setNavDirection] = useState<1 | -1>(1);

  const masterPlayingRef = useRef(masterPlaying);
  const masterMutedRef = useRef(masterMuted);
  useEffect(() => { masterPlayingRef.current = masterPlaying; }, [masterPlaying]);
  useEffect(() => { masterMutedRef.current = masterMuted; }, [masterMuted]);

  const soloOverlayRef = useRef<HTMLDivElement>(null);
  const soloVolumeContainerRef = useRef<HTMLDivElement>(null);

  const [logs, setLogs] = useState<{ t: string, m: string }[]>([]);
  const addLog = useCallback((m: string) => {
    setLogs(p => [{ t: new Date().toLocaleTimeString(), m }, ...p].slice(0, 50));
    const lower = m.toLowerCase();
    if (lower.includes("snapshot") || lower.includes("decommission") || lower.includes("annihilate") || lower.includes("deleted")) {
      let toastMsg = m;
      if (m.includes("Snapshot saved to: ")) {
        const path = m.split("Snapshot saved to: ")[1];
        setToastPath(path);
        toastMsg = "Snapshot Saved";
      }
      setToast(toastMsg);
      setTimeout(() => { setToast(null); setToastPath(null); }, 3000);
    }
  }, []);

  const {
    videos,
    setVideos,
    collections,
    setCollections,
    rotationInterval,
    setRotationInterval,
    snapshotDir,
    setSnapshotDir,
    confirmDeletion,
    setConfirmDeletion,
    isInitialized,
    setIsInitialized
  } = useWorkspacePersistence(addLog, isPopout, masterMuted, masterPlaying);

  const {
    search,
    setSearch,
    focusedId,
    setFocusedId,
    rotIdx,
    setRotIdx,
    rotating,
    setRotating,
    jumpToUnit,
    onToggleFocus,
    setIdToRow: setWorkspaceIdToRow,
    setRowOffsets: setWorkspaceRowOffsets
  } = useWorkspaceControls(addLog);

  const {
    menu,
    setMenu,
    menuMetadata,
    setMenuMetadata,
    metadataCache,
    handleContext
  } = useContextMenuController({
    videos,
    focusedId
  });

  const activeGridFolders = useMemo(() => {
    const folders = new Set<string>();
    videos.forEach(v => {
      if (v.folderFiles && v.folderFiles.length > 0) {
        if (v.realPath) folders.add(v.realPath);
      } else {
        const path = v.realPath || '';
        const separator = path.includes('\\') ? '\\' : '/';
        const lastSlashIdx = path.lastIndexOf(separator);
        if (lastSlashIdx !== -1) {
          folders.add(path.substring(0, lastSlashIdx));
        }
      }
    });
    return Array.from(folders);
  }, [videos]);

  const filtered = useMemo(() => {
    let result = videos;
    if (search.trim()) {
      const q = search.trim();
      result = result
        .map(v => ({ v, score: fuzzyMatchScore(q, v.title) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.v);
    }
    return sortVideoItems(result, sortOrder);
  }, [videos, search, sortOrder]);

  const {
    exitSoloMode,
    toggleSelect,
    handleSelectAll,
    handleDeepFocus
  } = useWorkspaceSelection({
    videos,
    setVideos,
    filtered,
    selectedIds,
    setSelectedIds,
    selectionMode,
    setSelectionMode,
    focusedId,
    setFocusedId,
    setImmersive,
    setIsSlideshowActive,
    rotating,
    setRotating,
    enableOSFullscreen,
    setIsFS,
    addLog,
    jumpToUnit,
    pendingScrollIdRef
  });

  const focusedVideo = focusedId ? videos.find(v => v.id === focusedId) : null;
  const focusedEffectivePath = focusedVideo
    ? (focusedVideo.folderFiles && focusedVideo.currentIdx !== undefined)
      ? (focusedVideo.folderFiles[focusedVideo.currentIdx]?.path || focusedVideo.folderFiles[focusedVideo.currentIdx]?.url)
      : focusedVideo.realPath
    : undefined;
  const resolvedFocusedPath = toRealPath(focusedEffectivePath) || focusedEffectivePath;
  const isFocusedImage = resolvedFocusedPath ? isValidPictureExtension(resolvedFocusedPath) : false;
  const isFocusedVideo = resolvedFocusedPath ? isValidVideoExtension(resolvedFocusedPath) : false;

  const { handlePasteImage } = useClipboardPaste({
    focusedId,
    selectedIds,
    setVideos,
    addLog,
    setToast,
    setMediaMode
  });

  const {
    handleIngestPaths,
    handleAddMediaFiles,
    handleSidebarAddFolder,
    processFolderConversion
  } = useMediaImport({
    mediaMode,
    videos,
    masterPlayingRef,
    masterMutedRef,
    setVideos,
    setMediaMode,
    setFocusedId,
    setConvertingStatus,
    addLog
  });

  useLaunchArgs({
    isPopout,
    setVideos,
    addLog,
    mediaMode,
    masterPlayingRef,
    masterMutedRef,
    setConvertingStatus,
    processFolderConversion
  });

  const { pendingAutoAddRef } = useAutoSyncWatcher({
    videos,
    setVideos,
    autoSyncFolders,
    handleIngestPaths,
    folderSwitchDelay,
    addLog
  });

  const { handleVideoEnded } = useMediaPlayback({
    globalRepeat: useStore.getState().globalRepeat,
    addLog,
    setVideos,
    focusedId,
    filtered,
    setFocusedId,
    masterMuted,
    setNavDirection
  });

  const videoOps = useVideoOperations({
    focusedId,
    setFocusedId,
    focusedVideo,
    mediaMode,
    setMediaMode,
    setVideos,
    addLog,
    setToast,
    setToastPath
  });

  const {
    stickerLoadingId,
    handleCreateSticker,
    handleCancelSticker
  } = useStickerCreator({
    setVideos,
    setSortOrder: useStore.getState().setSortOrder,
    setFocusedId,
    addLog
  });

  const {
    dragId,
    dragFile,
    setDragFile,
    sensors,
    handleDragStart,
    handleDragEnd
  } = useWorkspaceDnd({
    videos,
    setVideos,
    masterPlaying,
    masterMuted,
    selectedIds,
    setSelectedIds,
    setSelectionMode,
    setToast,
    addLog
  });

  const { onAddVideo } = useDemoLoader({
    setVideos,
    addLog
  });

  const workspaceActions = useWorkspaceActions({
    videos,
    setVideos,
    selectedIds,
    setSelectedIds,
    setSelectionMode,
    focusedId,
    setFocusedId,
    filtered,
    exitSoloMode,
    confirmDeletion,
    setColorAdjustId,
    pendingAutoAddRef,
    metadataCache,
    addLog,
    setToast,
    fileManageMode: modalState.fileManageMode,
    setWifiShareOpen: modalState.setWifiShareOpen,
    setWifiShareItems: modalState.setWifiShareItems
  });

  const {
    handleDecommission,
    handlePurgeWorkspace,
    handleRefreshTiles,
    handleAnnihilate,
    handleFileManagementSuccess,
    handleBatchRemove,
    handleBatchMute,
    handleBatchPlay,
    handleTriggerWifiShare
  } = workspaceActions;

  const {
    handleNavigateSibling,
    cachedAssetUrls
  } = useSlideshowController({
    isSlideshowActive,
    setIsSlideshowActive,
    focusedId,
    setFocusedId,
    filtered,
    videos,
    setVideos,
    masterMuted,
    slideshowInterval,
    isFocusedImage,
    isFocusedVideo,
    setImmersive,
    setToast,
    addLog,
    setIsCropping: videoOps.setIsCropping,
    setShowSaveCropOptions: videoOps.setShowSaveCropOptions,
    setShowSaveUpscaleOptions: videoOps.setShowSaveUpscaleOptions,
    setShowResizeModal: videoOps.setShowResizeModal,
    setColorAdjustId,
    setGlobalControl,
    setNavDirection
  });

  const handleUpdate = useCallback((idOrIds: string | string[], updates: any) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setVideos(prev => prev.map(v => {
      if (ids.includes(v.id)) {
        const up = typeof updates === 'function' ? updates(v) : updates;
        return { ...v, ...up };
      }
      return v;
    }));
  }, [setVideos]);

  const onUpdateVideo = handleUpdate;

  const {
    triggerFrameStep,
    startFrameStep,
    stopFrameStep
  } = useSoloGestures({
    focusedId,
    videos,
    handleUpdate,
    onUpdateVideo,
    handleNavigateSibling,
    setGlobalControl,
    setGlobalVolume,
    immersive,
    isFS,
    showImmersiveUI,
    setShowImmersiveUI,
    singleRenameTarget,
    soloOverlayRef,
    soloVolumeContainerRef,
    addLog
  });

  const {
    rowOffsets,
    idToRow,
    setRowOffsets,
    setIdToRow
  } = useLayoutOrchestration({
    videos,
    zoom,
    immersive,
    filteredCount: filtered.length,
    isPopout
  });

  useEffect(() => {
    setWorkspaceIdToRow(idToRow);
    setWorkspaceRowOffsets(rowOffsets);

    if (pendingScrollIdRef.current) {
      const targetId = pendingScrollIdRef.current;
      pendingScrollIdRef.current = null;
      
      const row = idToRow[targetId];
      if (typeof row === 'number') {
        const offset = rowOffsets[row];
        const scrollArea = document.querySelector('.video-scroll');
        if (scrollArea && typeof offset === 'number') {
          scrollArea.scrollTo({ top: offset, behavior: 'smooth' });
          setRotIdx(row);
          addLog(`Navigated to Line: ${row + 1}`);
        }
      }
    }
  }, [idToRow, rowOffsets, setWorkspaceIdToRow, setWorkspaceRowOffsets, addLog, setRotIdx]);

  useSessionControl({
    sessionDuration,
    rotationInterval,
    rotating,
    setRotating,
    collections,
    rowOffsets,
    rotIdx,
    setRotIdx,
    addLog,
    isPopout
  });

  const {
    toggleMasterMute,
    toggleMasterPlay
  } = usePlaybackSync({
    masterPlaying,
    setMasterPlaying,
    masterMuted,
    setMasterMuted,
    setMasterMutedOverride,
    globalVolume,
    setGlobalVolume,
    setVideos,
    addLog
  });

  const prevFocusedIdForMute = useRef(focusedId);
  useEffect(() => {
    if (prevFocusedIdForMute.current && !focusedId) {
      setMasterPlaying(false);
      setMasterMuted(true);
      setGlobalVolume(0);
      addLog("Exiting Solo Mode: Returned to Grid");
    } else if (!prevFocusedIdForMute.current && focusedId) {
      setMasterPlaying(true);
      setMasterMuted(false);
      setGlobalVolume(1.0);
      addLog("Entering Solo Mode");
    }
    prevFocusedIdForMute.current = focusedId;
  }, [focusedId, setMasterPlaying, setMasterMuted, setGlobalVolume, addLog]);

  useKeyboardShortcuts({
    focusedId,
    filtered,
    videos,
    selectedIds,
    confirmDeletion,
    immersive,
    menu,
    showSettings,
    showCollections,
    showLogs,
    showHelp,
    isPopout,
    isSlideshowActive,
    setIsSlideshowActive,
    onUpdateVideo,
    onToggleFocus,
    exitSoloMode,
    onSelectAll: handleSelectAll,
    toggleMasterPlay,
    toggleMasterMute,
    setGlobalRepeat: (updater: RepeatMode | ((prev: RepeatMode) => RepeatMode)) => {
      const current = useStore.getState().globalRepeat;
      if (typeof updater === 'function') {
        useStore.getState().setGlobalRepeat(updater(current));
      } else {
        useStore.getState().setGlobalRepeat(updater);
      }
    },
    setGlobalControl,
    setZoom: useStore.getState().setZoom,
    setMenu,
    setImmersive,
    setShowSettings,
    setShowCollections,
    setShowLogs,
    setShowHelp,
    setSelectedIds,
    setSelectionMode,
    handleDecommission,
    handleAnnihilate,
    handleBatchRemove,
    addLog,
    onNavigateSibling: handleNavigateSibling,
    jumpToUnit: jumpToUnit,
    onDeepFocus: handleDeepFocus,
    triggerGlobalHud
  });

  useIngestion({
    mediaMode,
    setMediaMode,
    setVideos,
    addLog,
    masterPlayingRef,
    masterMutedRef,
    setDragFile,
    setConvertingStatus,
    isPopout
  });

  useEffect(() => {
    if (!rotating || !scrollRef.current || rowOffsets.length === 0) return;
    scrollRef.current.scrollTo({ top: rowOffsets[rotIdx] || 0, behavior: 'smooth' });
  }, [rotIdx, rotating, rowOffsets]);

  const { onContextMenuAction } = useContextMenuActions({
    videos,
    setVideos,
    onUpdateVideo,
    toggleSelect,
    selectedIds,
    setSelectedIds,
    setSelectionMode,
    focusedId,
    setFocusedId,
    setIsCropping: videoOps.setIsCropping,
    setCropBox: videoOps.setCropBox,
    setAspectRatio: videoOps.setAspectRatio,
    handleResize: videoOps.handleResize,
    handleNavigateSibling,
    handleCreateSticker,
    handleDecommission,
    setSingleRenameTarget,
    setColorAdjustId,
    handleTriggerWifiShare,
    setGlobalControl,
    addLog,
    setToast,
    setMenu,
    setMenuMetadata,
    metadataCache,
    handleSelectAll,
    handleBatchRemove,
    confirmDeletion,
    setImmersive,
    setIsFS,
    filtered,
    setCollections,
    setCollageItems,
    onToggleFocus,
    handleUpscale: videoOps.handleUpscale,
    setFileManageMode: modalState.setFileManageMode,
    setFileManageItems: modalState.setFileManageItems,
    setFileManageOpen: modalState.setFileManageOpen,
    handlePasteImage
  });

  const { handleAppDrop } = useWorkspaceDrop({
    videos,
    addLog,
    setToast,
    handleIngestPaths
  });

  const togglePopout = useCallback(async (id: string) => {
    const v = videos.find(x => x.id === id);
    if (!v) return;
    const effectivePath = (v.folderFiles && v.currentIdx !== undefined)
      ? (v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url)
      : v.realPath;
    const path = effectivePath || v.realPath || v.url;
    const { triggerPopOut } = await import('./utils/videoUtils');
    await triggerPopOut(path, v.title);
    addLog(`SYSTEM: Popped out window for "${v.title}"`);
  }, [videos, addLog]);

  if (isPopoutChecking) {
    return <div className="cosmo-boot" style={{ background: '#000' }} />;
  }

  if (fatalError) return <ErrorFallback error={fatalError} />;

  if (isPopout) {
    return <PopoutPlayer url={popoutUrl} />;
  }

  if (!isInitialized) {
    return (
      <div className="cosmo-boot">
        <div className="boot-nebula" />
        <div className="boot-content">
          <img src="/logo.png" className="boot-logo" alt="Cosmo Symphony" />
          <div className="boot-text">
            <h2>COSMO SYMPHONY</h2>
            <div className="boot-loader-bar">
              <div className="boot-loader-progress" />
            </div>
            <p>Initializing Symphony Orchestrator...</p>
            <div style={{ marginTop: '16px', fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', letterSpacing: '0.5px', WebkitFontSmoothing: 'antialiased' }}>
              🚀 Discover more professional tools & AI creative suites at <a href="https://cosmowhisper.com" onClick={handleOpenWebsite} style={{ color: 'var(--accent, #00ff88)', textDecoration: 'underline', fontWeight: 600, cursor: 'pointer' }}>cosmowhisper.com</a>
            </div>
            <button 
              className="boot-bypass-btn"
              onClick={() => setIsInitialized(true)} 
            >
              EMERGENCY BYPASS
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main 
      className={`app-root app-container ${immersive ? 'immersive-mode' : ''} ${!showImmersiveUI && immersive ? 'ghost-mode' : ''} ${isWindowMaximized ? 'window-maximized' : ''}`} 
      onClick={() => setMenu(null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleAppDrop}
    >
      <AppOverlays
        isPopout={isPopout}
        showShutdown={showShutdown}
        needsSetup={needsSetup}
        setNeedsSetup={setNeedsSetup}
        forceSetup={forceSetup}
        setForceSetup={setForceSetup}
        setAiHardwareStatus={setAiHardwareStatus}
        toast={toast}
        toastPath={toastPath}
        globalHud={globalHud}
        dragFile={dragFile}
        convertingStatus={convertingStatus}
      />

      <SoloPlayerWrapper
        focusedId={focusedId}
        setFocusedId={setFocusedId}
        exitSoloMode={exitSoloMode}
        videos={videos}
        setVideos={setVideos}
        onUpdateVideo={onUpdateVideo}
        globalRepeat={useStore.getState().globalRepeat}
        speed={speed}
        fitMode={fitMode}
        handleDecommission={handleDecommission}
        handleAnnihilate={handleAnnihilate}
        addLog={addLog}
        handleSelectAll={handleSelectAll}
        snapshotDir={snapshotDir}
        setSnapshotDir={setSnapshotDir}
        globalControl={globalControl}
        masterPlaying={masterPlaying}
        masterMuted={masterMuted}
        globalVolume={globalVolume}
        setGlobalVolume={setGlobalVolume}
        masterShowUI={masterShowUI}
        handleVideoEnded={handleVideoEnded}
        toggleMasterMute={toggleMasterMute}
        toggleMasterPlay={toggleMasterPlay}
        handleContext={handleContext}
        handleDeepFocus={handleDeepFocus}
        handleNavigateSibling={handleNavigateSibling}
        onAddVideo={onAddVideo}
        soloOverlayRef={soloOverlayRef}
        soloVolumeContainerRef={soloVolumeContainerRef}
        isSlideshowActive={isSlideshowActive}
        setIsSlideshowActive={setIsSlideshowActive}
        setColorAdjustId={setColorAdjustId}
        setGlobalControl={setGlobalControl}
        showImmersiveUI={showImmersiveUI}
        isFocusedImage={isFocusedImage}
        focusedVideo={focusedVideo}
        navDirection={navDirection}
        startFrameStep={startFrameStep}
        stopFrameStep={stopFrameStep}
        setMasterMuted={setMasterMuted}
        isStickerLoading={stickerLoadingId === focusedId}
        onCreateSticker={handleCreateSticker}
        onCancelSticker={handleCancelSticker}
        videoOps={videoOps}
      />

      <div className="hidden-precache-engine" style={{ display: 'none', width: 0, height: 0, visibility: 'hidden' }} aria-hidden="true">
        {cachedAssetUrls.map(url => (
          <img key={url} src={url} alt="pre-cache" />
        ))}
      </div>

      <AppWorkspaceLayout
        immersive={immersive}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        showCollageCanvas={showCollageCanvas}
        setShowCollageCanvas={setShowCollageCanvas}
        showCollections={showCollections}
        setShowCollections={setShowCollections}
        showLogs={showLogs}
        setShowLogs={setShowLogs}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showHelp={showHelp}
        setShowHelp={setShowHelp}
        handleSidebarAddFolder={handleSidebarAddFolder}
        filtered={filtered}
        collageItems={collageItems}
        setCollageItems={setCollageItems}
        collageConfig={collageConfig}
        setCollageConfig={setCollageConfig}
        onDeepFocus={handleDeepFocus}
        addLog={addLog}
        snapshotDir={snapshotDir}
        setSnapshotDir={setSnapshotDir}
        onAddVideo={onAddVideo}
        videos={videos}
        collections={collections}
        setVideos={setVideos}
        setCollections={setCollections}
        rotationInterval={rotationInterval}
        setRotationInterval={setRotationInterval}
        search={search}
        setSearch={setSearch}
        setGlobalControl={setGlobalControl}
        handleUpdate={handleUpdate}
        handleDecommission={handleDecommission}
        onToggleFocus={onToggleFocus}
        handleBatchRemove={handleBatchRemove}
        handleBatchMute={handleBatchMute}
        handleBatchPlay={handleBatchPlay}
        focusedId={focusedId}
        newCollectionName={newCollectionName}
        setNewCollectionName={setNewCollectionName}
        logs={logs}
        confirmDeletion={confirmDeletion}
        setConfirmDeletion={setConfirmDeletion}
        isPopout={isPopout}
        handleTriggerWifiShare={handleTriggerWifiShare}
        isSlideshowActive={isSlideshowActive}
        setIsSlideshowActive={setIsSlideshowActive}
        slideshowInterval={slideshowInterval}
        setSlideshowInterval={setSlideshowInterval}
        rotating={rotating}
        setRotating={setRotating}
        toggleMasterMute={toggleMasterMute}
        globalControl={globalControl}
        handlePurgeWorkspace={handlePurgeWorkspace}
        handleAddMediaFiles={handleAddMediaFiles}
        handleSelectAll={handleSelectAll}
        handleRefreshTiles={handleRefreshTiles}
        handlePasteImage={handlePasteImage}
        scrollRef={scrollRef}
        sortOrder={sortOrder}
        sensors={sensors}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        fitMode={fitMode}
        toggleSelect={toggleSelect}
        handleContext={handleContext}
        selectedIds={selectedIds}
        selectionMode={selectionMode}
        masterPlaying={masterPlaying}
        masterMuted={masterMuted}
        globalVolume={globalVolume}
        speed={speed}
        dragId={dragId}
        showImmersiveUI={showImmersiveUI}
        handleAnnihilate={handleAnnihilate}
        rowOffsets={rowOffsets}
      />

      <TelemetrySystem 
        videos={videos}
        masterPlaying={masterPlaying}
        masterMuted={masterMuted}
        globalVolume={globalVolume}
        speed={speed}
        fitMode={fitMode}
        globalRepeat={useStore.getState().globalRepeat}
        zoom={zoom}
        immersive={immersive}
      />

      {menu && (
        <ContextMenu 
          x={menu.x} 
          y={menu.y} 
          onClose={() => { setMenu(null); setMenuMetadata(null); }}
          video={videos.find(x => x.id === menu.id)!}
          metadata={menuMetadata}
          selectedCount={selectedIds.size}
          isFocused={focusedId === menu.id}
          isSelected={selectedIds.has(menu.id)}
          onAction={(action) => onContextMenuAction(action, menu.id)}
        />
      )}

      {bgMenu && (
        <BgContextMenu
          x={bgMenu.x}
          y={bgMenu.y}
          onClose={() => setBgMenu(null)}
          onAddFolder={handleSidebarAddFolder}
          onAddMedia={handleAddMediaFiles}
          onPurge={handlePurgeWorkspace}
          onSelectAll={handleSelectAll}
          onRefreshTiles={handleRefreshTiles}
          onPasteImage={() => handlePasteImage(null)}
        />
      )}

      <AnimatePresence>
        {colorAdjustId && (() => {
          const v = videos.find(x => x.id === colorAdjustId);
          return v ? (
            <ColorAdjustmentPanel
              key={colorAdjustId}
              video={v}
              onClose={() => setColorAdjustId(null)}
              onUpdateVideo={handleUpdate}
              setVideos={setVideos}
              addLog={addLog}
            />
          ) : null;
        })()}
      </AnimatePresence>

      <AppModalsContainer
        videos={videos}
        setVideos={setVideos}
        selectedIds={selectedIds}
        focusedId={focusedId}
        isCommandPaletteOpen={isCommandPaletteOpen}
        setIsCommandPaletteOpen={setIsCommandPaletteOpen}
        handleTriggerWifiShare={handleTriggerWifiShare}
        setColorAdjustId={setColorAdjustId}
        togglePopout={togglePopout}
        handlePurgeWorkspace={handlePurgeWorkspace}
        setShowHelp={setShowHelp}
        showHelp={showHelp}
        activeGridFolders={activeGridFolders}
        handleFileManagementSuccess={handleFileManagementSuccess}
        addLog={addLog}
        singleRenameTarget={singleRenameTarget}
        setSingleRenameTarget={setSingleRenameTarget}
        renameHistory={renameHistory}
        addToRenameHistory={addToRenameHistory}
        handleIngestPaths={handleIngestPaths}
        globalVolume={globalVolume}
        setGlobalVolume={setGlobalVolume}
        masterMuted={masterMuted}
        toggleMasterMute={toggleMasterMute}
        handleUpdate={handleUpdate}
        modalState={modalState}
        videoOps={videoOps}
      />
    </main>
  );
}
