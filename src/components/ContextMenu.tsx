import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { 
  Play, Pause, Trash2, FolderOpen, Maximize2, Camera, Square, CheckSquare, Volume2, VolumeX, 
  ExternalLink, Edit2, ChevronLeft, ChevronRight, 
  Minimize2, Repeat, Crop, Sparkles, Sliders, Copy, ShieldAlert,
  ChevronDown, ChevronUp, Share2, RefreshCw, Scissors, Wifi, FileCode2, Zap
} from 'lucide-react';
import type { VideoItem } from '../types';
import { isValidPictureExtension, isTauri } from '../utils/videoUtils';
import { ContextMenuColorTags } from './contextmenu/ContextMenuColorTags';

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

export function ContextMenu({
  x,
  y,
  onClose,
  onAction,
  video,
  metadata,
  selectedCount = 0,
  isFocused = false,
  isSelected = false
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const aiTriggerRef = useRef<HTMLDivElement>(null);
  const metadataTriggerRef = useRef<HTMLDivElement>(null);
  const fileTriggerRef = useRef<HTMLDivElement>(null);
  const viewTriggerRef = useRef<HTMLDivElement>(null);
  const deleteTriggerRef = useRef<HTMLDivElement>(null);
  const closeSubmenuTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [showMoreInfo, setShowMoreInfo] = useState(false);

  const effectivePath = video 
    ? (video.folderFiles && video.currentIdx !== undefined) 
      ? (video.folderFiles[video.currentIdx]?.path || video.folderFiles[video.currentIdx]?.url) 
      : (video.realPath || video.url)
    : '';
  const isImage = effectivePath ? isValidPictureExtension(effectivePath) : false;
  const isDemo = false;

  const [positionState, setPositionState] = useState<{
    top: number;
    left: number;
    transformOrigin: string;
    isReady: boolean;
  }>({
    top: y,
    left: x,
    transformOrigin: 'top left',
    isReady: false
  });
  const hasPositionedRef = useRef(false);

  // Close menu on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const timer = setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('contextmenu', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }, 10);

    return () => {
      clearTimeout(timer);
      if (closeSubmenuTimerRef.current) clearTimeout(closeSubmenuTimerRef.current);
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('contextmenu', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Viewport-aware positioning
  useLayoutEffect(() => {
    if (!menuRef.current || hasPositionedRef.current) return;

    const el = menuRef.current;
    const menuW = el.offsetWidth || 210;
    const menuH = el.offsetHeight || 300;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const PAD = 8;

    const spaceBelow = vh - y - PAD;
    const spaceAbove = y - PAD;
    const goUp = (menuH > spaceBelow) && (spaceAbove >= menuH || spaceAbove > spaceBelow);
    const goLeft = (x + menuW + PAD > vw) && (x > vw / 2);

    const top = goUp ? Math.max(PAD, y - menuH) : Math.min(y, vh - menuH - PAD);
    const left = goLeft ? Math.max(PAD, x - menuW) : Math.min(x, vw - menuW - PAD);

    setPositionState({
      top,
      left,
      transformOrigin: `${goUp ? 'bottom' : 'top'} ${goLeft ? 'right' : 'left'}`,
      isReady: true
    });
    hasPositionedRef.current = true;
  }, [x, y]);

  // Submenu positioning & buffering
  const openSubmenu = (name: string, elem: HTMLElement | null) => {
    if (closeSubmenuTimerRef.current) {
      clearTimeout(closeSubmenuTimerRef.current);
      closeSubmenuTimerRef.current = null;
    }
    if (!elem) return;
    const rect = elem.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const SUBMENU_W = 215;

    const left = rect.right + SUBMENU_W + 8 <= vw 
      ? rect.right - 2 
      : Math.max(8, rect.left - SUBMENU_W + 2);
    const top = Math.min(Math.max(8, rect.top - 4), vh - 260);

    setSubmenuPos({ top, left });
    setActiveSubmenu(name);
  };

  const scheduleCloseSubmenu = () => {
    if (closeSubmenuTimerRef.current) clearTimeout(closeSubmenuTimerRef.current);
    closeSubmenuTimerRef.current = setTimeout(() => {
      setActiveSubmenu(null);
    }, 150);
  };

  const cancelCloseSubmenu = () => {
    if (closeSubmenuTimerRef.current) {
      clearTimeout(closeSubmenuTimerRef.current);
      closeSubmenuTimerRef.current = null;
    }
  };

  const executeAction = (action: string) => {
    onAction(action);
    onClose();
  };

  if (!video) return null;

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: positionState.top,
    left: positionState.left,
    transformOrigin: positionState.transformOrigin,
    zIndex: 1000000,
    opacity: positionState.isReady ? 1 : 0,
    visibility: positionState.isReady ? 'visible' : 'hidden',
    animation: positionState.isReady ? 'menuPop 130ms cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'none',
  };

  const submenuStyle: React.CSSProperties = {
    position: 'fixed',
    top: submenuPos.top,
    left: submenuPos.left,
    zIndex: 1000001,
    background: 'var(--glass-bg, #0d0d10)',
    backdropFilter: 'blur(22px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '8px',
    padding: '4px',
    minWidth: '200px',
    maxWidth: '240px',
    boxShadow: 'var(--bevel-panel, 0 18px 40px rgba(0,0,0,0.85))',
    animation: 'menuPop 120ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    boxSizing: 'border-box'
  };

  const isMulti = selectedCount > 1 && isSelected;

  return (
    <>
      <div 
        className="context-menu" 
        ref={menuRef} 
        style={menuStyle}
        onClick={(e) => e.stopPropagation()}
        onMouseLeave={scheduleCloseSubmenu}
      >
        {/* COMPACT METADATA HEADER */}
        {metadata && (
          <div style={{
            padding: '6px 8px 5px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            marginBottom: '3px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '6px 6px 0 0',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '3px' }}>
              <span 
                title={metadata.name || 'Unknown'} 
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  color: '#fff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '135px'
                }}
              >
                {metadata.name || 'Unknown'}
              </span>
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center', flexShrink: 0 }}>
                {metadata.has_comfyui && (
                  <span style={{ fontSize: '7.5px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', background: 'rgba(245, 158, 11, 0.18)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                    COMFYUI
                  </span>
                )}
                {metadata.has_exif && (
                  <span style={{ fontSize: '7.5px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', background: 'rgba(56, 189, 248, 0.18)', color: '#7dd3fc', border: '1px solid rgba(56, 189, 248, 0.35)' }}>
                    EXIF{metadata.has_gps ? '+GPS' : ''}
                  </span>
                )}
                {!metadata.has_comfyui && !metadata.has_exif && (
                  <span style={{ fontSize: '7.5px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 255, 136, 0.12)', color: 'var(--accent, #00ff88)' }}>
                    CLEAN
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px', color: 'rgba(255,255,255,0.48)' }}>
              <span>
                {[metadata.format, metadata.size, metadata.width && metadata.height ? `${metadata.width}×${metadata.height}` : null].filter(Boolean).join(' • ')}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowMoreInfo(!showMoreInfo); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent, #00ff88)',
                  cursor: 'pointer',
                  fontSize: '8.5px',
                  fontWeight: 700,
                  padding: '1px 2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                {showMoreInfo ? 'Less' : 'More'}
                {showMoreInfo ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
              </button>
            </div>

            {/* EXPANDABLE EXTRA METADATA */}
            {showMoreInfo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '5px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {metadata.width && metadata.height && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '8.5px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Ratio</span>
                    <strong style={{ color: '#fff' }}>
                      {(() => {
                        const r = metadata.width / metadata.height;
                        if (Math.abs(r - 16/9) < 0.05) return '16:9';
                        if (Math.abs(r - 4/3) < 0.05) return '4:3';
                        if (Math.abs(r - 1) < 0.05) return '1:1';
                        if (Math.abs(r - 9/16) < 0.05) return '9:16';
                        return `${r.toFixed(2)}:1`;
                      })()}
                    </strong>
                  </div>
                )}
                {metadata.duration !== undefined && metadata.duration !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '8.5px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Play Time</span>
                    <strong style={{ color: '#fff' }}>
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
                {metadata.created && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '8.5px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Created</span>
                    <strong style={{ color: '#fff' }}>{metadata.created}</strong>
                  </div>
                )}
                {metadata.upscaled_by && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '8.5px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Enhanced</span>
                    <strong style={{ color: '#fde68a' }}>{metadata.upscaled_by}</strong>
                  </div>
                )}
                {isTauri() && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); executeAction('folder'); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      marginTop: '3px',
                      padding: '3px 6px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px',
                      color: 'var(--accent, #00ff88)',
                      fontSize: '8.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <FolderOpen size={10} />
                    Open Folder
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* COLOR TAGS BAR */}
        <ContextMenuColorTags
          currentColorTag={video.colorTag}
          onSelectTag={onAction}
          selectedCount={isMulti ? selectedCount : 1}
        />

        <div className="context-menu-separator"></div>

        {/* PRIMARY QUICK ACTIONS */}
        {!isImage ? (
          <>
            <div className="context-menu-item" onClick={() => executeAction('play')}>
              {video.playing ? <Pause size={13} /> : <Play size={13} />}
              <span>{video.playing ? 'Pause Video' : 'Play Video'}</span>
            </div>
            <div className="context-menu-item" onClick={() => executeAction('mute')}>
              {video.muted ? <Volume2 size={13} /> : <VolumeX size={13} />}
              <span>{video.muted ? 'Unmute Audio' : 'Mute Audio'}</span>
            </div>
            <div className="context-menu-item" onClick={() => executeAction('color-adjust')}>
              <Sliders size={13} />
              <span>Color Adjustment</span>
            </div>
          </>
        ) : (
          <>
            <div className="context-menu-item" onClick={() => executeAction('color-adjust')}>
              <Sliders size={13} />
              <span>Color Adjustment</span>
            </div>
            <div className="context-menu-item" onClick={() => executeAction('crop')}>
              <Crop size={13} />
              <span>Crop Image</span>
            </div>
            <div className="context-menu-item" onClick={() => executeAction('resize')}>
              <Minimize2 size={13} />
              <span>Rescale / Resize</span>
            </div>
          </>
        )}

        {/* QUICK MULTI-RENAME IF SELECTED */}
        {isMulti && (
          <div className="context-menu-item accent-text" onClick={() => executeAction('rename_selected')} style={{ fontWeight: 600 }}>
            <Edit2 size={13} style={{ color: 'var(--accent, #00ff88)' }} />
            <span>Rename Selected ({selectedCount})</span>
          </div>
        )}

        <div className="context-menu-separator"></div>

        {/* SUBMENU TRIGGER: AI & CREATIVE STUDIO */}
        <div
          ref={aiTriggerRef}
          className={`context-menu-item submenu-trigger ${activeSubmenu === 'ai' ? 'submenu-active' : ''}`}
          onMouseEnter={() => openSubmenu('ai', aiTriggerRef.current)}
          onClick={(e) => { e.stopPropagation(); openSubmenu('ai', aiTriggerRef.current); }}
        >
          <Sparkles size={13} style={{ color: 'var(--accent, #00ff88)' }} />
          <span style={{ fontWeight: 600 }}>AI & Studio Tools</span>
          <ChevronRight size={10} style={{ marginLeft: 'auto', opacity: 0.6 }} />
        </div>

        {/* SUBMENU TRIGGER: METADATA & EXIF */}
        {isTauri() && (
          <div
            ref={metadataTriggerRef}
            className={`context-menu-item submenu-trigger ${activeSubmenu === 'metadata' ? 'submenu-active' : ''}`}
            onMouseEnter={() => openSubmenu('metadata', metadataTriggerRef.current)}
            onClick={(e) => { e.stopPropagation(); openSubmenu('metadata', metadataTriggerRef.current); }}
          >
            <FileCode2 size={13} style={{ color: '#fbbf24' }} />
            <span>EXIF & Metadata {isMulti ? `(${selectedCount})` : ''}</span>
            <ChevronRight size={10} style={{ marginLeft: 'auto', opacity: 0.6 }} />
          </div>
        )}

        {/* SUBMENU TRIGGER: FILE & SHARE */}
        {isTauri() && (
          <div
            ref={fileTriggerRef}
            className={`context-menu-item submenu-trigger ${activeSubmenu === 'file' ? 'submenu-active' : ''}`}
            onMouseEnter={() => openSubmenu('file', fileTriggerRef.current)}
            onClick={(e) => { e.stopPropagation(); openSubmenu('file', fileTriggerRef.current); }}
          >
            <FolderOpen size={13} />
            <span>File & Share</span>
            <ChevronRight size={10} style={{ marginLeft: 'auto', opacity: 0.6 }} />
          </div>
        )}

        {/* SUBMENU TRIGGER: VIEW & SELECTION */}
        <div
          ref={viewTriggerRef}
          className={`context-menu-item submenu-trigger ${activeSubmenu === 'view' ? 'submenu-active' : ''}`}
          onMouseEnter={() => openSubmenu('view', viewTriggerRef.current)}
          onClick={(e) => { e.stopPropagation(); openSubmenu('view', viewTriggerRef.current); }}
        >
          <ExternalLink size={13} />
          <span>View & Selection</span>
          <ChevronRight size={10} style={{ marginLeft: 'auto', opacity: 0.6 }} />
        </div>

        <div className="context-menu-separator"></div>

        {/* REMOVE FROM GRID */}
        <div className="context-menu-item" onClick={() => executeAction('decommission')}>
          <Trash2 size={13} />
          <span>Remove from Grid</span>
        </div>

        {/* DIRECT DELETE ITEMS (OR TRIGGER) */}
        {isTauri() && (!video.url || !video.url.includes('/demos/')) && (
          <div
            ref={deleteTriggerRef}
            className={`context-menu-item danger submenu-trigger ${activeSubmenu === 'delete' ? 'submenu-active' : ''}`}
            onMouseEnter={() => openSubmenu('delete', deleteTriggerRef.current)}
            onClick={(e) => { e.stopPropagation(); openSubmenu('delete', deleteTriggerRef.current); }}
          >
            <Trash2 size={13} />
            <span>Delete File...</span>
            <ChevronRight size={10} style={{ marginLeft: 'auto', opacity: 0.6 }} />
          </div>
        )}

        {/* EXIT FOCUS MODE IF FOCUSED */}
        {isFocused && (
          <>
            <div className="context-menu-separator"></div>
            <div className="context-menu-item" onClick={() => executeAction('exit-focus')} style={{ fontWeight: 'bold' }}>
              <Minimize2 size={13} />
              <span>Exit Focus Mode</span>
            </div>
          </>
        )}
      </div>

      {/* =========================================================================
          FLYOUT SUBMENUS (PORTAL SIBLINGS)
          ========================================================================= */}

      {/* 1. AI & CREATIVE STUDIO SUBMENU */}
      {activeSubmenu === 'ai' && (
        <div
          className="context-menu"
          style={submenuStyle}
          onMouseEnter={cancelCloseSubmenu}
          onMouseLeave={scheduleCloseSubmenu}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-section-header">Creative AI Tools</div>
          <div className="context-menu-item accent-text" onClick={() => executeAction('upscale')} style={{ fontWeight: 'bold' }}>
            <Sparkles size={13} style={{ color: 'var(--accent, #00ff88)' }} />
            <span>AI Upscale</span>
          </div>
          <div className="context-menu-item accent-text" onClick={() => executeAction('interpolate_60fps')} style={{ fontWeight: 'bold' }}>
            <Zap size={13} style={{ color: '#38bdf8' }} />
            <span>Interpolate 60 FPS...</span>
          </div>

          {!isImage ? (
            <>
              <div className="context-menu-item accent-text" onClick={() => executeAction('trim_crop')} style={{ fontWeight: 'bold' }}>
                <Scissors size={13} style={{ color: 'var(--accent, #00ff88)' }} />
                <span>Trim & Crop Studio...</span>
              </div>
              <div className="context-menu-item" onClick={() => executeAction('snapshot')}>
                <Camera size={13} />
                <span>Save Snapshot</span>
              </div>
            </>
          ) : (
            <>
              <div className="context-menu-item accent-text" onClick={() => executeAction('create_sticker')} style={{ fontWeight: 'bold' }}>
                <Sparkles size={13} style={{ color: 'var(--accent, #00ff88)' }} />
                <span>Create Sticker (Cutout)</span>
              </div>
              <div className="context-menu-item" onClick={() => executeAction('mirror-horizontal')}>
                <Repeat size={13} />
                <span>Mirror Horizontally</span>
              </div>
              <div className="context-menu-item accent-text" onClick={() => executeAction('paste_image')} style={{ fontWeight: 'bold' }}>
                <Copy size={13} style={{ color: 'var(--accent, #00ff88)' }} />
                <span>Paste Image into Tile</span>
              </div>
            </>
          )}

          <div className="context-menu-item" onClick={() => executeAction('compare_diff')}>
            <Sliders size={13} style={{ color: 'var(--accent, #00ff88)' }} />
            <span>Split Diff View...</span>
          </div>
        </div>
      )}

      {/* 2. EXIF & METADATA SUBMENU */}
      {activeSubmenu === 'metadata' && isTauri() && (
        <div
          className="context-menu"
          style={submenuStyle}
          onMouseEnter={cancelCloseSubmenu}
          onMouseLeave={scheduleCloseSubmenu}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-section-header">Metadata & Privacy</div>
          <div 
            className="context-menu-item accent-text" 
            onClick={() => executeAction(isMulti ? 'metadata_studio_selected' : 'metadata_studio')} 
            style={{ fontWeight: 'bold' }}
          >
            <FileCode2 size={13} style={{ color: '#fbbf24' }} />
            <span style={{ color: '#fde68a' }}>
              {isMulti ? `Metadata Studio (${selectedCount})...` : 'Metadata Studio...'}
            </span>
          </div>
          <div 
            className="context-menu-item" 
            onClick={() => executeAction(isMulti ? 'quick_strip_comfyui_selected' : 'quick_strip_comfyui')}
          >
            <Sparkles size={13} style={{ color: '#fbbf24' }} />
            <span>{isMulti ? `Remove ComfyUI (${selectedCount})` : 'Remove ComfyUI Info'}</span>
          </div>
          <div 
            className="context-menu-item" 
            onClick={() => executeAction(isMulti ? 'quick_strip_exif_selected' : 'quick_strip_exif')}
          >
            <Camera size={13} style={{ color: '#38bdf8' }} />
            <span>{isMulti ? `Delete EXIF (${selectedCount})` : 'Delete EXIF Info'}</span>
          </div>
          <div className="context-menu-separator"></div>
          <div 
            className="context-menu-item danger" 
            onClick={() => executeAction(isMulti ? 'quick_strip_all_selected' : 'quick_strip_all')}
          >
            <ShieldAlert size={13} />
            <span>{isMulti ? `Strip ALL Info (${selectedCount})` : 'Strip ALL (EXIF + ComfyUI)'}</span>
          </div>
        </div>
      )}

      {/* 3. FILE OPERATIONS & SHARE SUBMENU */}
      {activeSubmenu === 'file' && isTauri() && (
        <div
          className="context-menu"
          style={submenuStyle}
          onMouseEnter={cancelCloseSubmenu}
          onMouseLeave={scheduleCloseSubmenu}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-section-header">File Operations</div>
          <div className="context-menu-item" onClick={() => executeAction('folder')}>
            <FolderOpen size={13} />
            <span>Open Containing Folder</span>
          </div>
          <div className="context-menu-item" onClick={() => executeAction(isMulti ? 'move_selected' : 'move_file')}>
            <FolderOpen size={13} style={{ color: 'var(--accent, #00ff88)' }} />
            <span style={{ color: 'var(--accent, #00ff88)' }}>{isMulti ? `Move Selected (${selectedCount})...` : 'Move to Folder...'}</span>
          </div>
          <div className="context-menu-item" onClick={() => executeAction(isMulti ? 'copy_selected' : 'copy_file')}>
            <Copy size={13} style={{ color: 'var(--accent, #00ff88)' }} />
            <span style={{ color: 'var(--accent, #00ff88)' }}>{isMulti ? `Copy Selected (${selectedCount})...` : 'Copy to Folder...'}</span>
          </div>
          <div className="context-menu-item" onClick={() => executeAction(isMulti ? 'share_selected' : 'share_file')}>
            <Wifi size={13} style={{ color: 'var(--accent, #00ff88)' }} />
            <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 600 }}>{isMulti ? `Wi-Fi Share Selected (${selectedCount})...` : 'Wi-Fi Share to Mobile...'}</span>
          </div>
          <div className="context-menu-item" onClick={() => executeAction('whatsapp_share')}>
            <Share2 size={13} style={{ color: '#25D366' }} />
            <span>Share to WhatsApp...</span>
          </div>
          <div className="context-menu-item" onClick={() => executeAction('duplicate_file')}>
            <Copy size={13} />
            <span>Duplicate File</span>
          </div>
          <div className="context-menu-item" onClick={() => executeAction(isMulti ? 'rename_selected' : 'rename')}>
            <Edit2 size={13} />
            <span>{isMulti ? `Rename Selected (${selectedCount})...` : 'Rename File...'}</span>
          </div>
        </div>
      )}

      {/* 4. VIEW & SELECTION SUBMENU */}
      {activeSubmenu === 'view' && (
        <div
          className="context-menu"
          style={submenuStyle}
          onMouseEnter={cancelCloseSubmenu}
          onMouseLeave={scheduleCloseSubmenu}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-section-header">View & Selection</div>
          <div className="context-menu-item" onClick={() => executeAction('pop_out')}>
            <ExternalLink size={13} />
            <span>Pop Out Player</span>
          </div>
          <div className="context-menu-item" onClick={() => executeAction('refresh_tile')}>
            <RefreshCw size={13} />
            <span>Refresh Tile (Reload)</span>
          </div>

          {video.folderFiles && video.folderFiles.length > 1 && (
            <>
              <div className="context-menu-separator"></div>
              <div className="context-menu-item" onClick={() => executeAction('prev-file')}>
                <ChevronLeft size={13} />
                <span>Previous File in Folder</span>
              </div>
              <div className="context-menu-item" onClick={() => executeAction('next-file')}>
                <ChevronRight size={13} />
                <span>Next File in Folder</span>
              </div>
            </>
          )}

          {!isFocused && (
            <>
              <div className="context-menu-separator"></div>
              <div className="context-menu-item" onClick={() => executeAction('select-all')}>
                <CheckSquare size={13} />
                <span>Select All Visible</span>
              </div>
              {selectedCount > 0 && (
                <div className="context-menu-item" onClick={() => executeAction('deselect-all')}>
                  <Square size={13} />
                  <span>Deselect All</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 5. DELETE SUBMENU */}
      {activeSubmenu === 'delete' && isTauri() && (
        <div
          className="context-menu"
          style={submenuStyle}
          onMouseEnter={cancelCloseSubmenu}
          onMouseLeave={scheduleCloseSubmenu}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-section-header">Disk Deletion</div>
          <div className="context-menu-item danger" onClick={() => executeAction('annihilate')}>
            <Trash2 size={13} />
            <span style={{ fontWeight: 800 }}>Move to Recycle Bin</span>
          </div>
          <div className="context-menu-item danger" onClick={() => executeAction('secure_delete')}>
            <ShieldAlert size={13} />
            <span style={{ fontWeight: 800 }}>Secure Delete (Permanent)</span>
          </div>
        </div>
      )}
    </>
  );
}
