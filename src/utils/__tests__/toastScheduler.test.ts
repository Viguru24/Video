import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createToastScheduler } from '../toastScheduler';
import { DEFAULT_TOAST_DURATION, SNAPSHOT_THUMBNAIL_DURATION } from '../../constants';

describe('toastScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-dismisses after DEFAULT_TOAST_DURATION (3500ms) by default', () => {
    const scheduler = createToastScheduler();
    const onExpire = vi.fn();

    scheduler.schedule(onExpire);
    expect(scheduler.isPending()).toBe(true);

    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION - 1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(scheduler.isPending()).toBe(false);
  });

  it('resets the countdown when a newer toast replaces an earlier toast', () => {
    const scheduler = createToastScheduler();
    const firstExpire = vi.fn();
    const secondExpire = vi.fn();

    scheduler.schedule(firstExpire, 3500);
    vi.advanceTimersByTime(2500);

    // Second toast arrives (e.g. CosmoShare notification after another toast)
    scheduler.schedule(secondExpire, 3500);

    // Advancing past the first toast's original expiry must NOT dismiss the second toast
    vi.advanceTimersByTime(1500);
    expect(firstExpire).not.toHaveBeenCalled();
    expect(secondExpire).not.toHaveBeenCalled();

    // Second toast dismisses after its full 3500ms
    vi.advanceTimersByTime(2000);
    expect(secondExpire).toHaveBeenCalledTimes(1);
  });

  it('honors custom durations such as SNAPSHOT_THUMBNAIL_DURATION', () => {
    const scheduler = createToastScheduler();
    const onExpire = vi.fn();

    scheduler.schedule(onExpire, SNAPSHOT_THUMBNAIL_DURATION);
    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SNAPSHOT_THUMBNAIL_DURATION - DEFAULT_TOAST_DURATION);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('cancels pending timers cleanly on manual dismiss or unmount', () => {
    const scheduler = createToastScheduler();
    const onExpire = vi.fn();

    scheduler.schedule(onExpire);
    scheduler.cancel();
    expect(scheduler.isPending()).toBe(false);

    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('falls back to DEFAULT_TOAST_DURATION for invalid or non-positive durations', () => {
    const scheduler = createToastScheduler();
    const onExpire = vi.fn();

    scheduler.schedule(onExpire, 0);
    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION - 1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
