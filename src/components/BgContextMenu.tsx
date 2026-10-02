import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { 
  FolderOpen, Plus, Trash2, Palette, ArrowUpDown, ChevronRight,
  Check, Grid3X3, RefreshCw
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { SortOption } from '../types';

interface BgContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAddFolder: () => void;
  onAddMedia: () => void;
  onPurge: () => void;
  onSelectAll?: () => void;
  onRefreshTiles?: () => void;
  onPasteImage?: () => void;
}

export function BgContextMenu({ x, y, onClose, onAddFolder, onAddMedia, onPurge, onSelectAll, onRefreshTiles, onPasteImage }: BgContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const sortTriggerRef = useRef<HTMLDivElement>(null);
  const columnsTriggerRef = useRef<HTMLDivElement>(null);
  const themeTriggerRef = useRef<HTMLDivElement>(null);

  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

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

  const { 
    sortOrder, setSortOrder, 
    zoom, setZoom, 
    theme, setTheme 
  } = useStore();

  // Close on outside click / escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('contextmenu', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }, 10);

    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('contextmenu', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Measure menu once and clamp to viewport before paint
  useLayoutEffect(() => {
    if (!menuRef.current || hasPositionedRef.current) return;
    const el = menuRef.current;
    const menuW = el.offsetWidth || 180;
    const menuH = el.offsetHeight || 280;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const PAD = 8;

    const spaceBelow = vh - y - PAD;
    const spaceAbove = y - PAD;
    const goUp = (menuH > spaceBelow) && (spaceAbove >= menuH || spaceAbove > spaceBelow);
    const goLeft = (x + menuW + PAD > vw) && (x > vw / 2);

    const top = goUp ? Math.max(PAD, y - menuH) : Math.min(y, vh - menuH - PAD);
    const left = goLeft ? Math.max(PAD, x - menuW) : Math.min(x, vw - menuW - PAD);

    const originY = goUp ? 'bottom' : 'top';
    const originX = goLeft ? 'right' : 'left';

    setPositionState({
      top,
      left,
      transformOrigin: `${originY} ${originX}`,
      isReady: true
    });
    hasPositionedRef.current = true;
  }, [x, y]);

  // Compute submenu position from the trigger row's bounding rect
  const openSubmenu = (name: string, ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const SUBMENU_W = 200;
    // Open to the right if there's room, otherwise to the left
    const left = rect.right + SUBMENU_W + 8 <= vw ? rect.right : rect.left - SUBMENU_W;
    const top = Math.min(rect.top, window.innerHeight - 250);
    setSubmenuPos({ top, left });
    setActiveSubmenu(name);
  };

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: positionState.top,
    left: positionState.left,
    transformOrigin: positionState.transformOrigin,
    zIndex: 1000000,
    opacity: positionState.isReady ? 1 : 0,
    visibility: positionState.isReady ? 'visible' : 'hidden',
    animation: positionState.isReady ? 'menuPop 140ms cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'none',
  };

  const submenuStyle: React.CSSProperties = {
    position: 'fixed',
    top: submenuPos.top,
    left: submenuPos.left,
    zIndex: 1000001,
    background: 'var(--bg-glass, rgba(13, 8, 27, 0.92))',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '4px 0',
    minWidth: '200px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  };

  const sortingOptions: { label: string; value: SortOption }[] = [
    { label: 'Custom Order', value: 'custom' },
    { label: 'Name (A → Z)', value: 'name-asc' },
    { label: 'Name (Z → A)', value: 'name-desc' },
    { label: 'Size (Small → Large)', value: 'size-asc' },
    { label: 'Size (Large → Small)', value: 'size-desc' },
    { label: 'Date Modified (Newest)', value: 'modified-newest' },
    { label: 'Date Modified (Oldest)', value: 'modified-oldest' },
    { label: 'Date Created (Newest)', value: 'created-newest' },
    { label: 'Date Created (Oldest)', value: 'created-oldest' },
  ];

  const columnOptions = [1, 2, 3, 4, 5, 6, 8];

  const themeOptions = [
    { name: 'Cobalt', id: 'cobalt' },
    { name: 'Emerald', id: 'emerald' },
    { name: 'Amethyst', id: 'amethyst' },
    { name: 'Crimson', id: 'crimson' },
    { name: 'Onyx', id: 'onyx' },
  ];

  return (
    <>
      <div
        className="context-menu bg-context-menu"
        ref={menuRef}
        style={menuStyle}
        onClick={e => e.stopPropagation()}
        onMouseLeave={() => setActiveSubmenu(null)}
      >
        {/* SORT BY */}
        <div
          ref={sortTriggerRef}
          className={`context-menu-item submenu-trigger ${activeSubmenu === 'sort' ? 'submenu-active' : ''}`}
          onMouseEnter={() => openSubmenu('sort', sortTriggerRef)}
        >
          <ArrowUpDown size={13} />
          <span>Sort By</span>
          <ChevronRight size={10} className="submenu-chevron" />
        </div>

        {/* GRID COLUMNS */}
        <div
          ref={columnsTriggerRef}
          className={`context-menu-item submenu-trigger ${activeSubmenu === 'columns' ? 'submenu-active' : ''}`}
          onMouseEnter={() => openSubmenu('columns', columnsTriggerRef)}
        >
          <Grid3X3 size={13} />
          <span>Grid Density</span>
          <ChevronRight size={10} className="submenu-chevron" />
        </div>

        {/* THEMES */}
        <div
          ref={themeTriggerRef}
          className={`context-menu-item submenu-trigger ${activeSubmenu === 'theme' ? 'submenu-active' : ''}`}
          onMouseEnter={() => openSubmenu('theme', themeTriggerRef)}
        >
          <Palette size={13} />
          <span>Switch Theme</span>
          <ChevronRight size={10} className="submenu-chevron" />
        </div>

        <div className="context-menu-separator" />

        {/* QUICK INGESTION */}
        <div className="context-menu-item" onClick={() => { onAddFolder(); onClose(); }}>
          <FolderOpen size={13} />
          <span>Add Folder Asset</span>
        </div>

        <div className="context-menu-item" onClick={() => { onAddMedia(); onClose(); }}>
          <Plus size={13} />
          <span>Add Single Media</span>
        </div>

        {onPasteImage && (
          <div className="context-menu-item accent-text" onClick={() => { onPasteImage(); onClose(); }}>
            <Plus size={13} style={{ color: 'var(--accent, #00ff88)' }} />
            <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 'bold' }}>Paste Image as New Tile</span>
          </div>
        )}

        {onSelectAll && (
          <div className="context-menu-item" onClick={() => { onSelectAll(); onClose(); }}>
            <Check size={13} />
            <span>Select All Items</span>
          </div>
        )}

        {onRefreshTiles && (
          <div className="context-menu-item" onClick={() => { onRefreshTiles(); onClose(); }}>
            <RefreshCw size={13} />
            <span>Refresh Tiles</span>
          </div>
        )}

        <div className="context-menu-separator" />

        {/* PURGE */}
        <div className="context-menu-item error-item" onClick={() => { onPurge(); onClose(); }}>
          <Trash2 size={13} />
          <span>Purge Workspace</span>
        </div>
      </div>

      {/* SUBMENUS — rendered as portal siblings, not children, so they don't affect layout */}
      {activeSubmenu === 'sort' && (
        <div
          className="context-menu"
          style={submenuStyle}
          onMouseEnter={() => setActiveSubmenu('sort')}
          onMouseLeave={() => setActiveSubmenu(null)}
          onClick={e => e.stopPropagation()}
        >
          {sortingOptions.map(opt => (
            <div
              key={opt.value}
              className={`context-menu-item ${sortOrder === opt.value ? 'active-item' : ''}`}
              onClick={() => { setSortOrder(opt.value); onClose(); }}
            >
              {sortOrder === opt.value ? <Check size={11} className="menu-check" /> : <div style={{ width: 11 }} />}
              <span>{opt.label}</span>
            </div>
          ))}
        </div>
      )}

      {activeSubmenu === 'columns' && (
        <div
          className="context-menu"
          style={submenuStyle}
          onMouseEnter={() => setActiveSubmenu('columns')}
          onMouseLeave={() => setActiveSubmenu(null)}
          onClick={e => e.stopPropagation()}
        >
          {columnOptions.map(cols => (
            <div
              key={cols}
              className={`context-menu-item ${zoom === cols ? 'active-item' : ''}`}
              onClick={() => { setZoom(cols); onClose(); }}
            >
              {zoom === cols ? <Check size={11} className="menu-check" /> : <div style={{ width: 11 }} />}
              <span>{cols} Column{cols > 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}

      {activeSubmenu === 'theme' && (
        <div
          className="context-menu"
          style={submenuStyle}
          onMouseEnter={() => setActiveSubmenu('theme')}
          onMouseLeave={() => setActiveSubmenu(null)}
          onClick={e => e.stopPropagation()}
        >
          {themeOptions.map(t => (
            <div
              key={t.id}
              className={`context-menu-item ${theme === t.id ? 'active-item' : ''}`}
              onClick={() => { setTheme(t.id); onClose(); }}
            >
              {theme === t.id ? <Check size={11} className="menu-check" /> : <div style={{ width: 11 }} />}
              <span>{t.name}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
