import { useState, useRef, useCallback, useEffect } from 'react';
import { DEFAULT_TOAST_DURATION, SNAPSHOT_THUMBNAIL_DURATION } from '../constants';
import { createToastScheduler } from '../utils/toastScheduler';

export function useAppLogger() {
  const [toast, setToastState] = useState<string | null>(null);
  const [toastPath, setToastPath] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ t: string, m: string }[]>([]);
  const toastSchedulerRef = useRef(createToastScheduler());

  const dismissToast = useCallback(() => {
    toastSchedulerRef.current.cancel();
    setToastState(null);
    setToastPath(null);
  }, []);

  const setToast = useCallback((msg: string | null, durationMs: number = DEFAULT_TOAST_DURATION) => {
    if (!msg) {
      toastSchedulerRef.current.cancel();
      setToastState(null);
      setToastPath(null);
      return;
    }

    setToastState(msg);
    toastSchedulerRef.current.schedule(() => {
      setToastState(null);
      setToastPath(null);
    }, durationMs);
  }, []);

  const addLog = useCallback((m: string) => {
    setLogs(p => [{ t: new Date().toLocaleTimeString(), m }, ...p].slice(0, 50));
    const lower = m.toLowerCase();
    if (lower.includes("snapshot") || lower.includes("decommission") || lower.includes("annihilate") || lower.includes("deleted")) {
      let toastMsg = m;
      if (m.includes("Snapshot saved to: ")) {
        const path = m.split("Snapshot saved to: ")[1];
        setToastPath(path);
        toastMsg = "Snapshot Saved";
      } else {
        setToastPath(null);
      }
      setToast(toastMsg, SNAPSHOT_THUMBNAIL_DURATION);
    }
  }, [setToast]);

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
    const scheduler = toastSchedulerRef.current;
    return () => {
      scheduler.cancel();
      if (globalHudTimerRef.current) clearTimeout(globalHudTimerRef.current);
    };
  }, []);

  return {
    toast,
    setToast,
    dismissToast,
    toastPath,
    setToastPath,
    logs,
    addLog,
    globalHud,
    triggerGlobalHud,
  };
}
