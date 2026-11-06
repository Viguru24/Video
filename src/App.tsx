import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { VideoItem } from './types';
import { useStore } from './store/useStore';
import { ColorAdjustmentPanel } from './components/ColorAdjustmentPanel';

// Modular Components and Hooks
import { ErrorFallback } from './components/ErrorFallback';
import { MusicPlayerWidget } from './components/MusicPlayerWidget';
import { PopoutPlayer } from './components/PopoutPlayer';
import { AppContextMenus } from './components/AppContextMenus';
import { useTauriWindowEvents } from './hooks/useTauriWindowEvents';
import { useMediaImport } from './hooks/useMediaImport';
import { useMediaPlayback } from './hooks/useMediaPlayback';
import { useVideoOperations } from './hooks/useVideoOperations';
import { useStickerCreator } from './hooks/useStickerCreator';
import { useWorkspaceDnd } from './hooks/useWorkspaceDnd';
import { useDemoLoader } from './hooks/useDemoLoader';
import { Sidebar } from './components/Sidebar';
import { AppModals } from './components/AppModals';
import { BootScreen } from './components/BootScreen';
import { useAutoSyncFolders } from './hooks/useAutoSyncFolders';
import { useWorkspaceMediaOps } from './hooks/useWorkspaceMediaOps';
import { useContextMenuActions } from './hooks/useContextMenuActions';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { useClipboardImagePaste } from './hooks/useClipboardImagePaste';
import { useLaunchArgs } from './hooks/useLaunchArgs';
import { useSlideshowSync } from './hooks/useSlideshowSync';
import { useMenuMetadata } from './hooks/useMenuMetadata';
import { useSelectionManager } from './hooks/useSelectionManager';
import { useImmersiveControls } from './hooks/useImmersiveControls';
import { useSoloWheelControls } from './hooks/useSoloWheelControls';
import { useCollagePersistence } from './hooks/useCollagePersistence';
import { useQuickFoldersInit } from './hooks/useQuickFoldersInit';
import { useCustomDialogs } from './hooks/useCustomDialogs';
import { usePopoutState } from './hooks/usePopoutState';
import { useWifiTransfer } from './hooks/useWifiTransfer';
import { useFilteredVideos } from './hooks/useFilteredVideos';
import { useAppWorkspaceDrop } from './hooks/useAppWorkspaceDrop';
import { useFocusNavigation } from './hooks/useFocusNavigation';
import { useAppStartup } from './hooks/useAppStartup';
import { useGridZoomWheel } from './hooks/useGridZoomWheel';
import { useAppLogger } from './hooks/useAppLogger';
import { MainViewport } from './components/MainViewport';
import { AppCommandPaletteModal } from './components/AppCommandPaletteModal';
import { AppSoloViewport } from './components/AppSoloViewport';
import { AppTopOverlays } from './components/AppTopOverlays';

import { useWorkspacePersistence } from './hooks/useWorkspacePersistence';
import { useWorkspaceControls } from './hooks/useWorkspaceControls';
import { useIngestion } from './hooks/useIngestion';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSessionControl } from './hooks/useSessionControl';
import { useLayoutOrchestration } from './hooks/useLayoutOrchestration';
import { usePlaybackSync } from './hooks/usePlaybackSync';
import { MIN_ZOOM, MAX_ZOOM } from './constants';

export default function App() {
  const { 
    mediaMode, setMediaMode, 
    theme, 
    isFS, setIsFS, 
    masterPlaying, setMasterPlaying, 
    masterMuted, setMasterMuted, 
    globalVolume, setGlobalVolume, 
    speed, 
    globalRepeat, setGlobalRepeat, 
    fitMode, 
    zoom, setZoom, 
    immersive, setImmersive, 
    masterShowUI, setMasterShowUI, 
    selectedIds, setSelectedIds, 
    selectionMode, setSelectionMode, 
    renameHistory, addToRenameHistory, 
    setAiHardwareStatus, 
    enableOSFullscreen, 
    sortOrder, setSortOrder, 
    quickFolders, setQuickFolders, 
    autoSyncFolders, 
    slideshowInterval, setSlideshowInterval,
    colorTagFilter
  } = useStore();

  useQuickFoldersInit(quickFolders, setQuickFolders);

  const { isWindowMaximized } = useTauriWindowEvents();

  // App Startup Lifecycle & Hardware Setup
  const {
    needsSetup,
    setNeedsSetup,
    forceSetup,
    setForceSetup,
    handleOpenWebsite,
  } = useAppStartup({
    setAiHardwareStatus,
    addToRenameHistory,
  });

  const { isPopout, popoutUrl, isPopoutChecking } = usePopoutState();
  const { showShutdown } = useAppLifecycle(isPopout);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  // Collage Canvas Persistence Hook
  const {
    showCollageCanvas,
    setShowCollageCanvas,
    collageItems,
    setCollageItems,
    collageConfig,
    setCollageConfig,
  } = useCollagePersistence();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', sidebarCollapsed.toString());
  }, [sidebarCollapsed]);

  const [singleRenameTarget, setSingleRenameTarget] = useState<VideoItem | null>(null);

  useEffect(() => {
    localStorage.setItem('cosmo-media-mode', mediaMode);
  }, [mediaMode]);

  const [newCollectionName, setNewCollectionName] = useState('');
  const pendingScrollIdRef = useRef<string | null>(null);
  const isSlideshowActiveRef = useRef(false);
  const [fatalError] = useState<Error | null>(null);

  // App Logging, Toasts and Global HUD
  const {
    toast,
    setToast,
    toastPath,
    setToastPath,
    logs,
    addLog,
    globalHud,
    triggerGlobalHud,
  } = useAppLogger();

  // File System Management States
  const [fileManageOpen, setFileManageOpen] = useState(false);
  const [fileManageItems, setFileManageItems] = useState<VideoItem[]>([]);
  const [fileManageMode, setFileManageMode] = useState<'move' | 'copy'>('move');

  // Custom confirmation / prompt modal hooks
  const customDialogs = useCustomDialogs();

  const [navDirection, setNavDirection] = useState<1 | -1>(1);
  const masterPlayingRef = useRef(masterPlaying);
  const masterMutedRef = useRef(masterMuted);

  useEffect(() => {
    masterPlayingRef.current = masterPlaying;
  }, [masterPlaying]);

  useEffect(() => {
    masterMutedRef.current = masterMuted;
  }, [masterMuted]);

  const {
    videos, setVideos,
    collections, setCollections,
    rotationInterval, setRotationInterval,
    snapshotDir, setSnapshotDir,
    confirmDeletion, setConfirmDeletion,
    isInitialized, setIsInitialized
  } = useWorkspacePersistence(addLog, isPopout, masterMuted, masterPlaying);

  const {
    search, setSearch,
    focusedId, setFocusedId,
    rotating, setRotating,
    rotIdx, setRotIdx,
    setIdToRow: setWorkspaceIdToRow,
    setRowOffsets: setWorkspaceRowOffsets,
    onToggleFocus,
    jumpToUnit
  } = useWorkspaceControls(addLog);

  // Filtered Media & Active Grid Folders
  const { activeGridFolders, filtered } = useFilteredVideos({
    videos,
    mediaMode,
    search,
    sortOrder,
    colorTagFilter,
  });

  // Video Operations Hook
  const videoOps = useVideoOperations({
    focusedId,
    setFocusedId,
    focusedVideo: focusedId ? videos.find(v => v.id === focusedId) || null : null,
    mediaMode,
    setMediaMode,
    setVideos,
    addLog,
    setToast,
    setToastPath,
  });

  // Focus Navigation & Solo Viewport Hook
  const {
    exitSoloMode,
    handleFocus,
    handleDeepFocus,
    handleNavigateSibling,
    focusedVideo,
    isFocusedImage,
    isFocusedVideo,
  } = useFocusNavigation({
    videos,
    setVideos,
    filtered,
    focusedId,
    setFocusedId,
    jumpToUnit,
    pendingScrollIdRef,
    isSlideshowActiveRef,
    rotating,
    setRotating,
    enableOSFullscreen,
    setIsFS,
    setImmersive,
    masterMuted,
    setNavDirection,
    setIsCropping: videoOps.setIsCropping,
    setShowSaveCropOptions: videoOps.setShowSaveCropOptions,
    setShowSaveUpscaleOptions: videoOps.setShowSaveUpscaleOptions,
    setShowResizeModal: videoOps.setShowResizeModal,
    setColorAdjustId,
    setGlobalControl,
    addLog,
  });

  // Wi-Fi Mobile Transfer Hook
  const wifiTransfer = useWifiTransfer({
    videos,
    selectedIds,
    addLog,
  });

  // Clipboard Image Paste Hook
  const { handlePasteImage } = useClipboardImagePaste({
    focusedId,
    selectedIds,
    setVideos,
    setMediaMode,
    addLog,
    setToast,
  });

  const {
    processFolderConversion,
    handleSidebarAddFolder,
    handleAddMediaFiles,
    handleIngestPaths
  } = useMediaImport({
    mediaMode,
    setMediaMode,
    masterPlaying,
    masterMuted,
    setVideos,
    setSelectedIds,
    setFocusedId,
    setConvertingStatus,
    addLog
  });

  // Multi-Folder Auto-Sync Watcher Engine Hook
  const { clearPendingAutoAdd } = useAutoSyncFolders({
    autoSyncFolders,
    videos,
    setVideos,
    handleIngestPaths,
    addLog,
  });

  const { handleVideoEnded } = useMediaPlayback({
    globalRepeat,
    addLog,
    setVideos,
    focusedId,
    filtered,
    setFocusedId,
    masterMuted,
    setNavDirection
  });

  const {
    stickerLoadingId,
    handleCreateSticker,
    handleCancelSticker
  } = useStickerCreator({
    setVideos,
    setSortOrder,
    setFocusedId,
    addLog
  });

  const {
    dragId,
    dragFile,
    setDragFile,
    handleDragStart,
    handleDragEnd,
    onReorder
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

  const {
    onAddVideo,
    handleLoadDemos
  } = useDemoLoader({
    setVideos,
    addLog
  });

  // Workspace Media Operations Hook
  const {
    handleDecommission,
    handlePurgeWorkspace,
    handleRefreshTiles,
    handleAnnihilate,
    handleFileManagementSuccess,
    handleBatchRemove,
    handleBatchMute,
    handleBatchPlay,
  } = useWorkspaceMediaOps({
    videos,
    setVideos,
    selectedIds,
    setSelectedIds,
    setSelectionMode,
    focusedId,
    setFocusedId,
    filtered,
    confirmDeletion,
    fileManageMode,
    metadataCache: useRef<Record<string, any>>({}),
    exitSoloMode,
    clearPendingAutoAdd,
    setColorAdjustId,
    addLog,
    setToast,
  });

  // Launch Arguments Hook
  useLaunchArgs({
    isPopout,
    mediaMode,
    masterPlayingRef,
    masterMutedRef,
    setVideos,
    processFolderConversion,
    setConvertingStatus,
    addLog,
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Slideshow Sync Hook
  const {
    isSlideshowActive,
    setIsSlideshowActive,
    cachedAssetUrls,
  } = useSlideshowSync({
    focusedId,
    filtered,
    videos,
    isFocusedImage,
    isFocusedVideo,
    slideshowInterval,
    setFocusedId,
    setVideos,
    setImmersive,
    handleNavigateSibling,
    setToast,
    addLog,
  });
  isSlideshowActiveRef.current = isSlideshowActive;

  // Context Menu Metadata Hook
  const {
    menu,
    setMenu,
    menuMetadata,
    setMenuMetadata,
    metadataCache,
    handleContext,
  } = useMenuMetadata({
    videos,
    focusedId,
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

  // Selection Manager Hook
  const { toggleSelect, handleSelectAll } = useSelectionManager({
    videos,
    filtered,
    selectedIds,
    setSelectedIds,
    selectionMode,
    setSelectionMode,
    addLog,
  });

  const onUpdateVideo = handleUpdate;

  useGridZoomWheel({ setZoom, addLog });

  // Immersive Controls Hook
  const {
    showImmersiveUI,
    startFrameStep,
    stopFrameStep,
  } = useImmersiveControls({
    immersive,
    isFS,
    masterShowUI,
    setMasterShowUI,
    singleRenameTarget,
    videos,
    handleNavigateSibling,
    setGlobalControl,
  });

  const {
    rowOffsets,
    idToRow
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

  // Keyboard Shortcuts Hook
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
    setGlobalRepeat: (updater) => {
      if (typeof updater === 'function') {
        setGlobalRepeat(updater(globalRepeat));
      } else {
        setGlobalRepeat(updater);
      }
    },
    setGlobalControl,
    setZoom,
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
    jumpToUnit,
    onDeepFocus: handleDeepFocus,
    triggerGlobalHud
  });

  // Ingestion Hook
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

  // Solo Wheel Controls Hook
  const { soloOverlayRef, soloVolumeContainerRef } = useSoloWheelControls({
    focusedId,
    videos,
    handleUpdate,
    handleNavigateSibling,
    addLog,
    setGlobalVolume,
    onUpdateVideo,
  });

  // Context Menu Actions Hook
  const { handleContextMenuAction } = useContextMenuActions({
    menu,
    videos,
    setVideos,
    selectedIds,
    setSelectedIds,
    setSelectionMode,
    toggleSelect,
    handleSelectAll,
    focusedId,
    setFocusedId,
    setImmersive,
    setIsFS,
    filtered,
    confirmDeletion,
    onUpdateVideo,
    handleDecommission,
    handleBatchRemove,
    handleNavigateSibling,
    handleResize: videoOps.handleResize,
    handleUpscale: videoOps.handleUpscale,
    handleInterpolate60Fps: videoOps.handleInterpolate60Fps,
    handleCreateSticker,
    handlePasteImage,
    handleTriggerWifiShare: wifiTransfer.handleTriggerWifiShare,
    onToggleFocus,
    setIsCropping: videoOps.setIsCropping,
    setCropBox: videoOps.setCropBox,
    setAspectRatio: videoOps.setAspectRatio,
    setColorAdjustId,
    setGlobalControl,
    setSingleRenameTarget,
    setFileManageMode,
    setFileManageItems,
    setFileManageOpen,
    setCollections,
    setCollageItems,
    metadataCache,
    addLog,
    setToast,
    setMenu,
    setMenuMetadata,
  });

  // Drag and drop onto main workspace root
  const { handleWorkspaceDrop } = useAppWorkspaceDrop({
    videos,
    handleIngestPaths,
    addLog,
    setToast,
  });

  if (isPopoutChecking) {
    return <div className="cosmo-boot" style={{ background: '#000' }} />;
  }

  if (fatalError) return <ErrorFallback error={fatalError} />;

  if (isPopout) {
    return <PopoutPlayer url={popoutUrl} />;
  }

  if (!isInitialized) {
    return (
      <BootScreen
        onBypass={() => setIsInitialized(true)}
        onOpenWebsite={handleOpenWebsite}
      />
    );
  }

  return (
    <main 
      className={`app-root app-container ${immersive ? 'immersive-mode' : ''} ${!showImmersiveUI && immersive ? 'ghost-mode' : ''} ${isWindowMaximized ? 'window-maximized' : ''}`} 
      onClick={() => setMenu(null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleWorkspaceDrop}
    >
      <AppTopOverlays
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

      <AppSoloViewport
        focusedId={focusedId}
        setFocusedId={setFocusedId}
        exitSoloMode={exitSoloMode}
        videos={videos}
        setVideos={setVideos}
        onUpdateVideo={onUpdateVideo}
        globalRepeat={globalRepeat}
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
        videoOps={videoOps}
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
        stickerLoadingId={stickerLoadingId}
        handleCreateSticker={handleCreateSticker}
        handleCancelSticker={handleCancelSticker}
        cachedAssetUrls={cachedAssetUrls}
      />

      <div className="app-layout-wrapper">
        {!immersive && (
          <Sidebar
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
          />
        )}

        {/* Right Viewport wrapper */}
        <MainViewport
          showCollageCanvas={showCollageCanvas}
          videos={videos}
          filtered={filtered}
          collageItems={collageItems}
          setCollageItems={setCollageItems}
          collageConfig={collageConfig}
          setCollageConfig={setCollageConfig}
          handleDeepFocus={handleDeepFocus}
          addLog={addLog}
          snapshotDir={snapshotDir}
          setSnapshotDir={setSnapshotDir}
          onAddVideo={onAddVideo}
          immersive={immersive}
          isPopout={isPopout}
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
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          showCollections={showCollections}
          setShowCollections={setShowCollections}
          showLogs={showLogs}
          setShowLogs={setShowLogs}
          newCollectionName={newCollectionName}
          setNewCollectionName={setNewCollectionName}
          logs={logs}
          confirmDeletion={confirmDeletion}
          setConfirmDeletion={setConfirmDeletion}
          showHelp={showHelp}
          setShowHelp={setShowHelp}
          handleTriggerWifiShare={() => wifiTransfer.handleTriggerWifiShare()}
          isSlideshowActive={isSlideshowActive}
          setIsSlideshowActive={setIsSlideshowActive}
          slideshowInterval={slideshowInterval}
          setSlideshowInterval={setSlideshowInterval}
          rotating={rotating}
          setRotating={setRotating}
          toggleMasterMute={toggleMasterMute}
          globalControl={globalControl}
          handlePurgeWorkspace={handlePurgeWorkspace}
          setForceSetup={setForceSetup}
          setNeedsSetup={setNeedsSetup}
          zoom={zoom}
          dragId={dragId}
          globalRepeat={globalRepeat}
          speed={speed}
          fitMode={fitMode}
          masterPlaying={masterPlaying}
          masterMuted={masterMuted}
          globalVolume={globalVolume}
          showImmersiveUI={showImmersiveUI}
          rowOffsets={rowOffsets}
          rotIdx={rotIdx}
          scrollRef={scrollRef}
          idToRow={idToRow}
          handleDragStart={handleDragStart}
          handleDragEnd={handleDragEnd}
          handleAnnihilate={handleAnnihilate}
          handleFocus={handleFocus}
          setFocusedId={setFocusedId}
          handleVideoEnded={handleVideoEnded}
          toggleMasterPlay={toggleMasterPlay}
          handleContext={handleContext}
          setBgMenu={setBgMenu}
          setMenu={setMenu}
          onReorder={onReorder}
          jumpToUnit={jumpToUnit}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
          handleSelectAll={handleSelectAll}
          selectionMode={selectionMode}
          handleNavigateSibling={handleNavigateSibling}
          videoOps={videoOps}
          setColorAdjustId={setColorAdjustId}
          stickerLoadingId={stickerLoadingId}
          handleCreateSticker={handleCreateSticker}
          handleCancelSticker={handleCancelSticker}
          handleLoadDemos={handleLoadDemos}
          handleIngestPaths={handleIngestPaths}
        />
      </div>

      <AppContextMenus
        menu={menu}
        setMenu={setMenu}
        menuMetadata={menuMetadata}
        setMenuMetadata={setMenuMetadata}
        videos={videos}
        selectedIds={selectedIds}
        focusedId={focusedId}
        handleContextMenuAction={handleContextMenuAction}
        bgMenu={bgMenu}
        setBgMenu={setBgMenu}
        handleSidebarAddFolder={handleSidebarAddFolder}
        handleAddMediaFiles={handleAddMediaFiles}
        handlePurgeWorkspace={handlePurgeWorkspace}
        handleSelectAll={handleSelectAll}
        handleRefreshTiles={handleRefreshTiles}
        handlePasteImage={handlePasteImage}
      />

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

      <MusicPlayerWidget videos={videos} setVideos={setVideos} />

      <AppCommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        videos={videos}
        selectedIds={selectedIds}
        focusedId={focusedId}
        handleTriggerWifiShare={wifiTransfer.handleTriggerWifiShare}
        setColorAdjustId={setColorAdjustId}
        setShowResizeModal={videoOps.setShowResizeModal}
        setShowSaveCropOptions={videoOps.setShowSaveCropOptions}
        handlePurgeWorkspace={handlePurgeWorkspace}
        setVolumeRepeatOpen={wifiTransfer.setVolumeRepeatOpen}
        setShowHelp={setShowHelp}
      />

      <AppModals
        showHelp={showHelp}
        setShowHelp={setShowHelp}
        fileManageOpen={fileManageOpen}
        setFileManageOpen={setFileManageOpen}
        fileManageItems={fileManageItems}
        fileManageMode={fileManageMode}
        activeGridFolders={activeGridFolders}
        handleFileManagementSuccess={handleFileManagementSuccess}
        addLog={addLog}
        singleRenameTarget={singleRenameTarget}
        setSingleRenameTarget={setSingleRenameTarget}
        renameHistory={renameHistory}
        addToRenameHistory={addToRenameHistory}
        setVideos={setVideos}
        videoOps={videoOps}
        customDialogs={customDialogs}
        wifiTransfer={wifiTransfer}
        handleIngestPaths={handleIngestPaths}
        globalVolume={globalVolume}
        setGlobalVolume={setGlobalVolume}
        masterMuted={masterMuted}
        toggleMasterMute={toggleMasterMute}
        globalRepeat={globalRepeat}
        setGlobalRepeat={setGlobalRepeat}
        videos={videos}
        handleUpdate={handleUpdate}
      />
    </main>
  );
}
