import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { invoke } from '@tauri-apps/api/core'

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
}


class ErrorBoundary extends React.Component<{children: React.ReactNode}> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
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

// Universal scroll wheel range input handler
document.addEventListener('wheel', (e) => {
  const target = e.target as HTMLElement;
  if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'range') {
    e.preventDefault();
    const input = target as HTMLInputElement;
    const step = parseFloat(input.step) || 1;
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const val = parseFloat(input.value);
    
    // deltaY < 0 is scroll up (increase), deltaY > 0 is scroll down (decrease)
    const direction = e.deltaY < 0 ? 1 : -1;
    const nextVal = Math.max(min, Math.min(max, val + direction * step));
    
    // Round to float precision based on step to avoid floating point representation issues (e.g. 0.05 + 0.1 = 0.15000000000000002)
    const decimalPlaces = (step.toString().split('.')[1] || '').length;
    const roundedVal = parseFloat(nextVal.toFixed(decimalPlaces));
    
    // Trigger React state change
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, roundedVal.toString());
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      input.value = roundedVal.toString();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}, { passive: false });


// Prevent Ctrl+Wheel zoom and double-tap zoom gestures globally to avoid magnification issues
if (typeof window !== 'undefined') {
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  }, { passive: false });

  // Disable double-tap-to-zoom on touchpad/touchscreen
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
}
