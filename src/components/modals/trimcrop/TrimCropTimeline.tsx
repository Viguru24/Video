import React from 'react';
import { 
  Rewind, FastForward, Play, Pause, RefreshCw, RotateCcw,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { formatTime } from './TrimCropToolbar';

interface TrimCropTimelineProps {
  timelineRef: React.RefObject<HTMLDivElement | null>;
  startTime: number;
  endTime: number;
  currentTime: number;
  duration: number;
  trimDuration: number;
  hoverTime: number | null;
  hoverPos: number | null;
  setHoverTime: (time: number | null) => void;
  setHoverPos: (pos: number | null) => void;
  isDraggingTimeline: 'playhead' | 'start' | 'end' | 'range' | null;
  handleTimelineMouseDown: (e: React.MouseEvent, type: 'playhead' | 'start' | 'end' | 'range') => void;
  seekTo: (time: number) => void;
  jumpToIn: () => void;
  jumpToOut: () => void;
  stepFrame: (frames: number) => void;
  togglePlay: () => void;
  isPlaying: boolean;
  loopSelection: boolean;
  setLoopSelection: React.Dispatch<React.SetStateAction<boolean>>;
  setInPoint: () => void;
  setOutPoint: () => void;
  resetTrim: () => void;
}

export const TrimCropTimeline: React.FC<TrimCropTimelineProps> = ({
  timelineRef,
  startTime,
  endTime,
  currentTime,
  duration,
  trimDuration,
  hoverTime,
  hoverPos,
  setHoverTime,
  setHoverPos,
  isDraggingTimeline,
  handleTimelineMouseDown,
  seekTo,
  jumpToIn,
  jumpToOut,
  stepFrame,
  togglePlay,
  isPlaying,
  loopSelection,
  setLoopSelection,
  setInPoint,
  setOutPoint,
  resetTrim,
}) => {
  return (
    <div style={{
      padding: '10px 20px',
      background: 'rgba(0, 0, 0, 0.5)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      flexShrink: 0
    }}>
      {/* Real-time Timecode Readouts */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '12px',
        marginBottom: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 700 }}>IN</span>
          <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 700, background: 'rgba(0,255,136,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
            {formatTime(startTime)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 700 }}>POS</span>
            <span style={{ color: '#ffffff', fontWeight: 800, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
              {formatTime(currentTime)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 700 }}>LENGTH</span>
            <span style={{ color: '#00e5ff', fontWeight: 800, background: 'rgba(0,229,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
              {formatTime(trimDuration)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 700 }}>OUT</span>
          <span style={{ color: '#00e5ff', fontWeight: 700, background: 'rgba(0,229,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
            {formatTime(endTime)}
          </span>
        </div>
      </div>

      {/* Timeline Scrubber Track */}
      <div 
        ref={timelineRef}
        onMouseMove={(e) => {
          if (!timelineRef.current) return;
          const rect = timelineRef.current.getBoundingClientRect();
          const pos = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, pos / Math.max(1, rect.width)));
          setHoverTime(ratio * duration);
          setHoverPos(Math.max(30, Math.min(Math.max(30, rect.width - 30), pos)));
        }}
        onMouseLeave={() => {
          setHoverTime(null);
          setHoverPos(null);
        }}
        onClick={(e) => {
          if (timelineRef.current && !isDraggingTimeline) {
            const rect = timelineRef.current.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seekTo(ratio * duration);
          }
        }}
        style={{
          position: 'relative',
          height: '42px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          cursor: 'pointer',
          overflow: 'hidden',
          userSelect: 'none',
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)'
        }}
      >
        {/* Time Ruler Ticks along top edge */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '8px', display: 'flex', justifyContent: 'space-between', opacity: 0.25, pointerEvents: 'none' }}>
          {Array.from({ length: 21 }).map((_, i) => (
            <div key={i} style={{ width: '1px', height: i % 5 === 0 ? '8px' : '4px', background: '#fff' }} />
          ))}
        </div>

        {/* Selected In-Out Highlight Region */}
        <div 
          onMouseDown={(e) => handleTimelineMouseDown(e, 'range')}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${(startTime / duration) * 100}%`,
            width: `${((endTime - startTime) / duration) * 100}%`,
            background: 'linear-gradient(90deg, rgba(0, 255, 136, 0.18) 0%, rgba(0, 229, 255, 0.18) 100%)',
            borderLeft: '2px solid var(--accent, #00ff88)',
            borderRight: '2px solid #00e5ff',
            cursor: 'grab',
            boxShadow: '0 0 15px rgba(0, 255, 136, 0.15)'
          }}
        />

        {/* In-Point Handle [IN] */}
        <div
          onMouseDown={(e) => handleTimelineMouseDown(e, 'start')}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(${(startTime / duration) * 100}% - 10px)`,
            width: '20px',
            cursor: 'ew-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 15
          }}
        >
          <div style={{
            width: '6px',
            height: '28px',
            background: 'var(--accent, #00ff88)',
            borderRadius: '3px',
            boxShadow: '0 0 8px rgba(0, 255, 136, 0.8)',
            border: '1px solid #000'
          }} />
        </div>

        {/* Out-Point Handle [OUT] */}
        <div
          onMouseDown={(e) => handleTimelineMouseDown(e, 'end')}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(${(endTime / duration) * 100}% - 10px)`,
            width: '20px',
            cursor: 'ew-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 15
          }}
        >
          <div style={{
            width: '6px',
            height: '28px',
            background: '#00e5ff',
            borderRadius: '3px',
            boxShadow: '0 0 8px rgba(0, 229, 255, 0.8)',
            border: '1px solid #000'
          }} />
        </div>

        {/* Hover Ghost Cursor & Tooltip */}
        {hoverTime !== null && hoverPos !== null && (
          <>
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${hoverPos}px`,
              width: '1px',
              background: 'rgba(255, 255, 255, 0.4)',
              pointerEvents: 'none',
              zIndex: 18
            }} />
            <div style={{
              position: 'absolute',
              top: '2px',
              left: `${hoverPos}px`,
              transform: 'translateX(-50%)',
              background: 'rgba(0, 0, 0, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              padding: '1px 5px',
              fontSize: '9px',
              fontWeight: 700,
              color: '#fff',
              pointerEvents: 'none',
              zIndex: 22
            }}>
              {formatTime(hoverTime)}
            </div>
          </>
        )}

        {/* Playhead Laser Cursor */}
        <div
          onMouseDown={(e) => handleTimelineMouseDown(e, 'playhead')}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(${(currentTime / duration) * 100}% - 7px)`,
            width: '14px',
            cursor: 'ew-resize',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 20
          }}
        >
          {/* Playhead Diamond Cap */}
          <div style={{
            width: '12px',
            height: '12px',
            background: '#ffffff',
            transform: 'rotate(45deg)',
            borderRadius: '2px',
            boxShadow: '0 0 10px rgba(255, 255, 255, 0.9), 0 2px 4px rgba(0,0,0,0.8)',
            border: '1px solid #000',
            marginTop: '-1px'
          }} />
          {/* Laser Needle */}
          <div style={{ width: '2px', flex: 1, background: '#ffffff', boxShadow: '0 0 6px rgba(255,255,255,0.8)' }} />
        </div>
      </div>

      {/* Transport & Key Controls Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '10px'
      }}>
        {/* Left Transport Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Jump to IN */}
          <button
            onClick={jumpToIn}
            title="Jump to IN Point (Home)"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              padding: '7px 9px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600
            }}
          >
            |◀
          </button>

          {/* Step -5 frames */}
          <button
            onClick={() => stepFrame(-5)}
            title="Step -5 Frames (Shift + Left)"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              padding: '7px 9px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <Rewind size={14} />
          </button>

          {/* Step -1 frame */}
          <button
            onClick={() => stepFrame(-1)}
            title="Step -1 Frame (Left Arrow)"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              padding: '7px 9px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={16} />
          </button>

          {/* Central Play/Pause Button */}
          <button
            onClick={togglePlay}
            style={{
              background: 'var(--accent, #00ff88)',
              color: '#000',
              border: 'none',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontWeight: 800,
              boxShadow: '0 0 20px rgba(0, 255, 136, 0.4)',
              transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
              transform: isPlaying ? 'scale(1.04)' : 'scale(1)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = isPlaying ? 'scale(1.04)' : 'scale(1)'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
          </button>

          {/* Step +1 frame */}
          <button
            onClick={() => stepFrame(1)}
            title="Step +1 Frame (Right Arrow)"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              padding: '7px 9px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <ChevronRight size={16} />
          </button>

          {/* Step +5 frames */}
          <button
            onClick={() => stepFrame(5)}
            title="Step +5 Frames (Shift + Right)"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              padding: '7px 9px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <FastForward size={14} />
          </button>

          {/* Jump to OUT */}
          <button
            onClick={jumpToOut}
            title="Jump to OUT Point (End)"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              padding: '7px 9px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600
            }}
          >
            ▶|
          </button>
        </div>

        {/* Middle Loop Button */}
        <button
          onClick={() => setLoopSelection(prev => !prev)}
          style={{
            background: loopSelection ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 255, 255, 0.05)',
            border: `1px solid ${loopSelection ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.1)'}`,
            color: loopSelection ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.6)',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <RefreshCw size={12} className={loopSelection ? 'spin-once' : ''} />
          Loop Range (L)
        </button>

        {/* Right Set In/Out Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={setInPoint}
            style={{
              background: 'rgba(0, 255, 136, 0.12)',
              border: '1px solid rgba(0, 255, 136, 0.35)',
              color: 'var(--accent, #00ff88)',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Set [IN] (I)
          </button>

          <button
            onClick={setOutPoint}
            style={{
              background: 'rgba(0, 229, 255, 0.12)',
              border: '1px solid rgba(0, 229, 255, 0.35)',
              color: '#00e5ff',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Set [OUT] (O)
          </button>

          <button
            onClick={resetTrim}
            title="Reset Trim Bounds"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'rgba(255, 255, 255, 0.6)',
              padding: '6px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
