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
  componentDidCatch(error: any) {
    console.error('[CRITICAL RUNTIME ERROR]', error);
    try {
      localStorage.setItem('cosmo_last_critical_error', JSON.stringify({
        message: error?.message,
        stack: error?.stack,
        time: new Date().toISOString()
      }));
    } catch {}
    if (isTauri()) {
      try {
        getCurrentWindow().show().catch(() => {});
      } catch {}
    }
  }
  handleClose = () => {
    if (isTauri()) {
      getCurrentWindow().close().catch(() => {});
    } else {
      window.close();
    }
  };
  componentDidMount() {
    window.addEventListener('keydown', this.handleKeyDown);
  }
  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
  }
  handleKeyDown = (e: KeyboardEvent) => {
    if ((this.state as any).hasError && (e.key === 'Escape' || (e.altKey && e.key === 'F4'))) {
      this.handleClose();
    }
  };
  render() {
    if ((this.state as any).hasError) {
      return (
        <div style={{ background: '#09090b', color: '#ef4444', padding: '2.5rem', height: '100vh', boxSizing: 'border-box', fontFamily: 'monospace', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.05em' }}>SYSTEM CRITICAL ERROR</h1>
            <button 
              onClick={this.handleClose} 
              style={{ background: 'rgba(255,255,255,0.08)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.15)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              title="Close window"
            >
              ✕ Close
            </button>
          </div>
          <pre style={{ flex: 1, overflow: 'auto', background: '#121215', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', fontSize: '13px', lineHeight: '1.5' }}>
            {(this.state as any).error?.stack || (this.state as any).error?.message || 'Unknown error occurred'}
          </pre>
          <div style={{ display: 'flex', gap: '12px', marginTop: '1.5rem' }}>
            <button onClick={() => window.location.reload()} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>REBOOT SYSTEM</button>
            <button onClick={this.handleClose} style={{ background: '#27272a', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>CLOSE APPLICATION</button>
          </div>
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
