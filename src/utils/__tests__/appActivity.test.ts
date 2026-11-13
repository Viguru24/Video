import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeIsAppActive,
  initAppActivityTracking,
  isAppActive,
  subscribeAppActivity,
  teardownAppActivityTracking,
} from '../appActivity';

describe('appActivity', () => {
  beforeEach(() => {
    teardownAppActivityTracking();
  });

  afterEach(() => {
    teardownAppActivityTracking();
    vi.unstubAllGlobals();
  });

  it('requires visible, focused, and unminimized state to be active', () => {
    expect(computeIsAppActive(false, true, false)).toBe(true);
    expect(computeIsAppActive(true, true, false)).toBe(false);
    expect(computeIsAppActive(false, false, false)).toBe(false);
    expect(computeIsAppActive(false, true, true)).toBe(false);
  });

  it('toggles html.app-inactive and notifies subscribers on blur/focus/visibilitychange', () => {
    const winListeners = new Map<string, Set<() => void>>();
    const docListeners = new Map<string, Set<() => void>>();
    const classes = new Set<string>();
    const doc = {
      hidden: false,
      visibilityState: 'visible',
      hasFocus: () => true,
      body: { style: { display: '' }, offsetHeight: 1 },
      documentElement: {
        classList: {
          toggle: (name: string, force?: boolean) => {
            if (force) classes.add(name);
            else classes.delete(name);
          },
        },
      },
      addEventListener: (ev: string, fn: () => void) => {
        if (!docListeners.has(ev)) docListeners.set(ev, new Set());
        docListeners.get(ev)!.add(fn);
      },
      removeEventListener: (ev: string, fn: () => void) => {
        docListeners.get(ev)?.delete(fn);
      },
    };
    const win = {
      addEventListener: (ev: string, fn: () => void) => {
        if (!winListeners.has(ev)) winListeners.set(ev, new Set());
        winListeners.get(ev)!.add(fn);
      },
      removeEventListener: (ev: string, fn: () => void) => {
        winListeners.get(ev)?.delete(fn);
      },
      requestAnimationFrame: (cb: () => void) => {
        cb();
        return 1;
      },
    };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', win);

    const events: boolean[] = [];
    const unsub = subscribeAppActivity((active) => events.push(active));
    const teardown = initAppActivityTracking();

    expect(isAppActive()).toBe(true);
    expect(classes.has('app-inactive')).toBe(false);

    winListeners.get('blur')?.forEach((fn) => fn());
    expect(isAppActive()).toBe(false);
    expect(classes.has('app-inactive')).toBe(true);

    winListeners.get('focus')?.forEach((fn) => fn());
    expect(isAppActive()).toBe(true);
    expect(classes.has('app-inactive')).toBe(false);

    doc.hidden = true;
    doc.visibilityState = 'hidden';
    docListeners.get('visibilitychange')?.forEach((fn) => fn());
    expect(isAppActive()).toBe(false);
    expect(classes.has('app-inactive')).toBe(true);

    expect(events).toEqual([true, false, true, false]);
    unsub();
    teardown();
  });
});
