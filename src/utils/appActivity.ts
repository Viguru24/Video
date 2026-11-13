import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from './videoUtils';

export type AppActivityListener = (active: boolean) => void;

const listeners = new Set<AppActivityListener>();
let initialized = false;
let windowFocused = true;
let windowMinimized = false;
let lastNotifiedActive: boolean | null = null;
let teardownFns: Array<() => void> = [];

/** Compute whether the application window is visible, unminimized, and focused. */
export function computeIsAppActive(
  hidden: boolean,
  focused: boolean,
  minimized: boolean
): boolean {
  return !hidden && focused && !minimized;
}

/** Return current active state of the application window. */
export function isAppActive(): boolean {
  if (typeof document === 'undefined') return true;
  return computeIsAppActive(document.hidden, windowFocused, windowMinimized);
}

function syncDomAndNotify(force: boolean = false): void {
  if (typeof document === 'undefined') return;
  const active = isAppActive();
  document.documentElement.classList.toggle('app-inactive', !active);
  if (!force && lastNotifiedActive === active) return;
  lastNotifiedActive = active;
  listeners.forEach((cb) => {
    try {
      cb(active);
    } catch {
      /* isolate subscriber errors */
    }
  });
}

/**
 * Subscribe to active/inactive transitions (window focus, visibility, and minimize state).
 * Returns an unsubscribe function.
 */
export function subscribeAppActivity(listener: AppActivityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Initialize window focus, visibility, and Tauri minimize listeners so idle CSS
 * animations, media playback, and polling pause immediately when inactive.
 */
export function initAppActivityTracking(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  if (initialized) {
    return () => teardownAppActivityTracking();
  }
  initialized = true;
  windowFocused = document.hasFocus();
  windowMinimized = false;
  syncDomAndNotify(true);

  const onBlur = () => {
    windowFocused = false;
    syncDomAndNotify();
  };

  const onFocus = () => {
    windowFocused = true;
    windowMinimized = false;
    syncDomAndNotify();
  };

  const syncIfDocumentFocused = () => {
    if (!document.hidden && document.hasFocus()) {
      windowFocused = true;
      windowMinimized = false;
      syncDomAndNotify();
    }
  };

  const onVisibilityChange = () => {
    if (!document.hidden && document.hasFocus()) {
      windowFocused = true;
      windowMinimized = false;
    }
    syncDomAndNotify();
    if (document.visibilityState === 'visible' && isAppActive()) {
      window.requestAnimationFrame(() => {
        document.body.style.display = 'none';
        void document.body.offsetHeight;
        document.body.style.display = '';
      });
    }
  };

  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  document.addEventListener('focusin', syncIfDocumentFocused);
  document.addEventListener('pointerdown', syncIfDocumentFocused, { passive: true });
  document.addEventListener('keydown', syncIfDocumentFocused, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  teardownFns.push(
    () => window.removeEventListener('blur', onBlur),
    () => window.removeEventListener('focus', onFocus),
    () => document.removeEventListener('focusin', syncIfDocumentFocused),
    () => document.removeEventListener('pointerdown', syncIfDocumentFocused),
    () => document.removeEventListener('keydown', syncIfDocumentFocused),
    () => document.removeEventListener('visibilitychange', onVisibilityChange)
  );

  if (isTauri()) {
    let disposed = false;
    const win = getCurrentWindow();

    Promise.all([
      win.isFocused().catch(() => document.hasFocus()),
      win.isMinimized().catch(() => false),
    ]).then(([focused, minimized]) => {
      if (disposed) return;
      windowFocused = (focused || document.hasFocus()) && !minimized;
      windowMinimized = minimized;
      syncDomAndNotify();
    });

    win.onFocusChanged(({ payload: focused }) => {
      if (disposed) return;
      windowFocused = focused;
      if (focused) windowMinimized = false;
      syncDomAndNotify();
    }).then((unlisten) => {
      if (disposed) unlisten();
      else teardownFns.push(unlisten);
    }).catch(() => {});

    win.onResized(() => {
      if (disposed) return;
      win.isMinimized().then((minimized) => {
        if (disposed) return;
        windowMinimized = minimized;
        syncDomAndNotify();
      }).catch(() => {});
    }).then((unlisten) => {
      if (disposed) unlisten();
      else teardownFns.push(unlisten);
    }).catch(() => {});

    teardownFns.push(() => {
      disposed = true;
    });
  }

  return () => teardownAppActivityTracking();
}

/** Tear down global activity listeners (primarily for tests/cleanup). */
export function teardownAppActivityTracking(): void {
  const fns = teardownFns;
  teardownFns = [];
  fns.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore teardown errors */
    }
  });
  initialized = false;
  lastNotifiedActive = null;
  windowFocused = true;
  windowMinimized = false;
}
