import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import type { VideoItem, RepeatMode } from '../types';
import { SortableVideoCard } from './SortableVideoCard';

interface VideoGridProps {
  videos: VideoItem[];
  filtered: VideoItem[];
  zoom: number;
  immersive: boolean;
  focusedId: string | null;
  dragId: string | null;
  globalRepeat: RepeatMode;
  globalSpeed: number;
  fitMode: 'cover' | 'contain';
  masterPlaying: boolean;
  masterMuted: boolean;
  globalVolume: number;
  showImmersiveUI: boolean;
  snapshotDir?: string;
  setSnapshotDir?: (dir: string) => void;
  globalControl: string | null;
  rowOffsets: number[];
  rotIdx: number;
  rotating: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  idToRow: Record<string, number>;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  onRemoveVideo: (id: string) => void;
  onAnnihilate: (id: string) => void;
  onLog: (msg: string) => void;
  onFocus: (id: string) => void;
  onCloseFocus: () => void;
  onEnded: (id: string) => void;
  toggleMasterMute: (soloId?: string) => void;
  toggleMasterPlay: () => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onDeepFocus: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onToggleFocus: (id: string | null) => void;
  jumpToUnit: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  selectionMode: boolean;
}

export function VideoGrid({
  videos,
  filtered,
  zoom,
  immersive,
  focusedId,
  dragId,
  globalRepeat,
  globalSpeed,
  fitMode,
  masterPlaying,
  masterMuted,
  globalVolume,
  showImmersiveUI,
  snapshotDir,
  setSnapshotDir,
  globalControl,
  rowOffsets,
  rotIdx,
  rotating,
  scrollRef,
  idToRow,
  onDragStart,
  onDragEnd,
  onUpdateVideo,
  onRemoveVideo,
  onAnnihilate,
  onLog,
  onFocus,
  onCloseFocus,
  onEnded,
  toggleMasterMute,
  toggleMasterPlay,
  onContextMenu,
  onDeepFocus,
  onReorder,
  onToggleFocus,
  jumpToUnit,
  selectedIds,
  onToggleSelect,
  selectionMode,
}: VideoGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    onDragStart(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    onDragEnd(event);
  };

  return (
    <>
      <div
        ref={scrollRef}
        className={`video-scroll ${focusedId ? 'focus-active' : ''} ${immersive ? 'immersive-active' : ''}`}
      >
        {videos.length === 0 && (
          <div className="empty-grid-state">
            <div className="icon-large">
              <img src="/logo.png" style={{ width: '120px', height: '120px', opacity: 1 }} alt="Cosmo" />
            </div>
            <h2>DROP VIDEOS HERE</h2>
            <p>Drag and drop folders or video files to begin your symphony</p>
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filtered.map((v) => v.id)}
            strategy={rectSortingStrategy}
          >
            <div
              className={`video-grid ${immersive ? 'no-gap' : ''} ${dragId ? 'global-dragging' : ''}`}
              style={{ gridTemplateColumns: `repeat(${zoom}, 1fr)` }}
            >
              <AnimatePresence mode="popLayout">
                {filtered.map((v) => (
                  <SortableVideoCard
                    key={v.id}
                    video={v}
                    quality={focusedId === v.id ? 'high' : 'low'}
                    focusedId={focusedId}
                    globalRepeat={globalRepeat}
                    globalSpeed={globalSpeed}
                    fitMode={fitMode}
                    onUpdateVideo={onUpdateVideo}
                    onRemove={() => onRemoveVideo(v.id)}
                    onLog={onLog}
                    onFocus={() => onFocus(v.id)}
                    isFocused={focusedId === v.id}
                    onCloseFocus={onCloseFocus}
                    snapshotDir={snapshotDir}
                    setSnapshotDir={setSnapshotDir}
                    globalControl={globalControl}
                    masterPlaying={masterPlaying}
                    masterMuted={masterMuted}
                    globalVolume={globalVolume}
                    masterShowUI={showImmersiveUI}
                    onEnded={() => onEnded(v.id)}
                    toggleMasterMute={toggleMasterMute}
                    toggleMasterPlay={toggleMasterPlay}
                    onContextMenu={(x, y) => onContextMenu(v.id, x, y)}
                    onDeepFocus={() => onDeepFocus(v.id)}
                    onAnnihilate={() => onAnnihilate(v.id)}
                    
                    isSelected={selectedIds.has(v.id)}
                    onToggleSelect={() => onToggleSelect(v.id)}
                    selectionMode={selectionMode}
                  />
                ))}
              </AnimatePresence>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </>
  );
}
