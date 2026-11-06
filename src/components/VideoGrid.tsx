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
            color: '#f4f4f5',
            padding: '24px',
            fontFamily: 'var(--font)'
          }}>
            {/* 3D Machined Studio Onboarding Console */}
            <div style={{
              background: 'var(--glass-bg, linear-gradient(180deg, rgba(26, 26, 32, 0.96) 0%, rgba(14, 14, 18, 0.98) 100%))',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.11)',
              borderRadius: '18px',
              padding: '32px 40px',
              maxWidth: '840px',
              width: '100%',
              boxShadow: 'var(--bevel-panel)',
              display: 'flex',
              flexDirection: 'column',
              gap: '22px'
            }}>
              {/* Header */}
              <div style={{ textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
                  <img src="/logo.png" style={{ height: '26px', objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} alt="Cosmo" />
                  <h1 style={{ fontSize: '21px', fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '2.5px', margin: 0, background: 'linear-gradient(90deg, #ffffff 0%, var(--accent-bright, #34d399) 62%, #fbbf24 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    COSMO SYMPHONY
                  </h1>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '1.2px', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '5px', padding: '2px 7px' }}>
                    STUDIO DECK
                  </span>
                </div>
                <p style={{ fontSize: '11.5px', color: '#a1a1aa', letterSpacing: '0.4px', margin: 0 }}>
                  Precision multi-stream cinema reference monitor & optical AI workspace.
                </p>
              </div>

              {/* Feature Cards Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '14px',
                marginTop: '4px'
              }}>
                <div style={{ padding: '15px', background: 'var(--bg-well, #060608)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'var(--well-recessed)', borderRadius: '11px' }}>
                  <h3 style={{ fontSize: '11.5px', fontFamily: 'var(--font-display)', letterSpacing: '0.6px', color: 'var(--accent-bright, #34d399)', margin: '0 0 6px 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📂</span> BUILT-IN RACK BROWSER
                  </h3>
                  <p style={{ fontSize: '10.5px', color: '#a1a1aa', lineHeight: '1.45', margin: 0 }}>
                    Skip Explorer. Drag & drop directories or individual clips directly from the integrated left-hand media bay.
                  </p>
                </div>

                <div style={{ padding: '15px', background: 'var(--bg-well, #060608)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'var(--well-recessed)', borderRadius: '11px' }}>
                  <h3 style={{ fontSize: '11.5px', fontFamily: 'var(--font-display)', letterSpacing: '0.6px', color: 'var(--accent-bright, #34d399)', margin: '0 0 6px 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🔍</span> OPTICAL CURSOR ZOOM
                  </h3>
                  <p style={{ fontSize: '10.5px', color: '#a1a1aa', lineHeight: '1.45', margin: 0 }}>
                    Hover over any monitor bezel and scroll to inspect pixel grain right under your pointer at up to 8x magnification.
                  </p>
                </div>

                <div style={{ padding: '15px', background: 'var(--bg-well, #060608)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'var(--well-recessed)', borderRadius: '11px' }}>
                  <h3 style={{ fontSize: '11.5px', fontFamily: 'var(--font-display)', letterSpacing: '0.6px', color: '#fbbf24', margin: '0 0 6px 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚡</span> AI UPSCALE & COLOR GRADE
                  </h3>
                  <p style={{ fontSize: '10.5px', color: '#a1a1aa', lineHeight: '1.45', margin: 0 }}>
                    Right-click any monitor for local GPU AI upscaling, 60fps optical flow, split-diff inspection, or RGB color grading.
                  </p>
                </div>

                <div style={{ padding: '15px', background: 'var(--bg-well, #060608)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'var(--well-recessed)', borderRadius: '11px' }}>
                  <h3 style={{ fontSize: '11.5px', fontFamily: 'var(--font-display)', letterSpacing: '0.6px', color: 'var(--accent-bright, #34d399)', margin: '0 0 6px 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🎹</span> TACTILE DECK HOTKEYS
                  </h3>
                  <p style={{ fontSize: '10.5px', color: '#a1a1aa', lineHeight: '1.45', margin: 0 }}>
                    Press <kbd style={{ background: '#18181c', color: '#fbbf24', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 2px 0 #050507', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>Space</kbd> for master transport, <kbd style={{ background: '#18181c', color: '#fbbf24', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 2px 0 #050507', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>L</kbd> to loop, and <kbd style={{ background: '#18181c', color: '#fbbf24', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 2px 0 #050507', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>F</kbd> for fullscreen.
                  </p>
                </div>

                <div style={{ padding: '15px', background: 'var(--bg-well, #060608)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'var(--well-recessed)', borderRadius: '11px' }}>
                  <h3 style={{ fontSize: '11.5px', fontFamily: 'var(--font-display)', letterSpacing: '0.6px', color: 'var(--accent-bright, #34d399)', margin: '0 0 6px 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🌐</span> LOCAL WI-FI BRIDGE
                  </h3>
                  <p style={{ fontSize: '10.5px', color: '#a1a1aa', lineHeight: '1.45', margin: 0 }}>
                    Scan the studio QR link to beam clips or stills between mobile devices and your workstation at full LAN speed.
                  </p>
                </div>

                <div style={{ padding: '15px', background: 'var(--bg-well, #060608)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'var(--well-recessed)', borderRadius: '11px' }}>
                  <h3 style={{ fontSize: '11.5px', fontFamily: 'var(--font-display)', letterSpacing: '0.6px', color: '#fbbf24', margin: '0 0 6px 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🖥️</span> MULTI-DISPLAY WALL
                  </h3>
                  <p style={{ fontSize: '10.5px', color: '#a1a1aa', lineHeight: '1.45', margin: 0 }}>
                    Span your synchronized monitor wall across dual or triple displays in a single click from the window deck.
                  </p>
                </div>
              </div>

              {/* Action Section */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '14px',
                marginTop: '6px',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                paddingTop: '20px'
              }}>
                <button
                  onClick={onLoadDemos}
                  style={{
                    background: 'linear-gradient(180deg, var(--accent-bright, #34d399) 0%, var(--accent, #10b981) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.35)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 6px 20px rgba(16, 185, 129, 0.28), 0 2px 4px rgba(0,0,0,0.85)',
                    borderRadius: '9px',
                    color: '#050505',
                    padding: '11px 28px',
                    fontSize: '11.5px',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    letterSpacing: '1.2px',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.16s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.filter = 'brightness(1.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.filter = 'brightness(1)';
                  }}
                >
                  Load Reference Demo Reel
                </button>
                <div style={{
                  background: 'var(--bg-well, #060608)',
                  border: '1.5px dashed rgba(255, 255, 255, 0.14)',
                  boxShadow: 'var(--well-recessed)',
                  borderRadius: '11px',
                  width: '100%',
                  padding: '22px',
                  textAlign: 'center',
                  color: '#71717a',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.3px'
                }}>
                  Drop video streams, RAW stills, or media folders onto this bay to mount them
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
