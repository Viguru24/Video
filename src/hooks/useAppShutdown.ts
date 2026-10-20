import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../utils/videoUtils';

interface UseAppShutdownProps {
  isPopout: boolean;
}

export function useAppShutdown({ isPopout }: UseAppShutdownProps) {
  const [showShutdown, setShowShutdown] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Pre-warm the AudioContext on the first real user interaction so that
  // WebView2 allows audio playback later (autoplay policy requires a user gesture).
  useEffect(() => {
    if (isPopout) return;
    const warmUp = () => {
      try {
        if (!audioCtxRef.current) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            audioCtxRef.current = new AudioCtx();
            audioCtxRef.current.suspend().catch(() => {});
          }
        }
      } catch (e) {}
      document.removeEventListener('mousedown', warmUp);
      document.removeEventListener('keydown', warmUp);
    };
    document.addEventListener('mousedown', warmUp);
    document.addEventListener('keydown', warmUp);
    return () => {
      document.removeEventListener('mousedown', warmUp);
      document.removeEventListener('keydown', warmUp);
    };
  }, [isPopout]);

  useEffect(() => {
    if (!isTauri() || isPopout) return;

    let unlistenClose: (() => void) | undefined;
    let isClosing = false;

    const setupCloseListener = async () => {
      try {
        const win = getCurrentWindow();
        unlistenClose = await win.onCloseRequested(async (event) => {
          if (isClosing) { event.preventDefault(); return; }
          isClosing = true;
          event.preventDefault();
          setShowShutdown(true);

          try {
            const ctx = audioCtxRef.current;
            if (ctx) {
              ctx.resume().catch(e => console.warn("AudioContext resume failed:", e));
              const now = ctx.currentTime;

              const osc1 = ctx.createOscillator();
              osc1.type = 'sine';
              osc1.frequency.setValueAtTime(360, now);
              osc1.frequency.exponentialRampToValueAtTime(90, now + 2.0);

              const osc2 = ctx.createOscillator();
              osc2.type = 'triangle';
              osc2.frequency.setValueAtTime(720, now);
              osc2.frequency.exponentialRampToValueAtTime(180, now + 2.0);

              const osc3 = ctx.createOscillator();
              osc3.type = 'sine';
              osc3.frequency.setValueAtTime(1440, now);
              osc3.frequency.exponentialRampToValueAtTime(360, now + 2.0);

              const filter = ctx.createBiquadFilter();
              filter.type = 'lowpass';
              filter.Q.setValueAtTime(2, now);
              filter.frequency.setValueAtTime(3000, now);
              filter.frequency.exponentialRampToValueAtTime(150, now + 1.8);

              const gainNode = ctx.createGain();
              gainNode.gain.setValueAtTime(0, now);
              gainNode.gain.linearRampToValueAtTime(0.08, now + 0.2);
              gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

              osc1.connect(filter);
              osc2.connect(filter);
              osc3.connect(filter);
              filter.connect(gainNode);
              gainNode.connect(ctx.destination);

              osc1.start(now); osc2.start(now); osc3.start(now);
              osc1.stop(now + 2.8); osc2.stop(now + 2.8); osc3.stop(now + 2.8);
            }
          } catch (e) {
            console.warn('Shutdown sound failed:', e);
          }

          setTimeout(async () => {
            try {
              await invoke('exit_app');
              await win.close();
            } catch {
              await win.close();
            }
          }, 2600);
        });
      } catch (err) {
        console.error("Failed to setup close listener:", err);
      }
    };

    setupCloseListener();

    return () => {
      if (unlistenClose) unlistenClose();
    };
  }, [isPopout]);

  return { showShutdown };
}
