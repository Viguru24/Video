import { useState, useRef, useCallback } from 'react';
import {
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../types';
import { DRAG_ACTIVATION_DISTANCE } from '../constants';
import { toRealPath, toCosmoUrl, showConfirm } from '../utils/videoUtils';
import { useStore } from '../store/useStore';

interface UseWorkspaceDndProps {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  masterPlaying: boolean;
  masterMuted: boolean;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  setSelectionMode: (mode: boolean) => void;
  setToast: (msg: string | null) => void;
  addLog: (m: string) => void;
}

export function useWorkspaceDnd({
  videos,
  setVideos,
  masterPlaying,
  masterMuted,
  selectedIds,
  setSelectedIds,
  setSelectionMode,
  setToast,
  addLog
}: UseWorkspaceDndProps) {
  const setSortOrder = useStore((state) => state.setSortOrder);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragFile, setDragFile] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: DRAG_ACTIVATION_DISTANCE,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragId(event.active.id as string);
  }, []);

  const performStandardReorder = useCallback((activeId: string, overId: string) => {
    setSortOrder('custom');
    setVideos((items) => {
      const oldIndex = items.findIndex((v) => v.id === activeId);
      const newIndex = items.findIndex((v) => v.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const next = arrayMove(items, oldIndex, newIndex);
        addLog(`Reordered Units: [${items[oldIndex].title}] moved to position ${newIndex + 1}`);
        return next;
      }
      return items;
    });
  }, [setVideos, addLog, setSortOrder]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDragId(null);

    if (over && active.id !== over.id) {
      const activeItem = videos.find(v => v.id === active.id);
      const overItem = videos.find(v => v.id === over.id);

      if (activeItem && overItem) {
        const isFolder = overItem.folderFiles && overItem.folderFiles.length > 0;
        const isSingle = !activeItem.folderFiles;

        if (isFolder && isSingle && activeItem.realPath && overItem.realPath) {
          const isBatch = selectedIds.size > 1 && selectedIds.has(activeItem.id);
          const targetItems = isBatch 
            ? videos.filter(item => selectedIds.has(item.id) && !item.folderFiles && item.realPath)
            : [activeItem];

          (async () => {
            const yes = await showConfirm(
              isBatch 
                ? `MOVE BATCH PROTOCOL\n\nWould you like to move ${targetItems.length} selected files into the folder "${overItem.title}"?\n\n(Click Cancel to just reorder the grid instead)`
                : `MOVE PROTOCOL\n\nWould you like to move "${activeItem.title}" into the folder "${overItem.title}"?\n\n(Click Cancel to just reorder the grid instead)`
            );
            if (yes) {
              try {
                const rawDestDir = overItem.realPath || '';
                const destDir = toRealPath(rawDestDir) || rawDestDir;
                const movedItems: { originalId: string; newPath: string }[] = [];

                for (const item of targetItems) {
                  const rawSrcPath = item.realPath || '';
                  const srcPath = toRealPath(rawSrcPath) || rawSrcPath;
                  const separator = srcPath.includes('/') ? '/' : '\\';
                  const newFileName = srcPath.substring(srcPath.lastIndexOf(separator) + 1);
                  const destFilePath = `${destDir}${separator}${newFileName}`;

                  const exists = await invoke<boolean>('file_exists', { path: destFilePath });
                  let overwrite = false;
                  let renameSibling = false;

                  if (exists) {
                    const confirmOver = await showConfirm(
                      `File Collision\n\n"${newFileName}" already exists in the destination folder.\n\nDo you want to overwrite it?\n(Select No/Cancel to keep both files)`,
                      { title: 'File Collision', kind: 'warning' }
                    );
                    if (confirmOver) {
                      overwrite = true;
                    } else {
                      renameSibling = true;
                    }
                  }

                  const finalPath = await invoke<string>('move_file_on_disk', { 
                    srcPath, 
                    destDir,
                    overwrite,
                    renameSibling
                  });
                  movedItems.push({ originalId: item.id, newPath: finalPath });
                }

                setVideos(prev => {
                  let current = [...prev];
                  const movedIds = new Set(movedItems.map(m => m.originalId));
                  current = current.filter(v => !movedIds.has(v.id));
                  current = current.map(v => v.id === overItem.id ? {
                    ...v,
                    folderFiles: [
                      ...(v.folderFiles || []),
                      ...movedItems.map(m => {
                        const separator = m.newPath.includes('\\') ? '\\' : '/';
                        const name = m.newPath.substring(m.newPath.lastIndexOf(separator) + 1);
                        return { name, url: toCosmoUrl(m.newPath), path: m.newPath };
                      })
                    ]
                  } : v);
                  return current;
                });

                addLog(`SUCCESS: Moved ${movedItems.length} assets into "${overItem.title}" via drag-and-drop.`);
                setToast(`Moved ${movedItems.length} asset(s) successfully.`);
                setTimeout(() => setToast(null), 3000);
                
                setSelectedIds(new Set());
                setSelectionMode(false);
              } catch (err) {
                console.error(err);
                addLog(`ERROR: Drag-and-drop move failed - ${err}`);
                alert(`Move failed: ${err}`);
              }
            } else {
              performStandardReorder(active.id as string, over.id as string);
            }
          })();
          return;
        }
      }

      performStandardReorder(active.id as string, over.id as string);
    }
  }, [videos, setVideos, selectedIds, setSelectedIds, setSelectionMode, setToast, addLog, performStandardReorder]);

  const onReorder = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setVideos((items) => {
      const oldIndex = items.findIndex((v) => v.id === fromId);
      const newIndex = items.findIndex((v) => v.id === toId);
      if (oldIndex !== -1 && newIndex !== -1) {
        return arrayMove(items, oldIndex, newIndex);
      }
      return items;
    });
  }, [setVideos]);

  return {
    dragId,
    dragFile,
    setDragFile,
    sensors,
    handleDragStart,
    handleDragEnd,
    onReorder
  };
}
