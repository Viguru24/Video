import React from 'react';
import type { AspectRatio } from './TrimCropToolbar';

export interface CropBox {
  x: number; // Percentage 0-100
  y: number;
  width: number;
  height: number;
}

interface CropOverlayBoxProps {
  cropBox: CropBox;
  croppedPixelW: number;
  croppedPixelH: number;
  aspectRatio: AspectRatio;
  centerCropBox: () => void;
  handleCropMouseDown: (e: React.MouseEvent, handle: string | null) => void;
}

export const CropOverlayBox: React.FC<CropOverlayBoxProps> = ({
  cropBox,
  croppedPixelW,
  croppedPixelH,
  aspectRatio,
  centerCropBox,
  handleCropMouseDown,
}) => {
  return (
    <div 
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10
      }}
    >
      {/* Crop Box with Shaded Backdrop and Neon Border */}
      <div 
        style={{
          position: 'absolute',
          left: `${cropBox.x}%`,
          top: `${cropBox.y}%`,
          width: `${cropBox.width}%`,
          height: `${cropBox.height}%`,
          border: '2px solid var(--accent, #00ff88)',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.68), 0 0 20px rgba(0, 255, 136, 0.45)',
          cursor: 'move',
          pointerEvents: 'auto',
          borderRadius: '2px'
        }}
        onMouseDown={(e) => handleCropMouseDown(e, null)}
        onDoubleClick={centerCropBox}
      >
        {/* Grid Lines (Rule of Thirds) */}
        <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: '1px', borderLeft: '1px dashed rgba(255, 255, 255, 0.35)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: '1px', borderLeft: '1px dashed rgba(255, 255, 255, 0.35)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255, 255, 255, 0.35)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255, 255, 255, 0.35)', pointerEvents: 'none' }} />

        {/* Center Crosshair Target */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '12px',
          height: '12px',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none'
        }}>
          <div style={{ position: 'absolute', left: '5px', top: 0, bottom: 0, width: '2px', background: 'rgba(0, 255, 136, 0.7)' }} />
          <div style={{ position: 'absolute', top: '5px', left: 0, right: 0, height: '2px', background: 'rgba(0, 255, 136, 0.7)' }} />
        </div>

        {/* Floating Dimension Badge */}
        <div style={{
          position: 'absolute',
          top: '-28px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 14, 22, 0.92)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(0, 255, 136, 0.4)',
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '10px',
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '0.4px',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.6)'
        }}>
          <span style={{ color: 'var(--accent, #00ff88)' }}>{croppedPixelW} × {croppedPixelH} px</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 4px' }}>•</span>
          <span style={{ color: '#00e5ff' }}>{aspectRatio.toUpperCase()}</span>
        </div>

        {/* Camera Viewfinder L-Brackets on Corners */}
        <div style={{ position: 'absolute', top: '-3px', left: '-3px', width: '12px', height: '12px', borderTop: '3px solid #fff', borderLeft: '3px solid #fff', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '-3px', right: '-3px', width: '12px', height: '12px', borderTop: '3px solid #fff', borderRight: '3px solid #fff', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '12px', height: '12px', borderBottom: '3px solid #fff', borderLeft: '3px solid #fff', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '12px', height: '12px', borderBottom: '3px solid #fff', borderRight: '3px solid #fff', pointerEvents: 'none' }} />

        {/* 8 Interactive Handles */}
        {[
          { id: 'nw', cursor: 'nwse-resize', top: '-6px', left: '-6px' },
          { id: 'n', cursor: 'ns-resize', top: '-6px', left: 'calc(50% - 6px)' },
          { id: 'ne', cursor: 'nesw-resize', top: '-6px', left: 'calc(100% - 6px)' },
          { id: 'e', cursor: 'ew-resize', top: 'calc(50% - 6px)', left: 'calc(100% - 6px)' },
          { id: 'se', cursor: 'nwse-resize', top: 'calc(100% - 6px)', left: 'calc(100% - 6px)' },
          { id: 's', cursor: 'ns-resize', top: 'calc(100% - 6px)', left: 'calc(50% - 6px)' },
          { id: 'sw', cursor: 'nesw-resize', top: 'calc(100% - 6px)', left: '-6px' },
          { id: 'w', cursor: 'ew-resize', top: 'calc(50% - 6px)', left: '-6px' },
        ].map(h => (
          <div
            key={h.id}
            onMouseDown={(e) => handleCropMouseDown(e, h.id)}
            style={{
              position: 'absolute',
              width: '12px',
              height: '12px',
              background: 'var(--accent, #00ff88)',
              border: '2px solid #000',
              borderRadius: h.id.length === 1 ? '3px' : '50%',
              top: h.top,
              left: h.left,
              cursor: h.cursor,
              pointerEvents: 'auto',
              zIndex: 25,
              boxShadow: '0 0 6px rgba(0, 255, 136, 0.8)',
              transition: 'transform 0.1s ease'
            }}
          />
        ))}
      </div>
    </div>
  );
};
