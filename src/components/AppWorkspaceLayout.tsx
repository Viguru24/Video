import { useStore } from '../store/useStore';
import React, { Suspense, lazy } from 'react';
import type { VideoItem, CollageItem, CollageConfig, FitMode, SortOption } from '../types';
import { Sidebar } from './Sidebar';
import { ControlBar } from './ControlBar';
import { VideoGrid } from './VideoGrid';

const CollageWorkspace = lazy(() => import('./CollageWorkspace').then(m => ({ default: m.CollageWorkspace })));

interface AppWorkspaceLayoutProps {
  immersive: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  showCollageCanvas: boolean;
  setShowCollageCanvas: (v: boolean) => void;
  showCollections: boolean;
  setShowCollections: (v: boolean) => void;
  showLogs: boolean;
  setShowLogs: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showHelp: boolean;
  setShowHelp: (v: boolean) => void;
  handleSidebarAddFolder: () => void;
  filtered: VideoItem[];
  collageItems: CollageItem[];
  setCollageItems: (items: CollageItem[]) => void;
  collageConfig: CollageConfig;
  setCollageConfig: (cfg: CollageConfig) => void;
  onDeepFocus: (id: string, time?: number) => void;
  addLog: (msg: string) => void;
  snapshotDir: string;
  setSnapshotDir: (dir: string) => void;
  onAddVideo: (files: File[]) => void;
  videos: VideoItem[];
  collections: any[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  setCollections: (cols: any[]) => void;
  rotationInterval: number;
  setRotationInterval: (r: number) => void;
  search: string;
  setSearch: (s: string) => void;
  setGlobalControl: (ctl: string | null) => void;
  handleUpdate: (idOrIds: string | string[], updates: any) => void;
  handleDecommission: (id: string) => void;
  onToggleFocus: (id: string) => void;
  handleBatchRemove: () => void;
  handleBatchMute: (muteState: boolean) => void;
  handleBatchPlay: (playState: boolean) => void;
  focusedId: string | null;
  newCollectionName: string;
  setNewCollectionName: (n: string) => void;
  logs: string[];
  confirmDeletion: boolean;
  setConfirmDeletion: (c: boolean) => void;
  isPopout: boolean;
  handleTriggerWifiShare: () => void;
  isSlideshowActive: boolean;
  setIsSlideshowActive: (active: boolean) => void;
  slideshowInterval: number;
  setSlideshowInterval: (i: number) => void;
  rotating: boolean;
  setRotating: (r: boolean) => void;
  toggleMasterMute: () => void;
  globalControl: string | null;
  handlePurgeWorkspace: () => void;
  handleAddMediaFiles: () => void;
  handleSelectAll: () => void;
  handleRefreshTiles: () => void;
  handlePasteImage: (targetTileId?: string | null) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  sortOrder: SortOption;
  sensors: any;
  handleDragStart: (e: any) => void;
  handleDragEnd: (e: any) => void;
  fitMode: FitMode;
  toggleSelect: (id: string, shiftKey?: boolean, ctrlKey?: boolean) => void;
  handleContext: (id: string, x: number, y: number) => void;
  selectedIds: Set<string>;
  selectionMode: boolean;
  masterPlaying: boolean;
  masterMuted: boolean;
  globalVolume: number;
  speed: number;
  dragId: string | null;
  showImmersiveUI: boolean;
  handleAnnihilate: (id: string) => void;
  rowOffsets: number[];
}

export function AppWorkspaceLayout({
  immersive,
  sidebarCollapsed,
  setSidebarCollapsed,
  showCollageCanvas,
  setShowCollageCanvas,
  showCollections,
  setShowCollections,
  showLogs,
  setShowLogs,
  showSettings,
  setShowSettings,
  showHelp,
  setShowHelp,
  handleSidebarAddFolder,
  filtered,
  collageItems,
  setCollageItems,
  collageConfig,
  setCollageConfig,
  onDeepFocus,
  addLog,
  snapshotDir,
  setSnapshotDir,
  onAddVideo,
  videos,
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
  newCollectionName,
  setNewCollectionName,
  logs,
  confirmDeletion,
  setConfirmDeletion,
  isPopout,
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
  handleAddMediaFiles,
  handleSelectAll,
  handleRefreshTiles,
  handlePasteImage,
  scrollRef,
  sortOrder,
  sensors,
  handleDragStart,
  handleDragEnd,
  fitMode,
  toggleSelect,
  handleContext,
  selectedIds,
  selectionMode,
  masterPlaying,
  masterMuted,
  globalVolume,
  speed,
  dragId,
  showImmersiveUI,
  handleAnnihilate,
  rowOffsets
}: AppWorkspaceLayoutProps) {
  return (
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

      <div className="main-viewport-wrapper">
        <Suspense fallback={null}>
          {showCollageCanvas ? (
            <CollageWorkspace
              videos={filtered}
              collageItems={collageItems}
              setCollageItems={setCollageItems}
              collageConfig={collageConfig}
              setCollageConfig={setCollageConfig}
              onDeepFocus={onDeepFocus}
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
                  onAddFolder={handleSidebarAddFolder}
                  onAddMediaFiles={handleAddMediaFiles}
                  onSelectAll={handleSelectAll}
                  onRefreshTiles={handleRefreshTiles}
                  onPasteImage={() => handlePasteImage(null)}
                />
              )}

              <VideoGrid 
                videos={videos}
                filtered={filtered}
                zoom={useStore.getState().zoom}
                immersive={immersive}
                focusedId={focusedId}
                dragId={dragId}
                globalRepeat={useStore.getState().globalRepeat}
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
                rotIdx={0}
                rotating={rotating}
                scrollRef={scrollRef}
                idToRow={{}}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onUpdateVideo={handleUpdate}
                onRemoveVideo={handleDecommission}
                onAnnihilate={handleAnnihilate}
                onLog={addLog}
                onFocus={(id) => onToggleFocus(id)}
                onCloseFocus={() => onToggleFocus(null)}
                onEnded={() => {}}
                toggleMasterMute={toggleMasterMute}
                toggleMasterPlay={() => {}}
                onContextMenu={(id, x, y) => handleContext(id, x, y)}
                onDeepFocus={onDeepFocus}
                onReorder={() => {}}
                onToggleFocus={onToggleFocus}
                jumpToUnit={() => {}}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectAll={handleSelectAll}
                selectionMode={selectionMode}
                onNavigateSibling={() => {}}
                onUpscale={() => {}}
                isSlideshowActive={isSlideshowActive}
                setIsSlideshowActive={setIsSlideshowActive}
                onColorAdjust={() => {}}
                onStartCrop={() => {}}
                onAddVideo={onAddVideo as any}
                onBgContextMenu={() => {}}
                onLoadDemos={() => {}}
              />
            </>
          )}
        </Suspense>
      </div>
    </div>
  );
}
