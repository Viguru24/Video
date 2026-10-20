import React, { Suspense, lazy } from 'react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { VideoItem, CollageItem, CollageConfig, FitMode, SortOption } from '../types';
import { Sidebar } from './Sidebar';
import { ControlBar } from './ControlBar';
import { VideoGrid } from './VideoGrid';
import { SortableVideoCard } from './SortableVideoCard';

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

              <div className="grid-outer-scroll video-scroll" ref={scrollRef}>
                {sortOrder === 'custom' ? (
                  <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <SortableContext items={filtered.map(x => x.id)} strategy={rectSortingStrategy}>
                      <div className="video-grid-container sortable-mode" data-testid="sortable-grid">
                        {filtered.map((v, i) => (
                          <SortableVideoCard
                            key={v.id}
                            video={v}
                            index={i}
                            fitMode={fitMode}
                            onUpdateVideo={handleUpdate}
                            onRemoveVideo={handleDecommission}
                            onToggleFocus={onToggleFocus}
                            onSelect={toggleSelect}
                            onContext={handleContext}
                            isFocused={focusedId === v.id}
                            isSelected={selectedIds.has(v.id)}
                            isMultiSelectMode={selectionMode}
                            globalControl={globalControl}
                            addLog={addLog}
                            masterPlaying={masterPlaying}
                            masterMuted={masterMuted}
                            globalVolume={globalVolume}
                            snapshotDir={snapshotDir}
                            speed={speed}
                            isDragOverlay={dragId === v.id}
                            showImmersiveUI={showImmersiveUI}
                            onAnnihilate={handleAnnihilate}
                            onDeepFocus={onDeepFocus}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <VideoGrid 
                    videos={filtered}
                    focusedId={focusedId}
                    selectedIds={selectedIds}
                    selectionMode={selectionMode}
                    globalControl={globalControl}
                    masterPlaying={masterPlaying}
                    masterMuted={masterMuted}
                    globalVolume={globalVolume}
                    snapshotDir={snapshotDir}
                    speed={speed}
                    fitMode={fitMode}
                    onUpdateVideo={handleUpdate}
                    onRemoveVideo={handleDecommission}
                    onToggleFocus={onToggleFocus}
                    onSelect={toggleSelect}
                    onContext={handleContext}
                    onAnnihilate={handleAnnihilate}
                    onDeepFocus={onDeepFocus}
                    addLog={addLog}
                    showImmersiveUI={showImmersiveUI}
                    rowOffsets={rowOffsets}
                    onPasteImage={handlePasteImage}
                  />
                )}
              </div>
            </>
          )}
        </Suspense>
      </div>
    </div>
  );
}
