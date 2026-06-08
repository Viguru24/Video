import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import type { VideoItem, RepeatMode } from '../types';
import { SortableVideoCard } from './SortableVideoCard';
import { useStore } from '../store/useStore';
import { isTauri } from '../utils/videoUtils';

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
  scrollRef: React.RefObject<HTMLDivElement | null>;
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
  onDeepFocus: (id: string, time?: number) => void;
  onReorder: (fromId: string, toId: string) => void;
  onToggleFocus: (id: string | null) => void;
  jumpToUnit: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, shiftKey?: boolean, ctrlKey?: boolean) => void;
  selectionMode: boolean;
  onNavigateSibling?: (direction: 1 | -1) => void;
  onSelectAll?: () => void;
  onUpscale?: (video: VideoItem) => void;
  enhancingVideoId?: string | null;
  isSlideshowActive?: boolean;
  setIsSlideshowActive?: (active: boolean) => void;
  onColorAdjust?: (id: string) => void;
  onStartCrop?: (id: string) => void;
  onAddVideo?: (newVideo: VideoItem) => void;
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
  onNavigateSibling,
  onSelectAll,
  onUpscale,
  enhancingVideoId,
  isSlideshowActive,
  setIsSlideshowActive,
  onColorAdjust,
  onStartCrop,
  onAddVideo
}: VideoGridProps) {
  const mediaMode = useStore((state) => state.mediaMode);
  const setZoom = useStore((state) => state.setZoom);
  const setSelectedIds = useStore((state) => state.setSelectedIds);
  const setSelectionMode = useStore((state) => state.setSelectionMode);

  // Check if touch device
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: isTouchDevice ? {
        delay: 250,
        tolerance: 5,
      } : {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Pinch to zoom grid logic
  const touchStartDist = useRef<number | null>(null);
  const touchStartZoom = useRef<number | null>(null);

  const handleGridTouchStart = (e: React.TouchEvent) => {
    if (focusedId) return; // Ignore when focused
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDist.current = dist;
      touchStartZoom.current = zoom;
    }
  };

  const handleGridTouchMove = (e: React.TouchEvent) => {
    if (focusedId) return; // Ignore when focused
    if (e.touches.length === 2 && touchStartDist.current !== null && touchStartZoom.current !== null) {
      if (e.cancelable) {
        e.preventDefault();
      }
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      
      const ratio = dist / touchStartDist.current;
      let delta = 0;
      if (ratio > 1.25) {
        delta = -1; // user pinching out (wants items bigger -> zoom decreases columns)
      } else if (ratio < 0.75) {
        delta = 1;  // user pinching in (wants items smaller -> zoom increases columns)
      }

      if (delta !== 0) {
        setZoom((prev) => {
          const next = prev + delta;
          return Math.max(1, Math.min(16, next));
        });
        touchStartDist.current = dist;
        touchStartZoom.current = zoom;
      }
    }
  };

  const handleGridTouchEnd = () => {
    touchStartDist.current = null;
    touchStartZoom.current = null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    onDragStart(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    onDragEnd(event);
  };

  const handleBackgroundDoubleClick = (e: React.MouseEvent) => {
    if (focusedId) return;
    
    // Check if the click target is the outer scroll area or the empty grid spaces
    const target = e.target as HTMLElement;
    if (
      target.classList.contains('video-scroll') ||
      target.classList.contains('video-grid-container') ||
      target.classList.contains('video-grid')
    ) {
      setSelectedIds(new Set());
      setSelectionMode(false);
      onLog("SELECTION RESET: Cleared all active selections");
    }
  };

  return (
    <>
      <div
        ref={scrollRef}
        className={`video-scroll ${focusedId ? 'focus-active' : ''} ${immersive ? 'immersive-active' : ''}`}
        onTouchStart={handleGridTouchStart}
        onTouchMove={handleGridTouchMove}
        onTouchEnd={handleGridTouchEnd}
        onDoubleClick={handleBackgroundDoubleClick}
      >
        {videos.length === 0 && (
          <div className="empty-grid-state">
            <Upload size={13} strokeWidth={2.5} style={{ opacity: 0.5, flexShrink: 0 }} />
            <h2>{mediaMode === 'picture' ? 'Drop pictures here' : 'Drop videos here'}</h2>
            <div style={{ marginTop: '12px', fontSize: '10px', opacity: 0.6 }}>
              Check out my other products at <a href="https://cosmowhisper.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #00ff88)', textDecoration: 'none', fontWeight: 600 }}>cosmowhisper.com</a>
            </div>
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
            <div className={`video-grid-container ${dragId ? 'global-dragging' : ''}`}>
              <div 
                className={`video-grid ${immersive ? 'no-gap' : ''}`}
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: `repeat(${zoom}, 1fr)`,
                  gap: immersive ? '0' : '20px',
                  padding: '20px',
                  width: '100%',
                  minHeight: '100vh'
                }}
              >
                {filtered.map((v) => (
                  <div key={v.id} className="virtuoso-grid-item" style={{ display: 'flex' }}>
                    <SortableVideoCard
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
                      onDeepFocus={(time) => onDeepFocus(v.id, time)}
                      onAnnihilate={() => onAnnihilate(v.id)}
                      isSelected={selectedIds.has(v.id)}
                      onToggleSelect={(shiftKey, ctrlKey) => onToggleSelect(v.id, shiftKey, ctrlKey)}
                      selectionMode={selectionMode}
                      onNavigateSibling={onNavigateSibling}
                      onSelectAll={onSelectAll}
                      onUpscale={onUpscale}
                      isAiEnhancing={enhancingVideoId === v.id}
                      isSlideshowActive={isSlideshowActive}
                      setIsSlideshowActive={setIsSlideshowActive}
                      onColorAdjust={onColorAdjust}
                      onStartCrop={onStartCrop}
                      onAddVideo={onAddVideo}
                    />
                  </div>
                ))}
              </div>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </>
  );
}
