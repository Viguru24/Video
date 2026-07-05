import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface CustomConfirmModalProps {
  title: string;
  message: string;
  kind?: 'error' | 'warning';
  onResolve: (val: boolean) => void;
}

export function CustomConfirmModal({
  title,
  message,
  kind = 'warning',
  onResolve,
}: CustomConfirmModalProps) {
  return (
    <div className="modal-overlay" style={{ zIndex: 2000000 }}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="modal-content premium-glass"
        style={{ width: '450px', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '24px' }}
      >
        <div
          className="modal-header"
          style={{
            marginBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              className="accent-icon-box"
              style={{
                background: kind === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                border: `1px solid ${kind === 'error' ? '#ef4444' : '#f59e0b'}`,
              }}
            >
              <AlertCircle
                size={20}
                style={{
                  color: kind === 'error' ? '#ef4444' : '#f59e0b',
                }}
              />
            </div>
            <div>
              <h2
                style={{
                  fontSize: '14px',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                {title}
              </h2>
              <span style={{ fontSize: '9px', opacity: 0.5, fontWeight: 800, letterSpacing: '0.5px' }}>
                {kind === 'error' ? 'CRITICAL ACTIONS PROTOCOL' : 'SYSTEM INTERLOCK ACTION'}
              </span>
            </div>
          </div>
        </div>
        <div
          className="modal-body"
          style={{
            color: 'var(--text-secondary)',
            fontSize: '11px',
            lineHeight: '1.6',
            marginBottom: '24px',
            whiteSpace: 'pre-line',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            className="premium-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--text-primary)',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '11px',
              letterSpacing: '0.5px',
            }}
            onClick={() => onResolve(false)}
          >
            CANCEL
          </button>
          <button
            className="premium-btn"
            style={{
              background: kind === 'error' ? '#ef4444' : 'var(--accent, #00ff88)',
              color: kind === 'error' ? '#ffffff' : '#000000',
              border: 'none',
              padding: '8px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '11px',
              letterSpacing: '0.5px',
              boxShadow:
                kind === 'error'
                  ? '0 0 15px rgba(239, 68, 68, 0.35)'
                  : '0 0 15px rgba(0, 255, 136, 0.25)',
            }}
            onClick={() => onResolve(true)}
          >
            PROCEED
          </button>
        </div>
      </motion.div>
    </div>
  );
}
