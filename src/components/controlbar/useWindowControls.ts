import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../../utils/videoUtils';

export function useWindowControls() {
  const [isSpanned, setIsSpanned] = useState(false);
  const [showMaxMenu, setShowMaxMenu] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const checkMax = async () => {
      try {
        const max = await getCurrentWindow().isMaximized();
        setIsWindowMaximized(max);
      } catch { /* ignore window state check failure */ }
    };
    checkMax();
    let unlisten: (() => void) | null = null;
    getCurrentWindow().onResized(() => {
      checkMax();
    }).then((u) => { unlisten = u; });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleHeaderMouseDown = useCallback(async (e: React.MouseEvent) => {
    if (!isTauri() || e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]') || target.closest('a') || target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }

    const win = getCurrentWindow();
    const startX = e.screenX;
    const startY = e.screenY;

    const handleMouseMove = async (moveEvent: MouseEvent) => {
      const dist = Math.hypot(moveEvent.screenX - startX, moveEvent.screenY - startY);
      if (dist > 5) {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        const isMax = await win.isMaximized();
        if (isMax || isSpanned) {
          if (isSpanned) {
            await invoke('unspan_monitors').catch(console.error);
            setIsSpanned(false);
          } else {
            await win.unmaximize();
          }
          await new Promise((r) => setTimeout(r, 50));
        }

        await win.startDragging().catch(console.error);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isSpanned]);

  const handleHeaderDoubleClick = useCallback(async (e: React.MouseEvent) => {
    if (!isTauri()) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]') || target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }

    const win = getCurrentWindow();
    if (isSpanned) {
      await invoke('unspan_monitors').catch(console.error);
      setIsSpanned(false);
    } else {
      const isMax = await win.isMaximized();
      if (isMax) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    }
  }, [isSpanned]);

  return {
    isSpanned,
    setIsSpanned,
    showMaxMenu,
    setShowMaxMenu,
    isWindowMaximized,
    handleHeaderMouseDown,
    handleHeaderDoubleClick
  };
}
