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

const BG_SUBMENU_HEIGHTS: Record<string, number> = {
  sort: 270,
  columns: 240,
  theme: 190,
};

export function BgContextMenu({ x, y, onClose, onAddFolder, onAddMedia, onPurge, onSelectAll, onRefreshTiles, onPasteImage }: BgContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const sortTriggerRef = useRef<HTMLDivElement>(null);
  const columnsTriggerRef = useRef<HTMLDivElement>(null);
  const themeTriggerRef = useRef<HTMLDivElement>(null);
  const closeSubmenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSubmenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [isSubmenuOnRight, setIsSubmenuOnRight] = useState<boolean>(true);

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
      if (closeSubmenuTimerRef.current) clearTimeout(closeSubmenuTimerRef.current);
      if (openSubmenuTimerRef.current) clearTimeout(openSubmenuTimerRef.current);
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
    if (closeSubmenuTimerRef.current) {
      clearTimeout(closeSubmenuTimerRef.current);
      closeSubmenuTimerRef.current = null;
    }
    if (openSubmenuTimerRef.current) {
      clearTimeout(openSubmenuTimerRef.current);
      openSubmenuTimerRef.current = null;
    }
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const SUBMENU_W = 210;
    const subH = BG_SUBMENU_HEIGHTS[name] || 220;

    const onRight = rect.right + SUBMENU_W + 8 <= vw;
    setIsSubmenuOnRight(onRight);

    const left = onRight ? rect.right - 4 : Math.max(8, rect.left - SUBMENU_W + 4);
    let top = rect.top - 4;
    if (top + subH > vh - 8) {
      top = Math.max(8, Math.min(rect.bottom - subH + 4, vh - subH - 8));
    }

    setSubmenuPos({ top, left });
    setActiveSubmenu(name);
  };

  const handleTriggerEnter = (name: string, ref: React.RefObject<HTMLDivElement | null>) => {
    if (closeSubmenuTimerRef.current) {
      clearTimeout(closeSubmenuTimerRef.current);
      closeSubmenuTimerRef.current = null;
    }
    if (openSubmenuTimerRef.current) {
      clearTimeout(openSubmenuTimerRef.current);
      openSubmenuTimerRef.current = null;
    }

    if (activeSubmenu === name) return;

    if (!activeSubmenu) {
      openSubmenu(name, ref);
    } else {
      openSubmenuTimerRef.current = setTimeout(() => {
        openSubmenu(name, ref);
      }, 140);
    }
  };

  const handleNonSubmenuItemEnter = () => {
    if (openSubmenuTimerRef.current) {
      clearTimeout(openSubmenuTimerRef.current);
      openSubmenuTimerRef.current = null;
    }
    if (activeSubmenu) {
      scheduleCloseSubmenu();
    }
  };

  const scheduleCloseSubmenu = () => {
    if (openSubmenuTimerRef.current) {
      clearTimeout(openSubmenuTimerRef.current);
      openSubmenuTimerRef.current = null;
    }
    if (closeSubmenuTimerRef.current) clearTimeout(closeSubmenuTimerRef.current);
    closeSubmenuTimerRef.current = setTimeout(() => {
      setActiveSubmenu(null);
    }, 350);
  };

  const cancelCloseSubmenu = () => {
    if (closeSubmenuTimerRef.current) {
      clearTimeout(closeSubmenuTimerRef.current);
      closeSubmenuTimerRef.current = null;
    }
    if (openSubmenuTimerRef.current) {
      clearTimeout(openSubmenuTimerRef.current);
      openSubmenuTimerRef.current = null;
    }
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
    background: 'var(--glass-bg, #141418)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    padding: '6px',
    minWidth: '210px',
    boxShadow: 'var(--bevel-panel, 0 18px 40px rgba(0,0,0,0.85))',
  };

  const renderSubmenuBridge = () => (
    <div
      style={{
        position: 'absolute',
        top: -10,
        bottom: -10,
        ...(isSubmenuOnRight ? { left: -24 } : { right: -24 }),
        width: 28,
        pointerEvents: 'auto',
        background: 'transparent',
        zIndex: 1000002,
      }}
      onMouseEnter={cancelCloseSubmenu}
    />
  );

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
    { name: 'Obsidian Emerald', id: 'symphony' },
    { name: 'Tungsten Cinema', id: 'midnight' },
    { name: 'Surgical Teal', id: 'nordic' },
    { name: 'Titanium Studio', id: 'cobalt' },
  ];

  return (
    <>
      <div
        className="context-menu bg-context-menu"
        ref={menuRef}
        style={menuStyle}
        onClick={e => e.stopPropagation()}
        onMouseLeave={scheduleCloseSubmenu}
      >
        {/* SORT BY */}
        <div
          ref={sortTriggerRef}
          className={`context-menu-item submenu-trigger ${activeSubmenu === 'sort' ? 'submenu-active' : ''}`}
          onMouseEnter={() => handleTriggerEnter('sort', sortTriggerRef)}
          onClick={e => { e.stopPropagation(); openSubmenu('sort', sortTriggerRef); }}
        >
          <ArrowUpDown size={13} />
          <span>Sort By</span>
          <ChevronRight size={10} className="submenu-chevron" />
        </div>

        {/* GRID COLUMNS */}
        <div
          ref={columnsTriggerRef}
          className={`context-menu-item submenu-trigger ${activeSubmenu === 'columns' ? 'submenu-active' : ''}`}
          onMouseEnter={() => handleTriggerEnter('columns', columnsTriggerRef)}
          onClick={e => { e.stopPropagation(); openSubmenu('columns', columnsTriggerRef); }}
        >
          <Grid3X3 size={13} />
          <span>Grid Density</span>
          <ChevronRight size={10} className="submenu-chevron" />
        </div>

        {/* THEMES */}
        <div
          ref={themeTriggerRef}
          className={`context-menu-item submenu-trigger ${activeSubmenu === 'theme' ? 'submenu-active' : ''}`}
          onMouseEnter={() => handleTriggerEnter('theme', themeTriggerRef)}
          onClick={e => { e.stopPropagation(); openSubmenu('theme', themeTriggerRef); }}
        >
          <Palette size={13} />
          <span>Switch Theme</span>
          <ChevronRight size={10} className="submenu-chevron" />
        </div>

        <div className="context-menu-separator" />

        {/* QUICK INGESTION */}
        <div className="context-menu-item" onMouseEnter={handleNonSubmenuItemEnter} onClick={() => { onAddFolder(); onClose(); }}>
          <FolderOpen size={13} />
          <span>Add Folder Asset</span>
        </div>

        <div className="context-menu-item" onMouseEnter={handleNonSubmenuItemEnter} onClick={() => { onAddMedia(); onClose(); }}>
          <Plus size={13} />
          <span>Add Single Media</span>
        </div>

        {onPasteImage && (
          <div className="context-menu-item accent-text" onMouseEnter={handleNonSubmenuItemEnter} onClick={() => { onPasteImage(); onClose(); }}>
            <Plus size={13} style={{ color: 'var(--accent, #00ff88)' }} />
            <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 'bold' }}>Paste Image as New Tile</span>
          </div>
        )}

        {onSelectAll && (
          <div className="context-menu-item" onMouseEnter={handleNonSubmenuItemEnter} onClick={() => { onSelectAll(); onClose(); }}>
            <Check size={13} />
            <span>Select All Items</span>
          </div>
        )}

        {onRefreshTiles && (
          <div className="context-menu-item" onMouseEnter={handleNonSubmenuItemEnter} onClick={() => { onRefreshTiles(); onClose(); }}>
            <RefreshCw size={13} />
            <span>Refresh Tiles</span>
          </div>
        )}

        <div className="context-menu-separator" />

        {/* PURGE */}
        <div className="context-menu-item error-item" onMouseEnter={handleNonSubmenuItemEnter} onClick={() => { onPurge(); onClose(); }}>
          <Trash2 size={13} />
          <span>Purge Workspace</span>
        </div>
      </div>

      {/* SUBMENUS — rendered as portal siblings, not children, so they don't affect layout */}
      {activeSubmenu === 'sort' && (
        <div
          className="context-menu"
          style={submenuStyle}
          onMouseEnter={cancelCloseSubmenu}
          onMouseLeave={scheduleCloseSubmenu}
          onClick={e => e.stopPropagation()}
        >
          {renderSubmenuBridge()}
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
          onMouseEnter={cancelCloseSubmenu}
          onMouseLeave={scheduleCloseSubmenu}
          onClick={e => e.stopPropagation()}
        >
          {renderSubmenuBridge()}
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
          onMouseEnter={cancelCloseSubmenu}
          onMouseLeave={scheduleCloseSubmenu}
          onClick={e => e.stopPropagation()}
        >
          {renderSubmenuBridge()}
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
