import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauri } from '../utils/videoUtils';
import { useStore } from '../store/useStore';

interface UseAppStartupParams {
  setAiHardwareStatus: (status: string) => void;
}

export function useAppStartup({ setAiHardwareStatus }: UseAppStartupParams) {
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
    if (!isTauri()) {
      setAiHardwareStatus('CPU (Web Preview)');
      return;
    }
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxAttempts = 15;

    const checkStatus = async () => {
      timeoutId = null;
      if (!active || document.hidden) return;
      try {
        const res = await invoke<string>('get_ai_hardware_status');
        if (!active) return;
        if (res === 'Detecting...') {
          attempts += 1;
          if (attempts >= maxAttempts) {
            setAiHardwareStatus('CPU (Bilateral Filter Fallback)');
            return;
          }
          setAiHardwareStatus(res);
          timeoutId = setTimeout(checkStatus, 1000);
        } else {
          setAiHardwareStatus(res);
        }
      } catch (e) {
        console.error("Failed to query hardware status:", e);
        if (active) setAiHardwareStatus('CPU (Bilateral Filter Fallback)');
      }
    };

    const onVisibility = () => {
      if (!document.hidden && active && attempts < maxAttempts && timeoutId === null) {
        checkStatus();
      } else if (document.hidden && timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    checkStatus();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [setAiHardwareStatus]);

  // Load rename history and dependencies check on mount
  useEffect(() => {
    invoke<string | null>('load_persistence', { key: 'rename_history' }).then(saved => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const validEntries = parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
            if (validEntries.length > 0) {
              useStore.getState().setRenameHistory(validEntries);
            }
          }
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
  }, []);

  return {
    needsSetup,
    setNeedsSetup,
    forceSetup,
    setForceSetup,
    handleOpenWebsite,
  };
}
