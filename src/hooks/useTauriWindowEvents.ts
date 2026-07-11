import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../utils/videoUtils';

export function useTauriWindowEvents() {
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    
    let unlistenResize: (() => void) | undefined;
    let unlistenMaximize: (() => void) | undefined;
    let unlistenUnmaximize: (() => void) | undefined;
    const timeouts: any[] = [];

    const checkMaximized = async () => {
      try {
        const isMax = await getCurrentWindow().isMaximized();
        setIsWindowMaximized(isMax);
      } catch (e) {
        console.error("Failed to check if window is maximized:", e);
      }
    };

    // Run initial checks at various delays to prevent startup race conditions
    checkMaximized();
    timeouts.push(setTimeout(checkMaximized, 50));
    timeouts.push(setTimeout(checkMaximized, 200));
    timeouts.push(setTimeout(checkMaximized, 500));
    timeouts.push(setTimeout(checkMaximized, 1000));
    timeouts.push(setTimeout(checkMaximized, 2000));

    const setupListeners = async () => {
      try {
        const win = getCurrentWindow();
        
        unlistenResize = await win.onResized(() => {
          checkMaximized();
          timeouts.push(setTimeout(checkMaximized, 100));
          timeouts.push(setTimeout(checkMaximized, 250));
        });

        unlistenMaximize = await win.listen('tauri://maximize', () => {
          setIsWindowMaximized(true);
          timeouts.push(setTimeout(checkMaximized, 100));
        });

        unlistenUnmaximize = await win.listen('tauri://unmaximize', () => {
          setIsWindowMaximized(false);
          timeouts.push(setTimeout(checkMaximized, 100));
        });
      } catch (err) {
        console.error("Failed to set up Tauri window event listeners:", err);
      }
    };

    setupListeners();

    // Standard DOM resize fallback
    const handleResize = () => {
      checkMaximized();
      timeouts.push(setTimeout(checkMaximized, 150));
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (unlistenResize) unlistenResize();
      if (unlistenMaximize) unlistenMaximize();
      if (unlistenUnmaximize) unlistenUnmaximize();
      window.removeEventListener('resize', handleResize);
      timeouts.forEach(t => clearTimeout(t));
    };
  }, []);

  return { isWindowMaximized };
}
