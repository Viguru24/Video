import React, { Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ResizeHandles } from './ResizeHandles';
import { IntroOverlay, ShutdownOverlay } from './IntroOverlay';
const SetupWizard = React.lazy(() => import('./SetupWizard').then(m => ({ default: m.SetupWizard })));

interface AppOverlaysProps {
  isPopout: boolean;
  showShutdown: boolean;
  needsSetup: boolean;
  setNeedsSetup: (v: boolean) => void;
  forceSetup: boolean;
  setForceSetup: (v: boolean) => void;
  setAiHardwareStatus: (v: string) => void;
  toast: string | null;
  toastPath: string | null;
  globalHud: { label: string; val: string } | null;
  dragFile: boolean;
  convertingStatus: { current: number; total: number; filename: string } | null;
}

export function AppOverlays({
  isPopout,
  showShutdown,
  needsSetup,
  setNeedsSetup,
  forceSetup,
  setForceSetup,
  setAiHardwareStatus,
  toast,
  toastPath,
  globalHud,
  dragFile,
  convertingStatus
}: AppOverlaysProps) {
  return (
    <>
      <IntroOverlay isPopout={isPopout} />
      <ShutdownOverlay show={showShutdown} />
      <AnimatePresence>
        {needsSetup && (
          <Suspense fallback={null}>
            <SetupWizard
              key="setup-wizard"
              onComplete={async () => {
                setNeedsSetup(false);
                setForceSetup(false);
                try {
                  const res = await invoke<string>('detect_ai_hardware');
                  setAiHardwareStatus(res);
                } catch (e) {
                  console.error("Failed to re-detect AI hardware:", e);
                }
              }}
              force={forceSetup}
            />
          </Suspense>
        )}
      </AnimatePresence>
      <ResizeHandles />
      <div className="nebula-bg" />
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
            <span style={{ fontSize: '9px', fontWeight: '900', color: 'var(--accent, #00ff88)', textTransform: 'uppercase' }}>{globalHud.label}</span>
            <div style={{ width: '1px', height: '12px', background: 'rgba(255, 255, 255, 0.15)' }} />
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#fff', textTransform: 'uppercase' }}>{globalHud.val}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {dragFile && (
        <div className="drag-overlay">
          <img src="/logo.png" className="empty-logo-img" alt="logo" />
          <p>Drop to Add Media</p>
        </div>
      )}

      {convertingStatus && (
        <div className="converting-overlay">
          <div className="converting-spinner" />
          <div className="converting-text">
            <span className="converting-label">Converting</span>
            <span className="converting-count">{convertingStatus.current} of {convertingStatus.total}</span>
            <span className="converting-filename">{convertingStatus.filename}</span>
          </div>
        </div>
      )}
    </>
  );
}
