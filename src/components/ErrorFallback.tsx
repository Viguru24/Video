import React from 'react';

interface ErrorFallbackProps {
  error: Error;
}

export function ErrorFallback({ error }: ErrorFallbackProps) {
  return (
    <div style={{ background: '#7f1d1d', color: '#fef2f2', padding: 40, height: '100vh', fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>CRITICAL SYSTEM ERROR</h1>
      <pre style={{ background: '#000', padding: 20, borderRadius: 8, overflow: 'auto' }}>
        {error.message}
      </pre>
      <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: '10px 20px', background: '#fff', color: '#7f1d1d', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
        RETRY SYSTEM BOOT
      </button>
    </div>
  );
}
