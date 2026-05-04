import { useState, useCallback, useRef } from 'react';

export function useWorkspaceControls(addLog: (m: string) => void) {
  const [zoom, setZoom] = useState(4);
  const [search, setSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [menu, setMenu] = useState<{ x: number, y: number, id: string } | null>(null);
  const [idToRow, setIdToRow] = useState<Record<string, number>>({});
  const [rowOffsets, setRowOffsets] = useState<number[]>([]);
  const [rotIdx, setRotIdx] = useState(0);

  const onToggleFocus = useCallback((id: string | null) => {
    setFocusedId(id);
    if (id) addLog(`Entering Focus Mode: Unit ${id.split('-')[0]}`);
    else addLog("Exited Focus Mode");
  }, [addLog]);

  const jumpToUnit = useCallback((id: string) => {
    const row = idToRow[id];
    if (typeof row === 'number') {
      const offset = rowOffsets[row];
      const scrollArea = document.querySelector('.video-scroll');
      if (scrollArea && typeof offset === 'number') {
        // Scroll to the exact 'Line' (Row Offset)
        scrollArea.scrollTo({ top: offset, behavior: 'smooth' });
        setRotIdx(row);
        addLog(`Navigated to Line: ${row + 1}`);
      }
    }
  }, [addLog, idToRow, rowOffsets]);

  return {
    zoom, setZoom,
    search, setSearch,
    focusedId, setFocusedId,
    immersive, setImmersive,
    rotating, setRotating,
    menu, setMenu,
    idToRow, setIdToRow,
    rowOffsets, setRowOffsets,
    rotIdx, setRotIdx,
    onToggleFocus,
    jumpToUnit
  };
}
