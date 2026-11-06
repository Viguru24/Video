import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface AppToastProps {
  toast: string | null;
  toastPath: string | null;
}

export const AppToast: React.FC<AppToastProps> = ({ toast, toastPath }) => {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div 
          initial={{ x: 100, opacity: 0 }} 
          animate={{ x: 0, opacity: 1 }} 
          exit={{ x: 100, opacity: 0 }} 
          className="toast-notification"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: 'rgba(0,0,0,0.85)',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            padding: '12px 20px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 60000,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            fontWeight: 'bold',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            fontSize: '11px'
          }}
        >
          <CheckCircle2 size={16} /> <span>{toast}</span>
          {toastPath && (
            <button 
              onClick={() => {
                invoke('open_folder', { path: toastPath }).catch(err => {
                  console.error("Failed to open folder:", err);
                });
              }}
              style={{
                background: 'var(--accent, #00ff88)',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '9px',
                marginLeft: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 2px 8px rgba(0,255,136,0.3)',
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};
