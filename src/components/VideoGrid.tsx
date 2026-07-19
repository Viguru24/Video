import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
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
  stickerLoadingId?: string | null;
  onCreateSticker?: (video: VideoItem) => void;
  onCancelSticker?: () => void;
  onBgContextMenu: (x: number, y: number) => void;
  onLoadDemos: () => void;
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
  onAddVideo,
  stickerLoadingId,
  onCreateSticker,
  onCancelSticker,
  onBgContextMenu,
  onLoadDemos
}: VideoGridProps) {
  const mediaMode = useStore((state) => state.mediaMode);
  const setZoom = useStore((state) => state.setZoom);
  const setSelectedIds = useStore((state) => state.setSelectedIds);
  const setSelectionMode = useStore((state) => state.setSelectionMode);

  const handleOpenWebsite = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await invoke('open_external_url', { url: 'https://cosmowhisper.com' });
    } catch (err) {
      console.error("Failed to open URL via backend invoke:", err);
      try {
        await openUrl('https://cosmowhisper.com');
      } catch (err2) {
        console.error("Failed to open URL via Tauri openUrl plugin:", err2);
        window.open('https://cosmowhisper.com', '_blank', 'noopener,noreferrer');
      }
    }
  };

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

  const handleBgContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.classList.contains('video-scroll') ||
      target.classList.contains('video-grid-container') ||
      target.classList.contains('video-grid') ||
      target.classList.contains('empty-grid-state')
    ) {
      e.preventDefault();
      onBgContextMenu(e.clientX, e.clientY);
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
        onContextMenu={handleBgContextMenu}
      >
        {videos.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '80vh',
            color: '#fff',
            padding: '24px',
            fontFamily: 'system-ui, sans-serif'
          }}>
            {/* Onboarding Dashboard */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '30px 40px',
              maxWidth: '800px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px'
            }}>
              {/* Header */}
              <div style={{ textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                  <img src="/logo.png" style={{ height: '24px', objectFit: 'contain' }} alt="Cosmo" />
                  <h1 style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '2px', margin: 0, background: 'linear-gradient(90deg, #fff 0%, #a855f7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    COSMO SYMPHONY
                  </h1>
                </div>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px', margin: 0 }}>
                  A professional multi-video & image orchestration workspace.
                </p>
              </div>

              {/* Feature Cards Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
                marginTop: '8px'
              }}>
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px' }}>
                  <h3 style={{ fontSize: '12px', color: 'var(--accent, #00ff88)', margin: '0 0 6px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📂</span> BUILT-IN FILE BROWSER
                  </h3>
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', margin: 0 }}>
                    Skip Windows Explorer! Drag & drop folder directories or individual media files directly from our fast, integrated Side Browser.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px' }}>
                  <h3 style={{ fontSize: '12px', color: 'var(--accent, #00ff88)', margin: '0 0 6px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🔍</span> INTERACTIVE POINTER ZOOM
                  </h3>
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', margin: 0 }}>
                    Hover your mouse over any image or video tile, and scroll your wheel to zoom directly into where your cursor is pointing!
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px' }}>
                  <h3 style={{ fontSize: '12px', color: 'var(--accent, #00ff88)', margin: '0 0 6px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚡</span> AI ENHANCE & RESCALE
                  </h3>
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', margin: 0 }}>
                    Right-click tiles to upscale low-res content using local AI models, crop-resize, adjust temperature, contrast, RGB color balances, or flip media on the fly.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px' }}>
                  <h3 style={{ fontSize: '12px', color: 'var(--accent, #00ff88)', margin: '0 0 6px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🎹</span> PRO KEYBOARD SHORTCUTS
                  </h3>
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', margin: 0 }}>
                    Use quick shortcuts: <kbd style={{ background: '#333', padding: '1px 4px', borderRadius: '3px', fontSize: '9px' }}>L</kbd> to cycle Loop modes, <kbd style={{ background: '#333', padding: '1px 4px', borderRadius: '3px', fontSize: '9px' }}>Space</kbd> for master play/pause, and <kbd style={{ background: '#333', padding: '1px 4px', borderRadius: '3px', fontSize: '9px' }}>F</kbd> for Fullscreen.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px' }}>
                  <h3 style={{ fontSize: '12px', color: 'var(--accent, #00ff88)', margin: '0 0 6px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🌐</span> WI-FI SHARE PROTOCOL
                  </h3>
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', margin: 0 }}>
                    Scan the layout QR code or link your phone. Instantly share files between devices or upload media back to your PC over local Wi-Fi!
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px' }}>
                  <h3 style={{ fontSize: '12px', color: 'var(--accent, #00ff88)', margin: '0 0 6px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🖥️</span> MULTI-MONITOR SPANNING
                  </h3>
                  <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', margin: 0 }}>
                    Instantly expand your video workspace across all connected monitors or TVs with a single click, or return to single-window view dynamically.
                  </p>
                </div>
              </div>

              {/* Action Section */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                marginTop: '10px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: '20px'
              }}>
                <button
                  onClick={onLoadDemos}
                  style={{
                    background: 'rgba(0, 255, 136, 0.08)',
                    border: '1px solid var(--accent, #00ff88)',
                    boxShadow: '0 0 15px rgba(0, 255, 136, 0.15)',
                    borderRadius: '8px',
                    color: 'var(--accent, #00ff88)',
                    padding: '10px 24px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    letterSpacing: '1px',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--accent, #00ff88)';
                    e.currentTarget.style.color = '#000';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(0, 255, 136, 0.08)';
                    e.currentTarget.style.color = 'var(--accent, #00ff88)';
                  }}
                >
                  🌟 Load Demo Workspace
                </button>
                <div style={{
                  border: '1.5px dashed rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  width: '100%',
                  padding: '24px',
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontSize: '11px',
                  fontWeight: 600
                }}>
                  Or drag and drop your media files directly here to start!
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '20px', fontSize: '10.5px', opacity: 0.75, letterSpacing: '0.5px' }}>
              🚀 Discover more professional tools & AI creative suites at <a href="https://cosmowhisper.com" onClick={handleOpenWebsite} style={{ color: 'var(--accent, #00ff88)', textDecoration: 'underline', fontWeight: 600 }}>cosmowhisper.com</a>
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
                      isStickerLoading={stickerLoadingId === v.id}
                      onCreateSticker={onCreateSticker}
                      onCancelSticker={onCancelSticker}
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
