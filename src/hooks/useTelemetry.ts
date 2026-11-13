import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TELEMETRY_INTERVAL } from '../constants';
import { handleError, isAbortError } from '../utils/errorHandler';
import { isTauri } from '../utils/videoUtils';
import type { TelemetryData } from '../types';

/**
 * Custom hook to manage hardware telemetry and system diagnostics.
 */
export function useTelemetry(isPopout: boolean = false) {
  const [telemetry, setTelemetry] = useState<TelemetryData>({ 
    cpu: '0%', 
    mem: '0/0GB', 
    gpu: 'Detecting...' 
  });

  useEffect(() => {
    if (isPopout || !isTauri()) return;
    
    let mounted = true;
    const abortController = new AbortController();
    let interval: ReturnType<typeof setInterval> | null = null;
    
    const poll = async () => {
      if (!mounted || abortController.signal.aborted || document.hidden) return;
      
      try {
        const data = await invoke<TelemetryData>('get_telemetry');
        if (data && mounted && !abortController.signal.aborted) {
          setTelemetry(data);
        }
      } catch (err) {
        if (!isAbortError(err) && mounted && !abortController.signal.aborted) {
          handleError(err, 'telemetry', { logToConsole: true });
        }
      }
    };

    const startPolling = () => {
      if (interval !== null) return;
      poll();
      interval = setInterval(poll, TELEMETRY_INTERVAL);
    };

    const stopPolling = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    if (!document.hidden) {
      startPolling();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      mounted = false;
      abortController.abort();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
    };
  }, [isPopout]);

  return telemetry;
}
