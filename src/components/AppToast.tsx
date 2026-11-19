import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, FolderOpen, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface AppToastProps {
  toast: string | null;
  toastPath: string | null;
  onDismiss?: () => void;
}

export const AppToast: React.FC<AppToastProps> = ({ toast, toastPath, onDismiss }) => {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 100, opacity: 0 }}
          className="toast-notification"
          onClick={() => onDismiss?.()}
          title={onDismiss ? 'Click to dismiss' : undefined}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: 'rgba(9, 9, 11, 0.92)',
            border: '1px solid var(--accent, #10b981)',
            color: 'var(--accent, #34d399)',
            padding: '10px 14px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 60000,
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)',
            fontWeight: 'bold',
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            fontSize: '11px',
            cursor: onDismiss ? 'pointer' : 'default',
            maxWidth: '460px',
          }}
        >
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <span style={{ lineHeight: 1.3 }}>{toast}</span>
          {toastPath && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                invoke('open_folder', { path: toastPath }).catch(err => {
                  console.error("Failed to open folder:", err);
                });
              }}
              style={{
                background: 'var(--accent, #10b981)',
                color: '#09090b',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '9px',
                marginLeft: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.28)',
                transition: 'transform 0.1s'
              }}
              onMouseDown={e => e.stopPropagation()}
              onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <FolderOpen size={10} />
              <span>Open Folder</span>
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#a1a1aa',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                width: '20px',
                height: '20px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <X size={11} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
