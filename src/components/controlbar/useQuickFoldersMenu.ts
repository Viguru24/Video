import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../../store/useStore';
import { generateUUID, showConfirm } from '../../utils/videoUtils';

export function useQuickFoldersMenu(addLog: (msg: string) => void) {
  const {
    quickFolders,
    setQuickFolders,
    autoSyncFolders,
    toggleAutoSyncFolder,
    setShowInAppBrowser,
    setInAppBrowserPath,
    setInAppBrowserCollapsed
  } = useStore();

  const [showQuickFoldersDropdown, setShowQuickFoldersDropdown] = useState(false);
  const quickFoldersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (quickFoldersRef.current && !quickFoldersRef.current.contains(event.target as Node)) {
        setShowQuickFoldersDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenInAppBrowser = (path: string) => {
    setInAppBrowserPath(path);
    setInAppBrowserCollapsed(false);
    setShowInAppBrowser(true);
    setShowQuickFoldersDropdown(false);
  };

  const handlePinNewFolder = async () => {
    try {
      const path = await invoke<string>('select_folder_cmd');
      if (path === 'Cancelled') return;

      const parts = path.split(/[\\/]/);
      const defaultName = parts[parts.length - 1] || parts[parts.length - 2] || 'Folder';

      const label = (window as any).__customPromptHandler
        ? await (window as any).__customPromptHandler('Enter a name/label for this pinned folder:', defaultName, { title: 'PIN WORKSPACE FOLDER' })
        : prompt('Enter a name/label for this pinned folder:', defaultName);
      if (label === null) return;

      const nextFolders = [
        { id: generateUUID(), name: label.trim() || defaultName, path },
        ...quickFolders
      ];
      setQuickFolders(nextFolders);
      addLog(`SUCCESS: Pinned directory "${label || defaultName}" (${path})`);
      handleOpenInAppBrowser(path);
    } catch (err: unknown) {
      if (err !== 'Cancelled') {
        console.error('Failed to pin folder:', err);
      }
    }
  };

  const handleRenamePinnedFolder = (id: string) => {
    const folder = quickFolders.find((f) => f.id === id);
    if (!folder) return;
    const label = prompt('Enter a new name for this pinned folder:', folder.name);
    if (label === null) return;

    const nextFolders = quickFolders.map((f) =>
      f.id === id ? { ...f, name: label.trim() || f.name } : f
    );
    setQuickFolders(nextFolders);
    addLog(`SUCCESS: Renamed pinned folder to "${label}"`);
  };

  const handleUnpinFolder = async (id: string) => {
    const folder = quickFolders.find((f) => f.id === id);
    if (!folder) return;
    if (await showConfirm(`Are you sure you want to unpin "${folder.name}"?`, { title: 'Unpin Folder', kind: 'warning' })) {
      setQuickFolders(quickFolders.filter((f) => f.id !== id));
      addLog(`SUCCESS: Unpinned folder "${folder.name}"`);
    }
  };

  return {
    quickFolders,
    autoSyncFolders,
    toggleAutoSyncFolder,
    showQuickFoldersDropdown,
    setShowQuickFoldersDropdown,
    quickFoldersRef,
    handlePinNewFolder,
    handleOpenInAppBrowser,
    handleRenamePinnedFolder,
    handleUnpinFolder
  };
}
