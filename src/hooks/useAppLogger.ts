import { useState, useRef, useCallback, useEffect } from 'react';
import { SNAPSHOT_THUMBNAIL_DURATION } from '../constants';

export function useAppLogger() {
  const [toast, setToast] = useState<string | null>(null);
  const [toastPath, setToastPath] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ t: string, m: string }[]>([]);

  const addLog = useCallback((m: string) => {
    setLogs(p => [{ t: new Date().toLocaleTimeString(), m }, ...p].slice(0, 50));
    const lower = m.toLowerCase();
    if (lower.includes("snapshot") || lower.includes("decommission") || lower.includes("annihilate") || lower.includes("deleted")) {
      let toastMsg = m;
      if (m.includes("Snapshot saved to: ")) {
        const path = m.split("Snapshot saved to: ")[1];
        setToastPath(path);
        toastMsg = "Snapshot Saved";
      }
      setToast(toastMsg);
      setTimeout(() => {
        setToast(null);
        setToastPath(null);
      }, SNAPSHOT_THUMBNAIL_DURATION);
    }
  }, []);

  const [globalHud, setGlobalHud] = useState<{ label: string; val: string } | null>(null);
  const globalHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerGlobalHud = useCallback((label: string, val: string) => {
    setGlobalHud({ label, val });
    if (globalHudTimerRef.current) clearTimeout(globalHudTimerRef.current);
    globalHudTimerRef.current = setTimeout(() => {
      setGlobalHud(null);
    }, 1200);
  }, []);

  useEffect(() => {
    return () => {
      if (globalHudTimerRef.current) clearTimeout(globalHudTimerRef.current);
    };
  }, []);

  return {
    toast,
    setToast,
    toastPath,
    setToastPath,
    logs,
    addLog,
    globalHud,
    triggerGlobalHud,
  };
}
