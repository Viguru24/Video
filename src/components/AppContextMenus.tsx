import React from 'react';
import type { VideoItem } from '../types';
import { ContextMenu } from './ContextMenu';
import { BgContextMenu } from './BgContextMenu';

interface AppContextMenusProps {
  menu: { x: number; y: number; id: string } | null;
  setMenu: (menu: any) => void;
  menuMetadata: any;
  setMenuMetadata: (meta: any) => void;
  videos: VideoItem[];
  selectedIds: Set<string>;
  focusedId: string | null;
  handleContextMenuAction: (action: string) => Promise<void>;
  bgMenu: { x: number; y: number } | null;
  setBgMenu: (menu: any) => void;
  handleSidebarAddFolder: () => void;
  handleAddMediaFiles: () => void;
  handlePurgeWorkspace: () => void;
  handleSelectAll: () => void;
  handleRefreshTiles: () => void;
  handlePasteImage: (id?: string | null) => void;
}

export const AppContextMenus: React.FC<AppContextMenusProps> = ({
  menu,
  setMenu,
  menuMetadata,
  setMenuMetadata,
  videos,
  selectedIds,
  focusedId,
  handleContextMenuAction,
  bgMenu,
  setBgMenu,
  handleSidebarAddFolder,
  handleAddMediaFiles,
  handlePurgeWorkspace,
  handleSelectAll,
  handleRefreshTiles,
  handlePasteImage,
}) => {
  return (
    <>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => {
            setMenu(null);
            setMenuMetadata(null);
          }}
          video={videos.find((x) => x.id === menu.id)!}
          metadata={menuMetadata}
          selectedCount={selectedIds.size}
          isFocused={focusedId === menu.id}
          isSelected={selectedIds.has(menu.id)}
          onAction={handleContextMenuAction}
        />
      )}

      {bgMenu && (
        <BgContextMenu
          x={bgMenu.x}
          y={bgMenu.y}
          onClose={() => setBgMenu(null)}
          onAddFolder={handleSidebarAddFolder}
          onAddMedia={handleAddMediaFiles}
          onPurge={handlePurgeWorkspace}
          onSelectAll={handleSelectAll}
          onRefreshTiles={handleRefreshTiles}
          onPasteImage={() => handlePasteImage(null)}
        />
      )}
    </>
  );
};
