import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, Play, Pause, RotateCcw, ArrowLeftRight, Columns, Sliders, 
  ZoomIn, ZoomOut, Maximize2, Minimize2, ChevronLeft, ChevronRight, Volume2, VolumeX 
} from 'lucide-react';
import type { VideoItem } from '../../types';
import { toCosmoUrl, isValidPictureExtension } from '../../utils/videoUtils';

interface DualCompareModalProps {
  leftItem: VideoItem;
  rightItem: VideoItem;
  allVideos: VideoItem[];
  onClose: () => void;
}

export const DualCompareModal: React.FC<DualCompareModalProps> = ({
  leftItem: initialLeft,
  rightItem: initialRight,
  allVideos,
  onClose,
}) => {
  const [left, setLeft] = useState<VideoItem>(initialLeft);
  const [right, setRight] = useState<VideoItem>(initialRight);
  const [viewMode, setViewMode] = useState<'split-curtain' | 'side-by-side'>('split-curtain');
  const [splitPos, setSplitPos] = useState<number>(50); // percentage 0-100
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const videoLeftRef = useRef<HTMLVideoElement>(null);
  const videoRightRef = useRef<HTMLVideoElement>(null);

  const isLeftImage = isValidPictureExtension(left.realPath || left.url);
  const isRightImage = isValidPictureExtension(right.realPath || right.url);

  // Synchronize playback durations and current time
  const handleTimeUpdate = useCallback(() => {
    const v = videoLeftRef.current || videoRightRef.current;
    if (v) {
      setCurrentTime(v.currentTime);
      if (v.duration && !isNaN(v.duration)) {
        setDuration(v.duration);
      }
    }
  }, []);

  const togglePlay = () => {
    setIsPlaying(prev => {
      const next = !prev;
      if (videoLeftRef.current) {
        if (next) videoLeftRef.current.play().catch(() => {});
        else videoLeftRef.current.pause();
      }
      if (videoRightRef.current) {
        if (next) videoRightRef.current.play().catch(() => {});
        else videoRightRef.current.pause();
      }
      return next;
    });
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (videoLeftRef.current) videoLeftRef.current.currentTime = time;
    if (videoRightRef.current) videoRightRef.current.currentTime = time;
  };

  const handleFrameStep = (frames: number) => {
    const step = frames * (1 / 30);
    const newTime = Math.max(0, Math.min(duration || 1000, currentTime + step));
    handleSeek(newTime);
  };

  const handleSwap = () => {
    setLeft(right);
    setRight(left);
  };

  // Split Divider Dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingDivider || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const pct = Math.max(5, Math.min(95, (rawX / rect.width) * 100));
      setSplitPos(pct);
    };

    const handleMouseUp = () => {
      setIsDraggingDivider(false);
    };

    if (isDraggingDivider) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingDivider]);

  // Synchronized Pan & Zoom via Mouse Drag
  const handleMouseDownViewer = (e: React.MouseEvent) => {
    if (e.button === 0 && zoom > 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning) return;
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    };
    const handleMouseUp = () => setIsPanning(false);

    if (isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, pan]);

  // Keyboard controls: Space (play/pause), Esc (close), Left/Right (seek)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleFrameStep(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleFrameStep(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, currentTime, duration]);

  const leftUrl = toCosmoUrl(left.realPath || left.url);
  const rightUrl = toCosmoUrl(right.realPath || right.url);

  return (
    <div
      className="dual-compare-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(5, 5, 8, 0.95)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        userSelect: 'none',
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(20, 20, 25, 0.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sliders size={18} style={{ color: 'var(--accent, #00ff88)' }} />
            <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.04em' }}>
              COSMO DIFF VIEW (SYNCHRONIZED COMPARISON)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
            <button
              type="button"
              className={`ctrl-btn ${viewMode === 'split-curtain' ? 'active' : ''}`}
              onClick={() => setViewMode('split-curtain')}
              style={{
                background: viewMode === 'split-curtain' ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.08)',
                color: viewMode === 'split-curtain' ? '#000' : '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Split Curtain Slider
            </button>
            <button
              type="button"
              className={`ctrl-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
              onClick={() => setViewMode('side-by-side')}
              style={{
                background: viewMode === 'side-by-side' ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.08)',
                color: viewMode === 'side-by-side' ? '#000' : '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Side-by-Side (50/50)
            </button>
            <button
              type="button"
              onClick={handleSwap}
              title="Swap Left and Right"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <ArrowLeftRight size={13} /> Swap
            </button>
          </div>
        </div>

        {/* Target Selectors & Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>A:</span>
            <select
              value={left.id}
              onChange={(e) => {
                const found = allVideos.find(v => v.id === e.target.value);
                if (found) setLeft(found);
              }}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '11px',
                maxWidth: '160px',
              }}
            >
              {allVideos.map(v => (
                <option key={v.id} value={v.id} style={{ background: '#111', color: '#fff' }}>
                  {v.title}
                </option>
              ))}
            </select>

            <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 600, marginLeft: '6px' }}>B:</span>
            <select
              value={right.id}
              onChange={(e) => {
                const found = allVideos.find(v => v.id === e.target.value);
                if (found) setRight(found);
              }}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '11px',
                maxWidth: '160px',
              }}
            >
              {allVideos.map(v => (
                <option key={v.id} value={v.id} style={{ background: '#111', color: '#fff' }}>
                  {v.title}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '6px',
              padding: '6px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Comparison Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDownViewer}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          background: '#09090d',
          cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {viewMode === 'split-curtain' ? (
          <>
            {/* Background Layer: Right Item (B) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: 'center center',
                transition: isPanning ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              {isRightImage ? (
                <img
                  src={rightUrl}
                  alt={right.title}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              ) : (
                <video
                  ref={videoRightRef}
                  src={rightUrl}
                  loop
                  muted={isMuted}
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              )}
              {/* Badge for Right */}
              <div
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'rgba(0,0,0,0.65)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--accent, #00ff88)',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--accent, #00ff88)',
                }}
              >
                B: {right.title}
              </div>
            </div>

            {/* Foreground Clipped Layer: Left Item (A) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                clipPath: `inset(0 ${100 - splitPos}% 0 0)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: 'center center',
                transition: isPanning ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              {isLeftImage ? (
                <img
                  src={leftUrl}
                  alt={left.title}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              ) : (
                <video
                  ref={videoLeftRef}
                  src={leftUrl}
                  loop
                  muted={isMuted}
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              )}
              {/* Badge for Left */}
              <div
                style={{
                  position: 'absolute',
                  top: 16,
                  left: 16,
                  background: 'rgba(0,0,0,0.65)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #38bdf8',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#38bdf8',
                }}
              >
                A: {left.title}
              </div>
            </div>

            {/* Draggable Vertical Curtain Divider */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsDraggingDivider(true);
              }}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${splitPos}%`,
                width: '4px',
                marginLeft: '-2px',
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                boxShadow: '0 0 10px rgba(0,0,0,0.8), 0 0 4px var(--accent, #00ff88)',
                cursor: 'ew-resize',
                zIndex: 20,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#1a1a24',
                  border: '2px solid var(--accent, #00ff88)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 12px rgba(0, 255, 136, 0.5)',
                }}
              >
                <ArrowLeftRight size={14} style={{ color: 'var(--accent, #00ff88)' }} />
              </div>
            </div>
          </>
        ) : (
          /* Side-by-Side Mode */
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            <div
              style={{
                flex: 1,
                position: 'relative',
                borderRight: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {isLeftImage ? (
                <img src={leftUrl} alt={left.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <video ref={videoLeftRef} src={leftUrl} loop muted={isMuted} playsInline onTimeUpdate={handleTimeUpdate} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              )}
              <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px', color: '#38bdf8', fontSize: '11px', fontWeight: 600 }}>
                A: {left.title}
              </div>
            </div>

            <div
              style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {isRightImage ? (
                <img src={rightUrl} alt={right.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <video ref={videoRightRef} src={rightUrl} loop muted={isMuted} playsInline onTimeUpdate={handleTimeUpdate} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              )}
              <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px', color: 'var(--accent, #00ff88)', fontSize: '11px', fontWeight: 600 }}>
                B: {right.title}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Transport Controls */}
      <div
        style={{
          padding: '10px 20px',
          background: 'rgba(15, 15, 20, 0.95)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* Scrubber Timeline */}
        {(!isLeftImage || !isRightImage) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#888' }}>
              {Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.01}
              value={currentTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
              style={{
                flex: 1,
                accentColor: 'var(--accent, #00ff88)',
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#888' }}>
              {Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}
            </span>
          </div>
        )}

        {/* Buttons Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(!isLeftImage || !isRightImage) && (
              <>
                <button
                  type="button"
                  onClick={togglePlay}
                  style={{
                    background: 'var(--accent, #00ff88)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>

                <button
                  type="button"
                  onClick={() => handleFrameStep(-1)}
                  title="Step Back 1 Frame (Left Arrow)"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => handleFrameStep(1)}
                  title="Step Forward 1 Frame (Right Arrow)"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRight size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsMuted(prev => !prev)}
                  title="Toggle Audio"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: isMuted ? '#888' : 'var(--accent, #00ff88)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </>
            )}
          </div>

          {/* Synchronized Zoom Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#888' }}>Zoom: {Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => {
                setZoom(prev => Math.max(1, prev - 0.5));
                if (zoom <= 1.5) setPan({ x: 0, y: 0 });
              }}
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px',
                cursor: 'pointer',
              }}
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(prev => Math.min(4, prev + 0.5))}
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px',
                cursor: 'pointer',
              }}
            >
              <ZoomIn size={14} />
            </button>
            {zoom > 1 && (
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
