import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauri } from '../utils/videoUtils';

interface UseAppStartupParams {
  setAiHardwareStatus: (status: string) => void;
  addToRenameHistory: (path: string) => void;
}

export function useAppStartup({ setAiHardwareStatus, addToRenameHistory }: UseAppStartupParams) {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [forceSetup, setForceSetup] = useState(false);

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

  const handleOpenWebsite = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await invoke('open_external_url', { url: 'https://cosmowhisper.com' });
    } catch (err) {
      console.error("Failed to open URL via backend invoke:", err);
      try {
        await openUrl('https://cosmowhisper.com');
      } catch (err2) {
        console.error("Failed to open URL via Tauri openUrl plugin:", err2);
        window.open('https://cosmowhisper.com', '_blank', 'noopener,noreferrer');
      }
    }
  };

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

  // Load rename history and dependencies check on mount
  useEffect(() => {
    invoke<string | null>('load_persistence', { key: 'rename_history' }).then(saved => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) addToRenameHistory('');
        } catch { /* ignore corrupt data */ }
      }
    }).catch(() => {});

    if (isTauri()) {
      invoke<string>('get_drag_icon_path').then(p => {
        (window as any).__CRAB_DRAG_ICON__ = p;
      }).catch(err => console.error("Failed to get drag icon path:", err));

      invoke<any>('check_dependencies').then(status => {
        if (!status.python_ok || !status.packages_ok || !status.models_ok) {
          setNeedsSetup(true);
        }
      }).catch(err => console.error("Dependency check failed:", err));
    }
  }, [addToRenameHistory]);

  return {
    needsSetup,
    setNeedsSetup,
    forceSetup,
    setForceSetup,
    handleOpenWebsite,
  };
}
