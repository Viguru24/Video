import React from 'react';
import { 
  X, Play, Pause, Volume2, VolumeX,
  Layers, Maximize2, Crop, Expand
} from 'lucide-react';
import type { CollageItem } from '../../types';

interface CollageCanvasItemProps {
  item: CollageItem;
  isSelected: boolean;
  activeActionType?: 'drag' | 'resize' | 'rotate';
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onToggleFitMode: (id: string) => void;
  onFitAspectRatio: (item: CollageItem) => void;
  onDeepFocus: (mediaId: string) => void;
  onRemoveItem: (id: string) => void;
  onTogglePlay: (id: string) => void;
  onToggleMute: (id: string) => void;
  onStartRotate: (e: React.PointerEvent, item: CollageItem) => void;
  onStartDrag: (e: React.PointerEvent, item: CollageItem) => void;
  onStartResize: (e: React.PointerEvent, item: CollageItem) => void;
}

export const CollageCanvasItem: React.FC<CollageCanvasItemProps> = ({
  item,
  isSelected,
  activeActionType,
  onBringToFront,
  onSendToBack,
  onToggleFitMode,
  onFitAspectRatio,
  onDeepFocus,
  onRemoveItem,
  onTogglePlay,
  onToggleMute,
  onStartRotate,
  onStartDrag,
  onStartResize
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${item.x}px`,
        top: `${item.y}px`,
        width: `${item.width}px`,
        height: `${item.height}px`,
        transform: `rotate(${item.rotation}deg)`,
        zIndex: item.zIndex,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '12px',
        background: item.isImage ? 'transparent' : 'rgba(10, 10, 15, 0.85)',
        border: isSelected ? '2px solid var(--accent, #00ff88)' : (item.isImage ? 'none' : '1px solid rgba(255, 255, 255, 0.12)'),
        boxShadow: isSelected 
          ? '0 0 30px rgba(0, 255, 136, 0.35)' 
          : '0 8px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
        overflow: 'visible',
        transition: isSelected && activeActionType === 'rotate' ? 'none' : 'box-shadow 0.2s, border-color 0.2s',
        touchAction: 'none'
      }}
    >
      {/* Header Actions Area (Hover to display overlays) */}
      <div 
        className="collage-item-header"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          height: '24px',
          borderRadius: '12px',
          background: 'rgba(12, 12, 16, 0.9)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 10px',
          zIndex: 10,
          opacity: 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}
      >
        {/* Layer Z-Index controls */}
        <button
          onClick={() => onBringToFront(item.id)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
          title="Bring to Front"
        >
          <Layers size={10} style={{ transform: 'rotate(180deg)', color: 'var(--accent, #00ff88)' }} />
        </button>
        <button
          onClick={() => onSendToBack(item.id)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
          title="Send to Back"
        >
          <Layers size={10} style={{ opacity: 0.6 }} />
        </button>

        <div style={{ width: '1px', height: '10px', background: 'rgba(255,255,255,0.15)' }} />

        {/* Toggle Scaling Fit Mode (Cover vs Contain) */}
        <button
          onClick={() => onToggleFitMode(item.id)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
          title={item.fitMode === 'contain' ? "Scale Mode: Contain (Showing whole). Click to Fill & Crop" : "Scale Mode: Cover (Fill & Crop). Click to Contain (Show whole)"}
        >
          <Crop size={10} style={{ color: item.fitMode === 'contain' ? 'var(--accent, #00ff88)' : '#fff', opacity: item.fitMode === 'contain' ? 1 : 0.6 }} />
        </button>

        {/* Snap to Original Aspect Ratio */}
        <button
          onClick={() => onFitAspectRatio(item)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
          title="Snap to Original Aspect Ratio"
        >
          <Expand size={10} style={{ opacity: 0.7 }} />
        </button>

        <div style={{ width: '1px', height: '10px', background: 'rgba(255,255,255,0.15)' }} />

        {/* Open Solo focused view */}
        <button
          onClick={() => onDeepFocus(item.mediaId)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
          title="Enlarge Unit"
        >
          <Maximize2 size={10} />
        </button>

        {/* Remove button */}
        <button
          onClick={() => onRemoveItem(item.id)}
          style={{ background: 'none', border: 'none', color: '#ff5c5c', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
          title="Remove item"
        >
          <X size={11} />
        </button>
      </div>

      {/* Rotation Handle Line and Ball (At the top center) */}
      <div
        className="collage-rotation-handle-container"
        style={{
          position: 'absolute',
          top: '-30px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 99
        }}
      >
        <div
          onPointerDown={(e) => onStartRotate(e, item)}
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: 'var(--accent, #00ff88)',
            border: '2px solid #fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
            cursor: 'grab',
            transition: 'transform 0.1s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.25)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          title="Drag to Rotate (Hold Shift to snap to 15°)"
        />
        <div 
          style={{
            width: '2px',
            height: '16px',
            background: 'var(--accent, #00ff88)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)'
          }}
        />
      </div>

      {/* Drag Handle Container (The Card Content Area) */}
      <div
        onPointerDown={(e) => onStartDrag(e, item)}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          position: 'relative',
          borderRadius: '11px',
          overflow: 'hidden',
          background: item.isImage ? 'transparent' : '#000',
          cursor: 'move'
        }}
      >
        {/* Media Content Render */}
        {item.isImage ? (
          <img 
            src={item.url} 
            style={{ width: '100%', height: '100%', objectFit: item.fitMode || 'cover', pointerEvents: 'none', userSelect: 'none' }} 
            alt="" 
          />
        ) : (
          <video
            src={item.url}
            autoPlay
            loop
            muted={item.muted}
            style={{ width: '100%', height: '100%', objectFit: item.fitMode || 'cover', pointerEvents: 'none' }}
            ref={(el) => {
              if (el) {
                if (item.playing) el.play().catch(() => {});
                else el.pause();
              }
            }}
          />
        )}

        {/* Individual Live Controls overlay inside Video card */}
        {!item.isImage && (
          <div 
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '8px',
              display: 'flex',
              gap: '6px',
              zIndex: 5
            }}
          >
            <button
              className="collage-inner-btn"
              onClick={() => onTogglePlay(item.id)}
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {item.playing ? <Pause size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
            </button>
            
            <button
              className="collage-inner-btn"
              onClick={() => onToggleMute(item.id)}
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {item.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
            </button>
          </div>
        )}

        {/* Title overlay in top corner */}
        <div 
          className="collage-item-title"
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 8px',
            borderRadius: '4px',
            color: 'rgba(255,255,255,0.8)',
            fontSize: '9px',
            fontWeight: 600,
            maxWidth: '75%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {item.title}
        </div>
      </div>

      {/* Resize Handle (Bottom Right corner) */}
      <div
        className="collage-resize-handle"
        onPointerDown={(e) => onStartResize(e, item)}
        style={{
          position: 'absolute',
          bottom: '-4px',
          right: '-4px',
          width: '14px',
          height: '14px',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '2px solid var(--accent, #00ff88)',
          borderRadius: '50%',
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
          cursor: 'se-resize',
          zIndex: 9
        }}
        title="Drag to Resize"
      />
    </div>
  );
};
