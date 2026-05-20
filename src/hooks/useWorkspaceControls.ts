import { useState, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';

export function useWorkspaceControls(addLog: (m: string) => void) {
  const zoom = useStore(state => state.zoom);
  const setZoom = useStore(state => state.setZoom);
  const [search, setSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const immersive = useStore(state => state.immersive);
  const setImmersive = useStore(state => state.setImmersive);
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
    search, setSearch,
    focusedId, setFocusedId,
    rotating, setRotating,
    menu, setMenu,
    idToRow, setIdToRow,
    rowOffsets, setRowOffsets,
    rotIdx, setRotIdx,
    onToggleFocus,
    jumpToUnit
  };
}
