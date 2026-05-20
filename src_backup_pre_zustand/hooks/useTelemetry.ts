import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TELEMETRY_INTERVAL } from '../constants';
import { handleError, isAbortError } from '../utils/errorHandler';
import type { TelemetryData } from '../types';

/**
 * Custom hook to manage hardware telemetry and system diagnostics.
 */
export function useTelemetry(isPopout: boolean = false) {
  const [telemetry, setTelemetry] = useState<TelemetryData>({ 
    cpu: '0%', 
    mem: '0/0GB', 
    gpu: 'RTX 5080' 
  });

  useEffect(() => {
    if (isPopout) return;
    
    let mounted = true;
    const abortController = new AbortController();
    
    const poll = async () => {
      if (!mounted || abortController.signal.aborted) return;
      
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

    // Initial poll
    poll();
    
    const interval = setInterval(poll, TELEMETRY_INTERVAL);
    
    return () => {
      mounted = false;
      abortController.abort();
      clearInterval(interval);
    };
  }, [isPopout]);

  return telemetry;
}
