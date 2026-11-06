import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GlobalHudProps {
  globalHud: { label: string; val: string } | null;
}

export const GlobalHud: React.FC<GlobalHudProps> = ({ globalHud }) => {
  return (
    <AnimatePresence>
      {globalHud && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 30 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          style={{
            position: 'fixed',
            bottom: '90px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(22, 17, 12, 0.85)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(0, 255, 136, 0.25)',
            borderRadius: '24px',
            padding: '8px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 999999,
            boxShadow: '0 10px 30px rgba(0,0,0,0.6), 0 0 15px rgba(0,255,136,0.15)',
            pointerEvents: 'none',
            letterSpacing: '0.5px'
          }}
        >
          <span style={{ fontSize: '9px', fontWeight: '900', color: 'var(--accent, #00ff88)', textTransform: 'uppercase' }}>
            {globalHud.label}
          </span>
          <div style={{ width: '1px', height: '12px', background: 'rgba(255, 255, 255, 0.15)' }} />
          <span style={{ fontSize: '11px', fontWeight: '800', color: '#fff', textTransform: 'uppercase' }}>
            {globalHud.val}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
