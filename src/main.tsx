import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('ServiceWorker registered:', reg))
      .catch((err) => console.error('ServiceWorker registration failed:', err));
  });
}
