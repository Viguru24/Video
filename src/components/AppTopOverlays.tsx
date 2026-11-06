import React, { Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { IntroOverlay, ShutdownOverlay } from './IntroOverlay';
import { SetupWizard } from './SetupWizard';
import { ResizeHandles } from './ResizeHandles';
import { AppToast } from './AppToast';
import { GlobalHud } from './GlobalHud';

interface AppTopOverlaysProps {
  isPopout: boolean;
  showShutdown: boolean;
  needsSetup: boolean;
  setNeedsSetup: (val: boolean) => void;
  forceSetup: boolean;
  setForceSetup: (val: boolean) => void;
  setAiHardwareStatus: (status: string) => void;
  toast: string | null;
  toastPath: string | null;
  globalHud: { label: string; val: string } | null;
  dragFile: boolean;
  convertingStatus: { current: number; total: number; filename: string } | null;
}

export const AppTopOverlays: React.FC<AppTopOverlaysProps> = ({
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
  convertingStatus,
}) => {
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
                  console.error('Failed to re-detect AI hardware:', e);
                }
              }}
              force={forceSetup}
            />
          </Suspense>
        )}
      </AnimatePresence>
      <ResizeHandles />
      <div className="nebula-bg" />

      <AppToast toast={toast} toastPath={toastPath} />
      <GlobalHud globalHud={globalHud} />

      {dragFile && (
        <div className="drag-overlay">
          <img src="/logo.png" className="empty-logo-img" alt="Drop to Add" />
          <p>Drop to Add Media</p>
        </div>
      )}

      {convertingStatus && (
        <div className="converting-overlay">
          <div className="converting-spinner" />
          <div className="converting-text">
            <span className="converting-label">Converting</span>
            <span className="converting-count">
              {convertingStatus.current} of {convertingStatus.total}
            </span>
            <span className="converting-filename">{convertingStatus.filename}</span>
          </div>
        </div>
      )}
    </>
  );
};
