import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../utils/videoUtils';

export function useAppLifecycle(isPopout: boolean) {
  const [showShutdown, setShowShutdown] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Pre-warm the AudioContext on user interaction so that
  // WebView2 allows immediate audio playback without autoplay restrictions.
  useEffect(() => {
    if (isPopout) return;
    const warmUp = () => {
      try {
        if (!audioCtxRef.current) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            audioCtxRef.current = new AudioCtx();
            // An idle AudioContext without connected nodes uses 0% CPU while staying in 'running' state
          }
        } else if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }
      } catch (e) { /* silently ignore */ }
    };

    document.addEventListener('pointerdown', warmUp, { passive: true });
    document.addEventListener('keydown', warmUp, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', warmUp);
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
          // Prevent duplicate close invocations
          if (isClosing) {
            event.preventDefault();
            return;
          }
          isClosing = true;
          event.preventDefault();
          setShowShutdown(true);

          // Pause background HTML video/audio elements so only the shutdown theme plays
          try {
            document.querySelectorAll('video, audio').forEach((el) => {
              try {
                (el as HTMLMediaElement).pause();
              } catch { /* ignore */ }
            });
          } catch { /* ignore */ }

          // Play descending shutdown sci-fi sweep
          try {
            let ctx = audioCtxRef.current;
            if (!ctx || ctx.state === 'closed') {
              const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
              if (AudioCtx) {
                ctx = new AudioCtx();
                audioCtxRef.current = ctx;
              }
            }

            if (ctx) {
              if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
              }

              const now = ctx.currentTime;

              // 1. Root Sub-bass (Sine for deep clean low-end weight)
              const osc1 = ctx.createOscillator();
              osc1.type = 'sine';
              osc1.frequency.setValueAtTime(360, now);
              osc1.frequency.exponentialRampToValueAtTime(90, now + 2.0);

              // 2. Harmonic Oscillator (Triangle for warm analog presence)
              const osc2 = ctx.createOscillator();
              osc2.type = 'triangle';
              osc2.frequency.setValueAtTime(720, now);
              osc2.frequency.exponentialRampToValueAtTime(180, now + 2.0);

              // 3. Shimmer Harmonic (Sine detuned overtone)
              const osc3 = ctx.createOscillator();
              osc3.type = 'sine';
              osc3.frequency.setValueAtTime(1440, now);
              osc3.frequency.exponentialRampToValueAtTime(360, now + 2.0);

              // 4. Resonant Lowpass Filter sweep (cinematic power-down)
              const filter = ctx.createBiquadFilter();
              filter.type = 'lowpass';
              filter.Q.setValueAtTime(2, now);
              filter.frequency.setValueAtTime(3000, now);
              filter.frequency.exponentialRampToValueAtTime(150, now + 1.8);

              // 5. Gain envelope:
              // Fast clean attack (0 -> 0.12 in 150ms),
              // smooth exponential decay to 0.001 at 2.3s,
              // clean linear fade to 0 at 2.5s (no pop)
              const gainNode = ctx.createGain();
              gainNode.gain.setValueAtTime(0, now);
              gainNode.gain.linearRampToValueAtTime(0.12, now + 0.15);
              gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.3);
              gainNode.gain.linearRampToValueAtTime(0, now + 2.5);

              osc1.connect(filter);
              osc2.connect(filter);
              osc3.connect(filter);
              filter.connect(gainNode);
              gainNode.connect(ctx.destination);

              osc1.start(now);
              osc2.start(now);
              osc3.start(now);

              osc1.stop(now + 2.6);
              osc2.stop(now + 2.6);
              osc3.stop(now + 2.6);
            }
          } catch (e) {
            console.warn('Shutdown sound failed:', e);
          }

          // Wait for the full sound to play out and fade naturally into silence (2.7s),
          // allowing the overlay animation to conclude gracefully, then terminate.
          setTimeout(async () => {
            try {
              await invoke('exit_app');
              await win.destroy();
            } catch {
              try {
                await win.destroy();
              } catch {
                window.close();
              }
            }
          }, 2700);
        });
      } catch (err) {
        console.error('Failed to setup close listener:', err);
      }
    };

    setupCloseListener();

    return () => {
      if (unlistenClose) unlistenClose();
    };
  }, [isPopout]);

  return {
    showShutdown,
  };
}
