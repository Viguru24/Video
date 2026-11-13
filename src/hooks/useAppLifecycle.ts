import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../utils/videoUtils';
import { isAppActive, subscribeAppActivity } from '../utils/appActivity';

export function useAppLifecycle(isPopout: boolean) {
  const [showShutdown, setShowShutdown] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Pre-warm then immediately suspend the AudioContext so WebAudio AudioService
  // uses 0% CPU while idle, yet unlocks cleanly for shutdown audio.
  useEffect(() => {
    if (isPopout) return;
    const warmUp = () => {
      try {
        if (!audioCtxRef.current) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
            ctx.suspend().catch(() => {});
          }
        }
      } catch { /* silently ignore */ }
    };

    document.addEventListener('pointerdown', warmUp, { passive: true, once: true });
    document.addEventListener('keydown', warmUp, { passive: true, once: true });
    return () => {
      document.removeEventListener('pointerdown', warmUp);
      document.removeEventListener('keydown', warmUp);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [isPopout]);

  // Pause playing video elements when the window is unfocused, minimized, or hidden and resume on return
  useEffect(() => {
    const pausedByInactive = new Set<HTMLVideoElement>();
    const syncVideoPlayback = (active: boolean) => {
      if (!active) {
        document.querySelectorAll('video').forEach((v) => {
          if (!v.paused && !v.ended) {
            pausedByInactive.add(v);
            v.pause();
          }
        });
      } else if (pausedByInactive.size > 0) {
        pausedByInactive.forEach((v) => {
          if (v.isConnected && !v.error) {
            v.play().catch(() => {});
          }
        });
        pausedByInactive.clear();
      }
    };
    syncVideoPlayback(isAppActive());
    const unsubscribe = subscribeAppActivity(syncVideoPlayback);
    return () => {
      unsubscribe();
      pausedByInactive.clear();
    };
  }, []);

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
