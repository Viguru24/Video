import { DEFAULT_TOAST_DURATION } from '../constants';

export interface ToastScheduler {
  /** Schedule auto-dismiss after `durationMs` (defaults to DEFAULT_TOAST_DURATION). Cancels any prior pending timer. */
  schedule: (onExpire: () => void, durationMs?: number) => void;
  /** Cancel any pending auto-dismiss timer without invoking the callback. */
  cancel: () => void;
  /** True while an auto-dismiss timer is currently armed. */
  isPending: () => boolean;
}

/**
 * Creates a single-slot auto-dismiss timer controller for transient UI toasts.
 * Guarantees every displayed toast has an active dismiss timer, resets cleanly
 * when replaced, and cancels safely on manual dismiss or component unmount.
 */
export function createToastScheduler(): ToastScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (onExpire: () => void, durationMs: number = DEFAULT_TOAST_DURATION) => {
    cancel();
    const safeDuration = Number.isFinite(durationMs) && durationMs > 0
      ? durationMs
      : DEFAULT_TOAST_DURATION;

    timer = setTimeout(() => {
      timer = null;
      onExpire();
    }, safeDuration);
  };

  const isPending = () => timer !== null;

  return { schedule, cancel, isPending };
}
