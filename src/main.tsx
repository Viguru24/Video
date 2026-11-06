import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from './utils/videoUtils'

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const errorMsg = `[Global Error] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}. Stack: ${event.error?.stack || 'no stack'}`;
    invoke('cosmo_log', { msg: errorMsg }).catch(() => {});
  });

  window.addEventListener('unhandledrejection', (event) => {
    const errorMsg = `[Global Unhandled Rejection] Reason: ${event.reason?.message || event.reason}. Stack: ${event.reason?.stack || 'no stack'}`;
    invoke('cosmo_log', { msg: errorMsg }).catch(() => {});
  });

  const originalLog = console.log;
  console.log = (...args) => {
    originalLog(...args);
    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    invoke('cosmo_log', { msg: `[Console Log] ${msg}` }).catch(() => {});
  };

  const originalWarn = console.warn;
  console.warn = (...args) => {
    originalWarn(...args);
    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    invoke('cosmo_log', { msg: `[Console Warn] ${msg}` }).catch(() => {});
  };

  // WebGL context recovery on GPU driver reset/TDR
  window.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    invoke('cosmo_log', { msg: '[Graphics] WebGL context lost - preventing driver abort and awaiting restore' }).catch(() => {});
  }, false);

  window.addEventListener('webglcontextrestored', () => {
    invoke('cosmo_log', { msg: '[Graphics] WebGL context restored successfully' }).catch(() => {});
  }, false);

  // Emergency reload key (Ctrl+F5, Ctrl+Shift+R, or F5 in case of frozen view)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
      window.location.reload();
    }
  });

  // Re-paint on visibility change when tab/window becomes active again
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      window.requestAnimationFrame(() => {
        document.body.style.display = 'none';
        void document.body.offsetHeight; // force reflow
        document.body.style.display = '';
      });
    }
  });

  // Watchdog: Ensure window is revealed and responsive
  setTimeout(() => {
    if (isTauri()) {
      try {
        getCurrentWindow().show().catch(() => {});
      } catch {}
    }
  }, 1500);
}


class ErrorBoundary extends React.Component<{children: React.ReactNode}> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch() {
    if (isTauri()) {
      try {
        getCurrentWindow().show().catch(() => {});
      } catch {}
    }
  }
  render() {
    if ((this.state as any).hasError) {
      return (
        <div style={{ background: '#1a1a1a', color: '#ff4444', padding: '2rem', height: '100vh', fontFamily: 'monospace' }}>
          <h1>SYSTEM CRITICAL ERROR</h1>
          <pre>{(this.state as any).error?.stack || (this.state as any).error?.message}</pre>
          <button onClick={() => window.location.reload()} style={{ background: '#ff4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer' }}>REBOOT SYSTEM</button>
        </div>
      );
    }
    return this.props.children;
  }
}

console.log('>>> [BOOT] Cosmo Symphony main.tsx rendering root...');

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) console.log('ServiceWorker unregistered successfully');
      });
    }
  });
}


if ('caches' in window) {
  caches.keys().then((names) => {
    for (const name of names) {
      caches.delete(name).then(() => {
        console.log('Cache cleared successfully:', name);
      });
    }
  });
}
