import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../utils/videoUtils';

interface UseAppSystemEventsProps {
  quickFolders: any[];
  setQuickFolders: (folders: any[]) => void;
  setAiHardwareStatus: (status: string) => void;
  setIsCommandPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useAppSystemEvents({
  quickFolders,
  setQuickFolders,
  setAiHardwareStatus,
  setIsCommandPaletteOpen
}: UseAppSystemEventsProps) {
  const hasCheckedQuickFolders = useRef(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  // Reveal window only after React has painted its first frame
  useEffect(() => {
    if (isTauri()) {
      const win = getCurrentWindow();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          win.show().catch(() => {});
          win.setFocus().catch(() => {});
        });
      });
    }
  }, []);

  // Quick folders factory default resolution
  useEffect(() => {
    if (hasCheckedQuickFolders.current) return;
    if (!quickFolders || quickFolders.length === 0) return;
    hasCheckedQuickFolders.current = true;

    if (isTauri()) {
      import('@tauri-apps/api/path').then(({ appDataDir, pictureDir, videoDir }) => {
        appDataDir().then(dir => {
          localStorage.setItem('cosmo-app-data-dir', dir);
        }).catch(err => console.error("Failed to get appDataDir:", err));

        (async () => {
          try {
            const nextFolders = [...quickFolders];
            let modified = false;

            for (let i = 0; i < nextFolders.length; i++) {
              const folder = nextFolders[i];
              if (folder.id === 'demo-pictures' && folder.path.startsWith('G:\\')) {
                const picPath = await pictureDir();
                if (picPath) {
                  nextFolders[i] = { ...folder, path: picPath };
                  modified = true;
                }
              } else if (folder.id === 'demo-videos' && folder.path.startsWith('G:\\')) {
                const vidPath = await videoDir();
                if (vidPath) {
                  nextFolders[i] = { ...folder, path: vidPath };
                  modified = true;
                }
              }
            }

            if (modified) {
              setQuickFolders(nextFolders);
            }
          } catch (err) {
            console.error("Failed to initialize default quick folders:", err);
          }
        })();
      }).catch(err => console.error("Failed to import @tauri-apps/api/path:", err));
    }
  }, [quickFolders, setQuickFolders]);

  // Query AI hardware status
  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      try {
        const res = await invoke<string>('get_ai_hardware_status');
        if (active) {
          setAiHardwareStatus(res);
          if (res === 'Detecting...') {
            setTimeout(checkStatus, 1000);
          }
        }
      } catch (e) {
        console.error("Failed to query hardware status:", e);
      }
    };
    checkStatus();
    return () => {
      active = false;
    };
  }, [setAiHardwareStatus]);

  // Window maximized state tracking
  useEffect(() => {
    if (!isTauri()) return;
    const checkMaximized = async () => {
      try {
        const maximized = await getCurrentWindow().isMaximized();
        setIsWindowMaximized(maximized);
      } catch {}
    };
    checkMaximized();
    const unlistenResize = getCurrentWindow().onResized(checkMaximized);
    return () => {
      unlistenResize.then(u => u());
    };
  }, []);

  // Command palette hotkey
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsCommandPaletteOpen]);

  return { isWindowMaximized };
}
