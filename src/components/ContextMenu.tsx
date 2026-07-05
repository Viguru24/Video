import { useEffect, useRef, useState } from 'react';
import { 
  Play, Pause, Trash2, FolderOpen, Maximize2, Camera, Square, CheckSquare, Volume2, VolumeX, 
  ExternalLink, Info, Edit2, ChevronLeft, ChevronRight, 
  Minimize2, Repeat, Repeat1, Crop, Eraser, Sparkles, Save, Sliders, Copy, ShieldAlert, Layout,
  ChevronDown, ChevronUp, Share2
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
  const [showMoreInfo, setShowMoreInfo] = useState(false);

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
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const PAD = 8;
    // Clamp left: prefer right of cursor, flip left if not enough space
    let left = x + PAD < vw - rect.width - PAD ? x : x - rect.width;
    left = Math.max(PAD, Math.min(left, vw - rect.width - PAD));
    // Clamp top: prefer below cursor, flip up if not enough space
    let top = y + PAD < vh - rect.height - PAD ? y : y - rect.height;
    top = Math.max(PAD, Math.min(top, vh - rect.height - PAD));
    setCoords({ top, left, measured: true });
  }, [x, y, metadata, selectedCount]);

  if (!video) return null;

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
        <div style={{ padding: '6px 10px 5px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: '3px', width: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
            <Info size={10} style={{ color: 'var(--accent, #00ff88)', flexShrink: 0 }} />
            <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--accent, #00ff88)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              {isImage ? 'Picture Details' : 'Video Details'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.4)' }}>Name</span>
              <strong style={{ fontSize: '9.5px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', color: '#fff' }}>{metadata.name || 'Unknown'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.4)' }}>Format</span>
              <strong style={{ fontSize: '9.5px', color: '#fff' }}>{metadata.format}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.4)' }}>Size</span>
              <strong style={{ fontSize: '9.5px', color: '#fff' }}>{metadata.size}</strong>
            </div>
            {metadata.width && metadata.height && metadata.width > 0 && metadata.height > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.4)' }}>Dimensions</span>
                <strong style={{ fontSize: '9.5px', color: '#fff' }}>{metadata.width} × {metadata.height}</strong>
              </div>
            )}

            {/* Exploding Toggle Button */}
            <div 
              onClick={(e) => { e.stopPropagation(); setShowMoreInfo(!showMoreInfo); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                marginTop: '4px',
                paddingTop: '4px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                color: 'var(--accent, #00ff88)',
                fontSize: '9px',
                fontWeight: 'bold',
                letterSpacing: '0.5px'
              }}
            >
              <span>{showMoreInfo ? 'HIDE EXTRA INFO' : 'EXPLODE / SHOW MORE INFO'}</span>
              {showMoreInfo ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </div>

            {showMoreInfo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px', marginTop: '4px', padding: '6px 8px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                {metadata.width && metadata.height && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>Aspect Ratio</span>
                      <strong style={{ fontSize: '9px', color: '#fff' }}>
                        {(() => {
                          const w = metadata.width;
                          const h = metadata.height;
                          const r = w / h;
                          if (Math.abs(r - 16/9) < 0.05) return '16:9 (Widescreen)';
                          if (Math.abs(r - 4/3) < 0.05) return '4:3 (Standard)';
                          if (Math.abs(r - 1) < 0.05) return '1:1 (Square)';
                          if (Math.abs(r - 9/16) < 0.05) return '9:16 (Vertical)';
                          return `${r.toFixed(2)}:1`;
                        })()}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>Total Pixels</span>
                      <strong style={{ fontSize: '9px', color: '#fff' }}>
                        {((metadata.width * metadata.height) / 1000000).toFixed(2)} Megapixels
                      </strong>
                    </div>
                    {metadata.duration !== undefined && metadata.duration !== null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>Play Time</span>
                        <strong style={{ fontSize: '9px', color: '#fff' }}>
                          {(() => {
                            const seconds = Number(metadata.duration);
                            if (isNaN(seconds) || seconds <= 0) return '0:00';
                            const mins = Math.floor(seconds / 60);
                            const secs = Math.floor(seconds % 60);
                            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                          })()}
                        </strong>
                      </div>
                    )}
                  </>
                )}
                {metadata.created && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>Created</span>
                    <strong style={{ fontSize: '8.5px', color: '#fff' }}>{metadata.created}</strong>
                  </div>
                )}
                {metadata.upscaled_by && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>Enhancement</span>
                    <strong style={{ fontSize: '8.5px', color: '#e9d5ff', textAlign: 'right' }}>{metadata.upscaled_by}</strong>
                  </div>
                )}
              </div>
            )}

            {(() => {
              const cleanPath = metadata.path 
                ? decodeURIComponent(metadata.path.replace(/^local:\/\//, '').split('?')[0]).replace(/\//g, '\\') 
                : '';
              return cleanPath ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '3px', paddingTop: '3px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.4)' }}>Location</span>
                    <span 
                      title={cleanPath} 
                      style={{ 
                        fontSize: '9px', 
                        color: 'rgba(255,255,255,0.6)', 
                        maxWidth: '140px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap', 
                        textAlign: 'right',
                        cursor: 'text',
                        userSelect: 'text'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {cleanPath}
                    </span>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction('folder');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      marginTop: '4px',
                      width: '100%',
                      padding: '4px 6px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px',
                      color: 'var(--accent, #00ff88)',
                      fontSize: '9px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 255, 136, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    }}
                  >
                    <FolderOpen size={10} />
                    Open Folder
                  </button>
                </div>
              ) : null;
            })()}
          </div>
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
              <div className="context-menu-item accent-text" onClick={() => onAction('upscale')} style={{ fontWeight: 'bold' }}>
                <Sparkles size={14} />
                <span>AI Upscale</span>
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
              <div className="context-menu-item" onClick={() => onAction('resize')}>
                <Minimize2 size={14} />
                <span>Rescale / Resize</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('generate_store_logos')}>
                <Layout size={14} />
                <span>Store Logo Creator</span>
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
          {isTauri() && !video.url.includes('/demos/') && (
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
              <div className="context-menu-item accent-text" onClick={() => onAction('upscale')} style={{ fontWeight: 'bold' }}>
                <Sparkles size={14} />
                <span>AI Upscale</span>
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
              <div className="context-menu-item" onClick={() => onAction('resize')}>
                <Minimize2 size={14} />
                <span>Rescale / Resize</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction('generate_store_logos')}>
                <Layout size={14} />
                <span>Store Logo Creator</span>
              </div>
              <div className="context-menu-separator"></div>
            </>
          )}



          <div className="context-menu-section-header">View & File</div>
          <div className="context-menu-item" onClick={() => onAction('select-all')}>
            <CheckSquare size={14} />
            <span>Select All Visible</span>
          </div>
          {selectedCount > 0 && (
            <div className="context-menu-item" onClick={() => onAction('deselect-all')}>
              <Square size={14} />
              <span>Deselect All</span>
            </div>
          )}
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
              <div className="context-menu-item" onClick={() => onAction(selectedCount > 1 && isSelected ? 'move_selected' : 'move_file')}>
                <FolderOpen size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span style={{ color: 'var(--accent, #00ff88)' }}>{selectedCount > 1 && isSelected ? `Move Selected (${selectedCount})` : 'Move to Folder...'}</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction(selectedCount > 1 && isSelected ? 'copy_selected' : 'copy_file')}>
                <Copy size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span style={{ color: 'var(--accent, #00ff88)' }}>{selectedCount > 1 && isSelected ? `Copy Selected (${selectedCount})` : 'Copy to Folder...'}</span>
              </div>
              <div className="context-menu-item" onClick={() => onAction(selectedCount > 1 && isSelected ? 'share_selected' : 'share_file')}>
                <Share2 size={14} style={{ color: 'var(--accent, #00ff88)' }} />
                <span style={{ color: 'var(--accent, #00ff88)' }}>{selectedCount > 1 && isSelected ? `Wi-Fi Share Selected (${selectedCount})` : 'Wi-Fi Share...'}</span>
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
          {isTauri() && !video.url.includes('/demos/') && (
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
