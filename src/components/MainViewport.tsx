import React, { Suspense, lazy } from 'react';
import type { VideoItem, RepeatMode, CollageItem, CollageConfig } from '../types';
import type { UseVideoOperationsReturn } from '../hooks/useVideoOperations';
import { normalizeMediaKey } from '../utils/videoUtils';
import { ControlBar } from './ControlBar';
import { VideoGrid } from './VideoGrid';
import { TelemetrySystem } from './TelemetrySystem';

const CollageWorkspace = lazy(() => import('./CollageWorkspace').then(m => ({ default: m.CollageWorkspace })));
const InAppBrowser = lazy(() => import('./InAppBrowser').then(m => ({ default: m.InAppBrowser })));

interface MainViewportProps {
  showCollageCanvas: boolean;
  videos: VideoItem[];
  filtered: VideoItem[];
  collageItems: CollageItem[];
  setCollageItems: React.Dispatch<React.SetStateAction<CollageItem[]>>;
  collageConfig: CollageConfig;
  setCollageConfig: React.Dispatch<React.SetStateAction<CollageConfig>>;
  handleDeepFocus: (id: string, time?: number) => void;
  addLog: (m: string) => void;
  snapshotDir: string;
  setSnapshotDir: (dir: string) => void;
  onAddVideo: (vid: VideoItem) => void;
  immersive: boolean;
  isPopout: boolean;
  collections: any;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  setCollections: any;
  rotationInterval: number;
  setRotationInterval: any;
  search: string;
  setSearch: any;
  setGlobalControl: any;
  handleUpdate: any;
  handleDecommission: any;
  onToggleFocus: any;
  handleBatchRemove: any;
  handleBatchMute: any;
  handleBatchPlay: any;
  focusedId: string | null;
  showSettings: boolean;
  setShowSettings: any;
  showCollections: boolean;
  setShowCollections: any;
  showLogs: boolean;
  setShowLogs: any;
  newCollectionName: string;
  setNewCollectionName: any;
  logs: any;
  confirmDeletion: boolean;
  setConfirmDeletion: any;
  showHelp: boolean;
  setShowHelp: any;
  handleTriggerWifiShare: () => void;
  isSlideshowActive: boolean;
  setIsSlideshowActive: any;
  slideshowInterval: number;
  setSlideshowInterval: any;
  rotating: boolean;
  setRotating: any;
  toggleMasterMute: any;
  globalControl: any;
  handlePurgeWorkspace: () => void;
  setForceSetup: (val: boolean) => void;
  setNeedsSetup: (val: boolean) => void;
  zoom: number;
  dragId: string | null;
  globalRepeat: RepeatMode;
  speed: number;
  fitMode: any;
  masterPlaying: boolean;
  masterMuted: boolean;
  globalVolume: number;
  showImmersiveUI: boolean;
  rowOffsets: number[];
  rotIdx: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  idToRow: Record<string, number>;
  handleDragStart: any;
  handleDragEnd: any;
  handleAnnihilate: any;
  handleFocus: (id: string) => void;
  setFocusedId: (id: string | null) => void;
  handleVideoEnded: any;
  toggleMasterPlay: any;
  handleContext: (id: string, x: number, y: number) => void;
  setBgMenu: (menu: { x: number; y: number } | null) => void;
  setMenu: (menu: any) => void;
  onReorder: any;
  jumpToUnit: (id: string) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string, shiftKey?: boolean, ctrlKey?: boolean) => void;
  handleSelectAll: () => void;
  selectionMode: boolean;
  handleNavigateSibling: (dir: 1 | -1) => void;
  videoOps?: UseVideoOperationsReturn;
  handleUpscale?: (v: VideoItem) => void;
  enhancingVideoId?: string | null;
  setColorAdjustId: (id: string | null) => void;
  setIsCropping?: (val: boolean) => void;
  setCropBox?: (box: { x: number; y: number; w: number; h: number }) => void;
  setAspectRatio?: (ratio: any) => void;
  stickerLoadingId: string | null;
  handleCreateSticker: (v: VideoItem) => void;
  handleCancelSticker: (id: string) => void;
  handleLoadDemos: () => void;
  handleIngestPaths: (paths: string[]) => Promise<void>;
}

export const MainViewport: React.FC<MainViewportProps> = ({
  showCollageCanvas,
  videos,
  filtered,
  collageItems,
  setCollageItems,
  collageConfig,
  setCollageConfig,
  handleDeepFocus,
  addLog,
  snapshotDir,
  setSnapshotDir,
  onAddVideo,
  immersive,
  isPopout,
  collections,
  setVideos,
  setCollections,
  rotationInterval,
  setRotationInterval,
  search,
  setSearch,
  setGlobalControl,
  handleUpdate,
  handleDecommission,
  onToggleFocus,
  handleBatchRemove,
  handleBatchMute,
  handleBatchPlay,
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
  confirmDeletion,
  setConfirmDeletion,
  showHelp,
  setShowHelp,
  handleTriggerWifiShare,
  isSlideshowActive,
  setIsSlideshowActive,
  slideshowInterval,
  setSlideshowInterval,
  rotating,
  setRotating,
  toggleMasterMute,
  globalControl,
  handlePurgeWorkspace,
  setForceSetup,
  setNeedsSetup,
  zoom,
  dragId,
  globalRepeat,
  speed,
  fitMode,
  masterPlaying,
  masterMuted,
  globalVolume,
  showImmersiveUI,
  rowOffsets,
  rotIdx,
  scrollRef,
  idToRow,
  handleDragStart,
  handleDragEnd,
  handleAnnihilate,
  handleFocus,
  setFocusedId,
  handleVideoEnded,
  toggleMasterPlay,
  handleContext,
  setBgMenu,
  setMenu,
  onReorder,
  jumpToUnit,
  selectedIds,
  toggleSelect,
  handleSelectAll,
  selectionMode,
  handleNavigateSibling,
  videoOps,
  handleUpscale,
  enhancingVideoId,
  setColorAdjustId,
  setIsCropping,
  setCropBox,
  setAspectRatio,
  stickerLoadingId,
  handleCreateSticker,
  handleCancelSticker,
  handleLoadDemos,
  handleIngestPaths,
}) => {
  const effectiveUpscale = videoOps ? videoOps.handleUpscale : handleUpscale;
  const effectiveEnhancingVideoId = videoOps ? videoOps.enhancingVideoId : enhancingVideoId;
  const effectiveSetIsCropping = videoOps ? videoOps.setIsCropping : setIsCropping;
  const effectiveSetCropBox = videoOps ? videoOps.setCropBox : setCropBox;
  const effectiveSetAspectRatio = videoOps ? videoOps.setAspectRatio : setAspectRatio;

  const handleOpenFileAndExpand = React.useCallback(async (path: string) => {
    const targetKey = normalizeMediaKey(path);
    const existing = videos.find(v => 
      (v.realPath && normalizeMediaKey(v.realPath) === targetKey) ||
      (v.url && normalizeMediaKey(v.url) === targetKey)
    );

    if (existing) {
      handleDeepFocus(existing.id);
    } else {
      const newItems = await handleIngestPaths([path]);
      if (newItems && newItems.length > 0) {
        handleDeepFocus(newItems[0].id);
      }
    }
  }, [videos, handleDeepFocus, handleIngestPaths]);

  return (
    <div className="main-viewport-wrapper">
      <Suspense fallback={null}>
        {showCollageCanvas ? (
          <CollageWorkspace
            videos={filtered}
            collageItems={collageItems}
            setCollageItems={setCollageItems}
            collageConfig={collageConfig}
            setCollageConfig={setCollageConfig}
            onDeepFocus={handleDeepFocus}
            addLog={addLog}
            snapshotDir={snapshotDir}
            setSnapshotDir={setSnapshotDir}
            onAddVideo={onAddVideo}
          />
        ) : (
          <>
            {!immersive && (
              <ControlBar
                videos={videos}
                collections={collections}
                setVideos={setVideos}
                setCollections={setCollections}
                rotationInterval={rotationInterval}
                setRotationInterval={setRotationInterval}
                snapshotDir={snapshotDir}
                setSnapshotDir={setSnapshotDir}
                search={search}
                setSearch={setSearch}
                setGlobalControl={setGlobalControl}
                addLog={addLog}
                onUpdateVideo={handleUpdate}
                onRemoveVideo={handleDecommission}
                onToggleFocus={onToggleFocus}
                onLog={addLog}
                onBatchRemove={handleBatchRemove}
                onBatchMute={handleBatchMute}
                onBatchPlay={handleBatchPlay}
                filtered={filtered}
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
                isPopout={isPopout}
                showHelp={showHelp}
                setShowHelp={setShowHelp}
                onOpenWifiShare={handleTriggerWifiShare}
                isSlideshowActive={isSlideshowActive}
                setIsSlideshowActive={setIsSlideshowActive}
                slideshowInterval={slideshowInterval}
                setSlideshowInterval={setSlideshowInterval}
                rotating={rotating}
                setRotating={setRotating}
                toggleMasterMute={toggleMasterMute}
                globalControl={globalControl}
                onPurgeWorkspace={handlePurgeWorkspace}
                onForceSetup={() => {
                  setForceSetup(true);
                  setNeedsSetup(true);
                }}
              />
            )}

            <VideoGrid
              videos={videos}
              filtered={filtered}
              zoom={zoom}
              immersive={immersive}
              focusedId={focusedId}
              dragId={dragId}
              globalRepeat={globalRepeat}
              globalSpeed={speed}
              fitMode={fitMode}
              masterPlaying={masterPlaying}
              masterMuted={masterMuted}
              globalVolume={globalVolume}
              showImmersiveUI={showImmersiveUI}
              snapshotDir={snapshotDir}
              setSnapshotDir={setSnapshotDir}
              globalControl={globalControl}
              rowOffsets={rowOffsets}
              rotIdx={rotIdx}
              rotating={rotating}
              scrollRef={scrollRef}
              idToRow={idToRow}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onUpdateVideo={handleUpdate}
              onRemoveVideo={handleDecommission}
              onAnnihilate={handleAnnihilate}
              onLog={addLog}
              onFocus={handleFocus}
              onCloseFocus={() => setFocusedId(null)}
              onEnded={handleVideoEnded}
              toggleMasterMute={toggleMasterMute}
              toggleMasterPlay={toggleMasterPlay}
              onContextMenu={handleContext}
              onBgContextMenu={(x, y) => {
                setBgMenu({ x, y });
                setMenu(null);
              }}
              onDeepFocus={handleDeepFocus}
              onReorder={onReorder}
              onToggleFocus={onToggleFocus}
              jumpToUnit={jumpToUnit}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onSelectAll={handleSelectAll}
              selectionMode={selectionMode}
              onNavigateSibling={handleNavigateSibling}
              onUpscale={effectiveUpscale}
              enhancingVideoId={effectiveEnhancingVideoId}
              isSlideshowActive={isSlideshowActive}
              setIsSlideshowActive={setIsSlideshowActive}
              onColorAdjust={(id) => setColorAdjustId(id)}
              onStartCrop={(id) => {
                setFocusedId(id);
                if (effectiveSetIsCropping) effectiveSetIsCropping(true);
                if (effectiveSetCropBox) effectiveSetCropBox({ x: 15, y: 15, w: 70, h: 70 });
                if (effectiveSetAspectRatio) effectiveSetAspectRatio('free');
              }}
              onAddVideo={onAddVideo}
              stickerLoadingId={stickerLoadingId}
              onCreateSticker={handleCreateSticker}
              onCancelSticker={handleCancelSticker}
              onLoadDemos={handleLoadDemos}
            />

            {!immersive && (
              <footer className="app-footer">
                <TelemetrySystem videosCount={videos.length} isPopout={isPopout} />
              </footer>
            )}

            <InAppBrowser 
              onAddFile={(path) => handleIngestPaths([path])}
              onOpenFile={handleOpenFileAndExpand}
              onAddMultipleFiles={handleIngestPaths}
              addLog={addLog}
            />
          </>
        )}
      </Suspense>
    </div>
  );
};
