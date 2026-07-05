import React from 'react';
import { RefreshCw, CheckCircle2, X } from 'lucide-react';
import type { VideoItem } from '../../types';
import type { ColorFilters } from '../../types';

interface WatermarkEraserProps {
  video: VideoItem;
  displayUrl: string;
  filterId: string;
  filters: ColorFilters;
  imageRef: React.RefObject<HTMLImageElement>;
  inpaintedPreview: string | null;
  isErasingLoading: boolean;
  boxStart: { x: number; y: number } | null;
  boxEnd: { x: number; y: number } | null;
  reloadKey: number;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLDivElement>) => void;
  onAutoErase: () => void;
  onSaveInpainted: () => void;
  onResetEraser: () => void;
  onCancelEraser: () => void;
}

export function WatermarkEraserCanvas({
  video, displayUrl, filterId, filters, imageRef,
  inpaintedPreview, isErasingLoading, boxStart, boxEnd, reloadKey,
  onMouseDown, onMouseMove, onMouseUp
}: WatermarkEraserProps) {
  return (
    <div
      className="watermark-edit-container"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        userSelect: 'none',
        overflow: 'hidden',
        backgroundColor: '#000'
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          maxHeight: '100%',
          pointerEvents: 'none'
        }}
      >
        <img
          ref={imageRef}
          key={inpaintedPreview ? `preview-${reloadKey}` : `orig-${displayUrl}`}
          src={inpaintedPreview ? `data:image/png;base64,${inpaintedPreview}` : displayUrl}
          alt={video.title}
          crossOrigin="anonymous"
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%', 
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            imageOrientation: 'none',
            display: 'block',
            transform: video.flipped ? 'scaleX(-1)' : undefined,
            filter: video.colorFilters ? `url(#filter-${filterId}) brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) hue-rotate(${filters.hue}deg)` : undefined
          }}
        />
        {boxStart && boxEnd && (
          <div
            className="watermark-selection-box"
            style={{
              position: 'absolute',
              border: '2px dashed var(--accent, #00ff88)',
              background: 'rgba(0, 255, 136, 0.15)',
              boxShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
              left: Math.min(boxStart.x, boxEnd.x),
              top: Math.min(boxStart.y, boxEnd.y),
              width: Math.abs(boxStart.x - boxEnd.x),
              height: Math.abs(boxStart.y - boxEnd.y),
              pointerEvents: 'none',
              zIndex: 10
            }}
          />
        )}
      </div>
    </div>
  );
}

export function WatermarkToolbar({
  isErasingLoading, boxStart, boxEnd, inpaintedPreview,
  onAutoErase, onSaveInpainted, onResetEraser, onCancelEraser
}: Pick<WatermarkEraserProps, 'isErasingLoading' | 'boxStart' | 'boxEnd' | 'inpaintedPreview' | 'onAutoErase' | 'onSaveInpainted' | 'onResetEraser' | 'onCancelEraser'>) {
  return (
    <div className="watermark-editor-toolbar premium-glass" onMouseDown={(e) => e.stopPropagation()}>
      <div className="toolbar-header">
        <span className="toolbar-title">✨ WATERMARK AUTO-ERASER</span>
        {isErasingLoading ? (
          <span className="toolbar-status pulse">PROCESSING...</span>
        ) : (!boxStart ? (
          <span className="toolbar-status hint" style={{ color: 'var(--accent)', fontSize: '10px', fontWeight: 'bold' }}>DRAG A BOX OVER WATERMARK</span>
        ) : null)}
      </div>
      <div className="toolbar-actions">
        {!inpaintedPreview ? (
          <button 
            className="toolbar-btn primary"
            onClick={(e) => { e.stopPropagation(); onAutoErase(); }}
            disabled={isErasingLoading || !boxStart || !boxEnd}
          >
            {isErasingLoading ? (
              <RefreshCw size={12} className="spin" />
            ) : (
              <CheckCircle2 size={12} />
            )}
            <span>Auto Erase</span>
          </button>
        ) : (
          <button 
            className="toolbar-btn success"
            onClick={(e) => { e.stopPropagation(); onSaveInpainted(); }}
            disabled={isErasingLoading}
          >
            <CheckCircle2 size={12} />
            <span>Save & Apply</span>
          </button>
        )}
        
        <button 
          className="toolbar-btn secondary"
          onClick={(e) => { e.stopPropagation(); onResetEraser(); }}
          disabled={isErasingLoading || (!boxStart && !inpaintedPreview)}
        >
          <RefreshCw size={12} />
          <span>Reset</span>
        </button>
        
        <button 
          className="toolbar-btn danger"
          onClick={(e) => { e.stopPropagation(); onCancelEraser(); }}
          disabled={isErasingLoading}
        >
          <X size={12} />
          <span>Cancel</span>
        </button>
      </div>
    </div>
  );
}
