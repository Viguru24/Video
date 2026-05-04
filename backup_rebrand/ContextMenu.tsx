import { useEffect, useRef } from 'react';
import { Play, Pause, Trash2, FolderOpen, Maximize2, Camera, Square, Volume2, VolumeX, ExternalLink } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
  playing?: boolean;
  muted?: boolean;
}

export function ContextMenu({ x, y, onClose, onAction, playing, muted }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // Slight delay to prevent immediate closure from the click that opened it
    setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('contextmenu', handleClickOutside);
    }, 10);
    
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('contextmenu', handleClickOutside);
    };
  }, [onClose]);

  // Handle screen bounds
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 300),
    left: Math.min(x, window.innerWidth - 200),
    zIndex: 10000,
  };

  return (
    <div className="context-menu" ref={menuRef} style={style}>
      <div className="context-menu-item" onClick={() => onAction('play')}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
        <span>{playing ? 'Pause' : 'Play'}</span>
      </div>
      <div className="context-menu-item" onClick={() => onAction('mute')}>
        {muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
        <span>{muted ? 'Unmute' : 'Mute'}</span>
      </div>
      <div className="context-menu-item" onClick={() => onAction('stop')}>
        <Square size={14} />
        <span>Stop & Reset</span>
      </div>
      <div className="context-menu-separator"></div>
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
      <div className="context-menu-separator"></div>
      <div className="context-menu-item danger" onClick={() => onAction('remove')}>
        <Trash2 size={14} />
        <span>Remove</span>
      </div>
    </div>
  );
}
