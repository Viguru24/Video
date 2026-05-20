import { useEffect, useRef } from 'react';
import { Play, Pause, Trash2, FolderOpen, Maximize2, Camera, Square, Volume2, VolumeX, ExternalLink, Share2, Info, Edit2 } from 'lucide-react';
import type { VideoItem } from '../types';
import { isValidPictureExtension } from '../utils/videoUtils';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
  video: VideoItem;
  metadata?: any;
  selectedCount?: number;
}

export function ContextMenu({ x, y, onClose, onAction, video, metadata, selectedCount = 0 }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isImage = video ? isValidPictureExtension(video.realPath || video.url) : false;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('contextmenu', handleClickOutside);
    }, 10);
    
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('contextmenu', handleClickOutside);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 450),
    left: Math.min(x, window.innerWidth - 220),
    zIndex: 1000000,
  };

  return (
    <div className="context-menu" ref={menuRef} style={style}>
      {metadata && (
        <div className="context-summary">
          <div className="summary-header">
            <Info size={12} />
            <span>UNIT SUMMARY</span>
          </div>
          <div className="summary-details">
            <div className="summary-row"><span>Format:</span> <strong>{metadata.format}</strong></div>
            <div className="summary-row"><span>Size:</span> <strong>{metadata.size}</strong></div>
            <div className="summary-row"><span>Location:</span> <strong className="path-text">{metadata.path}</strong></div>
          </div>
          <div className="context-menu-separator"></div>
        </div>
      )}

      {selectedCount > 1 && (
        <>
          <div className="context-menu-item accent-text" onClick={() => onAction('rename_selected')}>
            <Edit2 size={14} />
            <span>Rename Selected ({selectedCount})</span>
          </div>
          <div className="context-menu-separator"></div>
        </>
      )}


      <div className="context-menu-item" onClick={() => onAction('focus')}>
        <Maximize2 size={14} />
        <span>Focus Mode</span>
      </div>
      <div className="context-menu-item" onClick={() => onAction('snapshot')}>
        <Camera size={14} />
        <span>Snapshot</span>
      </div>
      <div className="context-menu-separator"></div>
      <div className="context-menu-item" onClick={() => onAction('folder')}>
        <FolderOpen size={14} />
        <span>Open Folder</span>
      </div>
      <div className="context-menu-item" onClick={() => onAction('popout')}>
        <ExternalLink size={14} />
        <span>Pop Out</span>
      </div>
      <div className="context-menu-item" onClick={() => onAction('rename')}>
        <Edit2 size={14} />
        <span>Rename {isImage ? 'Picture' : 'Video'}</span>
      </div>
      <div className="context-menu-separator"></div>
      <div className="context-menu-item" onClick={() => onAction('decommission')}>
        <Trash2 size={14} />
        <span>Remove {isImage ? 'Picture' : 'Video'} from Set</span>
      </div>
      <div className="context-menu-item danger" onClick={() => onAction('annihilate')}>
        <Trash2 size={14} />
        <span style={{ fontWeight: 800 }}>Recycle Bin</span>
      </div>
    </div>
  );
}
