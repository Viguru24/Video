import { Layers, Bookmark, Hash, Settings, LayoutGrid, Plus, ChevronRight, ChevronLeft } from 'lucide-react';

interface SidebarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  showCollageCanvas: boolean;
  setShowCollageCanvas: (show: boolean) => void;
  showCollections: boolean;
  setShowCollections: (show: boolean) => void;
  showLogs: boolean;
  setShowLogs: (show: boolean) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
  handleSidebarAddFolder: () => void;
}

export function Sidebar({
  sidebarCollapsed,
  setSidebarCollapsed,
  showCollageCanvas,
  setShowCollageCanvas,
  showCollections,
  setShowCollections,
  showLogs,
  setShowLogs,
  showSettings,
  setShowSettings,
  showHelp,
  setShowHelp,
  handleSidebarAddFolder
}: SidebarProps) {
  const isGridActive = !showCollections && !showLogs && !showSettings && !showHelp && !showCollageCanvas;

  return (
    <aside className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand-container">
        <img src="/logo.png" className="sidebar-logo" alt="Logo" />
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-main">COSMO</span>
          <span className="sidebar-brand-sub">SYMPHONY</span>
        </div>
      </div>

      <nav className="sidebar-nav-list">
        {/* MEDIA GRID TAB */}
        <div 
          className={`sidebar-nav-item ${isGridActive ? 'active' : ''}`}
          onClick={() => {
            setShowCollections(false);
            setShowLogs(false);
            setShowSettings(false);
            setShowHelp(false);
            setShowCollageCanvas(false);
          }}
        >
          <div className="sidebar-nav-item-icon"><LayoutGrid size={14} /></div>
          <span className="sidebar-nav-item-label">Media Grid</span>
        </div>

        {/* COLLAGE CANVAS TAB */}
        <div 
          className={`sidebar-nav-item ${showCollageCanvas ? 'active' : ''}`}
          onClick={() => {
            const target = !showCollageCanvas;
            setShowCollageCanvas(target);
            setShowCollections(false);
            setShowLogs(false);
            setShowSettings(false);
            setShowHelp(false);
          }}
        >
          <div className="sidebar-nav-item-icon"><Layers size={14} /></div>
          <span className="sidebar-nav-item-label">Collage Canvas</span>
        </div>

        {/* SETS/COLLECTIONS TAB */}
        <div 
          className={`sidebar-nav-item ${showCollections ? 'active' : ''}`}
          onClick={() => {
            const target = !showCollections;
            setShowCollections(target);
            setShowCollageCanvas(false);
            setShowLogs(false);
            setShowSettings(false);
            setShowHelp(false);
          }}
        >
          <div className="sidebar-nav-item-icon"><Bookmark size={14} /></div>
          <span className="sidebar-nav-item-label">Sets & Collections</span>
        </div>

        {/* CONSOLE LOGS TAB */}
        <div 
          className={`sidebar-nav-item ${showLogs ? 'active' : ''}`}
          onClick={() => {
            const target = !showLogs;
            setShowLogs(target);
            setShowCollections(false);
            setShowCollageCanvas(false);
            setShowSettings(false);
            setShowHelp(false);
          }}
        >
          <div className="sidebar-nav-item-icon"><Hash size={14} /></div>
          <span className="sidebar-nav-item-label">Console Logs</span>
        </div>

        {/* SETTINGS TAB */}
        <div 
          className={`sidebar-nav-item ${showSettings ? 'active' : ''}`}
          onClick={() => {
            const target = !showSettings;
            setShowSettings(target);
            setShowCollections(false);
            setShowLogs(false);
            setShowCollageCanvas(false);
            setShowHelp(false);
          }}
        >
          <div className="sidebar-nav-item-icon"><Settings size={14} /></div>
          <span className="sidebar-nav-item-label">System Settings</span>
        </div>
      </nav>

      {/* QUICK INGESTION TRIGGER */}
      <div className="sidebar-ingest-container">
        <button className="sidebar-ingest-btn" onClick={handleSidebarAddFolder} title="Add Folder Asset">
          <Plus size={13} />
          <span>Add Folder</span>
        </button>
      </div>

      {/* SIDEBAR FOOTER / COLLAPSE TOGGLE */}
      <div className="sidebar-footer">
        <button className="sidebar-toggle-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          {sidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>
    </aside>
  );
}
