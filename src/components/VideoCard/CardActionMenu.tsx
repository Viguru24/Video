import React from 'react';
import { X, CheckCircle2, Trash2, ChevronLeft, ChevronRight, Camera, Repeat1 } from 'lucide-react';

interface CardActionMenuProps {
  isImage: boolean;
  unitRepeatMode: string;
  onSelectAll?: () => void;
  onAnnihilate: () => void;
  onClose: () => void;
  onStartStep?: (dir: number) => void;
  onStopStep?: () => void;
  onTakeSnapshot?: () => void;
  onToggleUnitLoop?: () => void;
}

export const CardActionMenu: React.FC<CardActionMenuProps> = ({
  isImage,
  unitRepeatMode,
  onSelectAll,
  onAnnihilate,
  onClose,
  onStartStep,
  onStopStep,
  onTakeSnapshot,
  onToggleUnitLoop
}) => {
  return (
    <div 
      className="card-action-menu"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="card-menu-header">
        <span>ACTIONS</span>
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }} 
          className="card-menu-close"
        >
          <X size={10} />
        </button>
      </div>
      <div className="card-menu-items">
        {isImage ? (
          <>
            {onSelectAll && (
              <button 
                className="card-menu-item" 
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAll();
                  onClose();
                }}
              >
                <CheckCircle2 size={12} />
                <span>Select All</span>
              </button>
            )}
            <button 
              className="card-menu-item danger" 
              onClick={(e) => { 
                e.stopPropagation(); 
                onAnnihilate(); 
                onClose(); 
              }}
            >
              <Trash2 size={12} />
              <span>Recycle Bin</span>
            </button>
          </>
        ) : (
          <>
            <div className="card-menu-row">
              <button 
                className="card-menu-item-half" 
                onMouseDown={(e) => { e.stopPropagation(); onStartStep?.(-1); }} 
                onMouseUp={(e) => { e.stopPropagation(); onStopStep?.(); }} 
                onMouseLeave={(e) => { e.stopPropagation(); onStopStep?.(); }}
              >
                <ChevronLeft size={12} />
                <span>Step Back</span>
              </button>
              <button 
                className="card-menu-item-half" 
                onMouseDown={(e) => { e.stopPropagation(); onStartStep?.(1); }} 
                onMouseUp={(e) => { e.stopPropagation(); onStopStep?.(); }} 
                onMouseLeave={(e) => { e.stopPropagation(); onStopStep?.(); }}
              >
                <ChevronRight size={12} />
                <span>Step Fwd</span>
              </button>
            </div>
            {onTakeSnapshot && (
              <button className="card-menu-item" onClick={(e) => { e.stopPropagation(); onTakeSnapshot(); onClose(); }}>
                <Camera size={12} />
                <span>Save Snapshot</span>
              </button>
            )}
            {onToggleUnitLoop && (
              <button 
                className="card-menu-item" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onToggleUnitLoop(); 
                }}
              >
                <Repeat1 size={12} />
                <span>Loop: {unitRepeatMode === 'always' ? 'ON' : 'OFF'}</span>
              </button>
            )}
            {onSelectAll && (
              <button 
                className="card-menu-item" 
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAll();
                  onClose();
                }}
              >
                <CheckCircle2 size={12} />
                <span>Select All</span>
              </button>
            )}
            <button 
              className="card-menu-item danger" 
              onClick={(e) => { 
                e.stopPropagation(); 
                onAnnihilate(); 
                onClose(); 
              }}
            >
              <Trash2 size={12} />
              <span>Recycle Bin</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
