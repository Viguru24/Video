import { useEffect, useRef, useState } from 'react';
import { 
  Play, Pause, Trash2, FolderOpen, Maximize2, Camera, Square, CheckSquare, Volume2, VolumeX, 
  ExternalLink, Info, Edit2, ChevronLeft, ChevronRight, 
  Minimize2, Repeat, Repeat1, Crop, Eraser, Sparkles, Save, Sliders, Copy, ShieldAlert
} from 'lucide-react';
import type { VideoItem } from '../types';
import { isValidPictureExtension, isTauri } from '../utils/videoUtils';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
  video: VideoItem;
  metadata?: any;
  selectedCount?: number;
  isFocused?: boolean;
  isSelected?: boolean;
}

export function ContextMenu({ x, y, onClose, onAction, video, metadata, selectedCount = 0, isFocused = false, isSelected = false }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const effectivePath = video 
    ? (video.folderFiles && video.currentIdx !== undefined) 
      ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url) 
      : (video.realPath || video.url)
    : '';
  const isImage = effectivePath ? isValidPictureExtension(effectivePath) : false;
  const [coords, setCoords] = useState<{ top: number; left: number; measured: boolean }>({
    top: y,
    left: x,
    measured: false
  });

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

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const top = Math.max(10, Math.min(y, window.innerHeight - rect.height - 10));
      const left = Math.max(10, Math.min(x, window.innerWidth - rect.width - 10));
      setCoords({ top, left, measured: true });
    }
  }, [x, y, metadata, selectedCount]);

  const style: React.CSSProperties = {
    position: 'fixed',
    top: coords.top,
    left: coords.left,
    zIndex: 1000000,
    opacity: coords.measured ? 1 : 0,
    visibility: coords.measured ? 'visible' : 'hidden',
  };

  const isVideoLooping = video.repeatMode === 'always';

  return (
    <div className="context-menu" ref={menuRef} style={style}>
      {metadata && (
        <div className="context-summary">
          <div className="summary-header">
            <Info size={12} />
            <span>UNIT SUMMARY</span>
          </div>
          <div className="summary-details">
            <div className="summary-row">
              <span>Name:</span> 
              <strong style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {metadata.name || 'Unknown'}
              </strong>
            </div>
            <div className="summary-row"><span>Format:</span> <strong>{metadata.format}</strong></div>
            <div className="summary-row"><span>Size:</span> <strong>{metadata.size}</strong></div>
            <div className="summary-row"><span>Location:</span> <strong className="path-text">{metadata.path}</strong></div>
            {metadata.upscaled_by && (
              <div className="summary-row">
                <span>Upscaled By:</span> 
                <strong style={{ color: metadata.upscaled_by.includes("GPU") ? '#e9d5ff' : '#94a3b8', fontSize: '10px', textAlign: 'right' }}>
                  {metadata.upscaled_by}
                </strong>
              </div>
            )}
          </div>
          <div className="context-menu-separator"></div>
        </div>
      )}

      {selectedCount > 1 && !isFocused && (
        <>
          <div className="context-menu-item accent-text" onClick={() => onAction('rename_selected')}>
            <Edit2 size={14} />
            <span>Rename Selected ({selectedCount})</span>
          </div>
          <div className="context-menu-separator"></div>
        </>
      )}

      {isFocused ? (
        /* MAXIMISED WINDOW / SOLO MODE CONTEXT MENU */
        <>
          {!isImage && (
            <>
              <div className="context-menu-section-header">Playback & Frame</div>
              <div className="context-menu-item" onClick={() => onAction('play')}>
                {video.playing ? <Pause size={14} /> : <Play size={14} />}
                <span>{video.playing ? 'Pause Video' : 'Play Video'}</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('mute')}>
                {video.muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                <span>{video.muted ? 'Unmute' : 'Mute'}</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('color-adjust')}>
                <Sliders size={14} />
                <span>Color adjustment</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('snapshot')}>
                <Camera size={14} />
                <span>Save Snapshot</span>
              </div>
              <div className="context-menu-separator"></div>
            </>
          )}

          {isImage && (
            <>
              <div className="context-menu-section-header">Image Editing</div>
              <div className="context-menu-item accent-text" onClick={() => onAction('upscale')} style={{ fontWeight: 'bold' }}>
                <Sparkles size={14} />
                <span>AI Upscale</span>
              </div>
              <div className="context-menu-item accent-text" onClick={() => onAction('create_sticker')} style={{ fontWeight: 'bold' }}>
                <Sparkles size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span>Create Sticker (Cutout)</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('color-adjust')}>
                <Sliders size={14} />
                <span>Color adjustment</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('mirror-horizontal')}>
                <Repeat size={14} />
                <span>Mirror Horizontally</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('watermark')}>
                <Eraser size={14} />
                <span>Erase Watermark</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('crop')}>
                <Crop size={14} />
                <span>Crop Image</span>
              </div>
              <div className="context-menu-separator"></div>
            </>
          )}

          <div className="context-menu-section-header">View & File</div>
          {video.folderFiles && video.folderFiles.length > 1 && (
            <>
              <div className="context-menu-item" onClick={() => onAction('prev-file')}>
                <ChevronLeft size={14} />
                <span>Previous File</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('next-file')}>
                <ChevronRight size={14} />
                <span>Next File</span>
              </div>
            </>
          )}

          {isTauri() && (
            <>
              <div className="context-menu-item" onClick={() => onAction('folder')}>
                <FolderOpen size={14} />
                <span>Open Folder</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('move_file')}>
                <FolderOpen size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span style={{ color: 'var(--accent, #00ff88)' }}>Move to Folder...</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('copy_file')}>
                <Copy size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span style={{ color: 'var(--accent, #00ff88)' }}>Copy to Folder...</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('duplicate_file')}>
                <Copy size={14} />
                <span>Duplicate File</span>
              </div>
            </>
          )}
          <div className="context-menu-item" onClick={() => onAction('rename')}>
            <Edit2 size={14} />
            <span>Rename File</span>
          </div>


          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => onAction('decommission')}>
            <Trash2 size={14} />
            <span>Remove from Grid</span>
          </div>
          {isTauri() && (
            <>
              <div className="context-menu-item danger" onClick={() => onAction('annihilate')}>
                <Trash2 size={14} />
                <span style={{ fontWeight: 800 }}>Recycle Bin</span>
              </div>
              <div className="context-menu-item danger" onClick={() => onAction('secure_delete')}>
                <ShieldAlert size={14} />
                <span style={{ fontWeight: 800 }}>Secure Delete</span>
              </div>
            </>
          )}
          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => onAction('exit-focus')} style={{ fontWeight: 'bold' }}>
            <Minimize2 size={14} />
            <span>Exit Focus Mode</span>
          </div>
        </>
      ) : (
        /* STANDARD SMALL WINDOW / GRID CARD CONTEXT MENU */
        <>
          {!isImage && (
            <>
              <div className="context-menu-section-header">Playback & Frame</div>
              <div className="context-menu-item" onClick={() => onAction('play')}>
                {video.playing ? <Pause size={14} /> : <Play size={14} />}
                <span>{video.playing ? 'Pause Video' : 'Play Video'}</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('mute')}>
                {video.muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                <span>{video.muted ? 'Unmute' : 'Mute'}</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('color-adjust')}>
                <Sliders size={14} />
                <span>Color adjustment</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('snapshot')}>
                <Camera size={14} />
                <span>Save Snapshot</span>
              </div>
              <div className="context-menu-separator"></div>
            </>
          )}

          {isImage && (
            <>
              <div className="context-menu-section-header">Image Editing</div>
              <div className="context-menu-item accent-text" onClick={() => onAction('upscale')} style={{ fontWeight: 'bold' }}>
                <Sparkles size={14} />
                <span>AI Upscale</span>
              </div>
              <div className="context-menu-item accent-text" onClick={() => onAction('create_sticker')} style={{ fontWeight: 'bold' }}>
                <Sparkles size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span>Create Sticker (Cutout)</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('color-adjust')}>
                <Sliders size={14} />
                <span>Color adjustment</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('mirror-horizontal')}>
                <Repeat size={14} />
                <span>Mirror Horizontally</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('watermark')}>
                <Eraser size={14} />
                <span>Erase Watermark</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('crop')}>
                <Crop size={14} />
                <span>Crop Image</span>
              </div>
              <div className="context-menu-separator"></div>
            </>
          )}



          <div className="context-menu-section-header">View & File</div>
          {video.folderFiles && video.folderFiles.length > 1 && (
            <>
              <div className="context-menu-item" onClick={() => onAction('prev-file')}>
                <ChevronLeft size={14} />
                <span>Previous File</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('next-file')}>
                <ChevronRight size={14} />
                <span>Next File</span>
              </div>
            </>
          )}

          {isTauri() && (
            <>
              <div className="context-menu-item" onClick={() => onAction('folder')}>
                <FolderOpen size={14} />
                <span>Open Folder</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('popout')}>
                <ExternalLink size={14} />
                <span>Pop Out</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction(selectedCount > 1 && isSelected ? 'move_selected' : 'move_file')}>
                <FolderOpen size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span style={{ color: 'var(--accent, #00ff88)' }}>{selectedCount > 1 && isSelected ? `Move Selected (${selectedCount})` : 'Move to Folder...'}</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction(selectedCount > 1 && isSelected ? 'copy_selected' : 'copy_file')}>
                <Copy size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span style={{ color: 'var(--accent, #00ff88)' }}>{selectedCount > 1 && isSelected ? `Copy Selected (${selectedCount})` : 'Copy to Folder...'}</span>
              </div>
            </>
          )}
          <div className="context-menu-item" onClick={() => onAction('duplicate_file')}>
            <Copy size={14} />
            <span>Duplicate {isImage ? 'Image' : 'Video'}</span>
          </div>
          <div className="context-menu-item" onClick={() => onAction('rename')}>
            <Edit2 size={14} />
            <span>Rename {isImage ? 'Image' : 'Video'}</span>
          </div>


          <div className="context-menu-separator"></div>
          <div className="context-menu-item" onClick={() => onAction('decommission')}>
            <Trash2 size={14} />
            <span>Remove from Grid</span>
          </div>
          {isTauri() && (
            <>
              <div className="context-menu-item danger" onClick={() => onAction('annihilate')}>
                <Trash2 size={14} />
                <span style={{ fontWeight: 800 }}>Recycle Bin</span>
              </div>
              <div className="context-menu-item danger" onClick={() => onAction('secure_delete')}>
                <ShieldAlert size={14} />
                <span style={{ fontWeight: 800 }}>Secure Delete</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
