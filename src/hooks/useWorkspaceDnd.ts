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

  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerCleanupRef = useRef<(() => void) | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragId(event.active.id as string);

    const onPointerMove = (e: PointerEvent) => {
      dragPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onPointerMove);
    dragPointerCleanupRef.current = () => {
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  const performStandardReorder = useCallback((activeId: string, overId: string) => {
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
  }, [setVideos, addLog]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDragId(null);

    if (dragPointerCleanupRef.current) {
      dragPointerCleanupRef.current();
      dragPointerCleanupRef.current = null;
    }

    const pointer = dragPointerRef.current;
    dragPointerRef.current = null;

    if (pointer) {
      const elementsAtDrop = document.elementsFromPoint(pointer.x, pointer.y);
      const isOverAnotherTile = elementsAtDrop.some(el => {
        const tileEl = el.closest('.grid-item-wrap');
        return tileEl && tileEl.getAttribute('data-id') !== active.id;
      });

      if (!isOverAnotherTile) {
        const isInsideGrid = elementsAtDrop.some(el =>
          el.closest('.video-grid') || el.closest('.video-grid-container') || el.closest('.video-scroll')
        );

        if (isInsideGrid) {
          const activeItem = videos.find(v => v.id === active.id);
          if (activeItem) {
            const effectivePath = activeItem.realPath || '';
            if (effectivePath) {
              (async () => {
                try {
                  const cleanPath = toRealPath(effectivePath) || effectivePath;
                  addLog(`Duplicating unit: ${activeItem.title}...`);
                  setToast(`Creating physical duplicate...`);
                  const resultPath = await invoke<string>('duplicate_file_on_disk', { srcPath: cleanPath });
                  addLog(`Successfully duplicated: ${resultPath}`);

                  const separator = resultPath.includes('\\') ? '\\' : '/';
                  const fileNameWithExt = resultPath.substring(resultPath.lastIndexOf(separator) + 1);
                  const extIdx = fileNameWithExt.lastIndexOf('.');
                  const titleName = extIdx > 0 ? fileNameWithExt.substring(0, extIdx) : fileNameWithExt;

                  const newItem: VideoItem = {
                    id: crypto.randomUUID(),
                    url: toCosmoUrl(resultPath),
                    realPath: resultPath,
                    title: titleName,
                    repeatMode: 'none',
                    repeatCount: 0,
                    cols: 1,
                    currentIdx: 0,
                    playing: masterPlaying,
                    muted: masterMuted,
                  };

                  setVideos(prev => {
                    const idx = prev.findIndex(v => v.id === activeItem.id);
                    if (idx !== -1) {
                      const next = [...prev];
                      next.splice(idx + 1, 0, newItem);
                      return next;
                    }
                    return [...prev, newItem];
                  });

                  setToast(`Duplicated → ${titleName}`);
                  setTimeout(() => setToast(null), 3000);
                } catch (err) {
                  console.error('Duplicate via drag-to-blank failed:', err);
                  addLog(`ERROR: Failed to duplicate - ${err}`);
                  setToast(`Duplicate failed: ${err}`);
                  setTimeout(() => setToast(null), 4000);
                }
              })();
              return;
            }
          }
        }
      }
    }

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
  }, [videos, setVideos, masterPlaying, masterMuted, selectedIds, setSelectedIds, setSelectionMode, setToast, addLog, performStandardReorder]);

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
