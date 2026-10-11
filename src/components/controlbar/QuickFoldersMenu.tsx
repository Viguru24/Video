import React from 'react';
import { FolderOpen, ChevronDown, Plus, Zap, Type, X } from 'lucide-react';
import type { QuickFolder } from '../../types';

interface QuickFoldersMenuProps {
  quickFolders: QuickFolder[];
  autoSyncFolders: string[];
  showQuickFoldersDropdown: boolean;
  setShowQuickFoldersDropdown: (show: boolean) => void;
  quickFoldersRef: React.RefObject<HTMLDivElement | null>;
  handlePinNewFolder: () => void;
  handleOpenInAppBrowser: (path: string) => void;
  toggleAutoSyncFolder: (path: string) => void;
  handleRenamePinnedFolder: (id: string) => void;
  handleUnpinFolder: (id: string) => void;
  addLog: (msg: string) => void;
}

export const QuickFoldersMenu: React.FC<QuickFoldersMenuProps> = ({
  quickFolders,
  autoSyncFolders,
  showQuickFoldersDropdown,
  setShowQuickFoldersDropdown,
  quickFoldersRef,
  handlePinNewFolder,
  handleOpenInAppBrowser,
  toggleAutoSyncFolder,
  handleRenamePinnedFolder,
  handleUnpinFolder,
  addLog,
}) => {
  return (
    <div className="quick-folders-container" ref={quickFoldersRef} data-no-drag>
      <button 
        className={`mode-btn quick-folders-trigger-btn ${showQuickFoldersDropdown ? 'active' : ''}`}
        onClick={() => setShowQuickFoldersDropdown(!showQuickFoldersDropdown)}
        data-tooltip="Quick Access Pinned Folders"
      >
        <FolderOpen size={14} className="quick-folders-icon" />
        <span>QUICK FOLDERS</span>
        <ChevronDown size={10} className="quick-folders-arrow-icon" style={{ marginLeft: '4px', opacity: 0.7 }} />
      </button>
      {showQuickFoldersDropdown && (
        <div className="quick-folders-dropdown">
          <div className="quick-folders-header">
            <span className="quick-folders-title">Pinned Folders</span>
            <button 
              className="quick-folders-add-btn" 
              onClick={handlePinNewFolder}
              title="Pin New Folder"
            >
              <Plus size={11} />
              <span>Pin Folder</span>
            </button>
          </div>
          <div className="quick-folders-list">
            {quickFolders.length === 0 ? (
              <div className="quick-folders-empty">No folders pinned. Click Pin Folder to start.</div>
            ) : (
              quickFolders.map(folder => {
                const isAutoSync = autoSyncFolders.some(p => p.replace(/[\\/]+$/, '') === folder.path.replace(/[\\/]+$/, ''));
                return (
                  <div key={folder.id} className="quick-folder-item">
                    <button 
                      className="quick-folder-link"
                      onClick={() => handleOpenInAppBrowser(folder.path)}
                      title={folder.path}
                    >
                      <FolderOpen size={12} className="folder-item-icon" />
                      <span className="folder-item-name">{folder.name}</span>
                    </button>
                    <div className="quick-folder-actions">
                      <button 
                        className={`quick-folder-action-btn sync ${isAutoSync ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAutoSyncFolder(folder.path);
                          addLog(`Auto-Sync ${isAutoSync ? 'disabled' : 'enabled'} for "${folder.name}"`);
                        }}
                        title={isAutoSync ? "Auto-Add New Files: ACTIVE (Click to Disable)" : "Auto-Add New Files: OFF (Click to Enable)"}
                        style={{
                          color: isAutoSync ? 'var(--accent, #00ff88)' : 'rgba(255, 255, 255, 0.4)',
                          background: isAutoSync ? 'rgba(0, 255, 136, 0.15)' : 'transparent',
                          border: isAutoSync ? '1px solid rgba(0, 255, 136, 0.4)' : '1px solid transparent',
                          borderRadius: '4px',
                          padding: '2px 4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <Zap size={11} fill={isAutoSync ? "currentColor" : "none"} />
                      </button>
                      <button 
                        className="quick-folder-action-btn edit" 
                        onClick={() => handleRenamePinnedFolder(folder.id)}
                        title="Rename Pin"
                      >
                        <Type size={11} />
                      </button>
                      <button 
                        className="quick-folder-action-btn delete" 
                        onClick={() => handleUnpinFolder(folder.id)}
                        title="Unpin Folder"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
