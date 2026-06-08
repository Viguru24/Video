import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Download, CheckCircle2, AlertCircle, ChevronRight, Cpu, Package, Brain } from 'lucide-react';

interface SetupProgressEvent {
  step: string;
  message: string;
  percent: number;
  done: boolean;
  error: string | null;
}

interface SetupWizardProps {
  onComplete: () => void;
}

type Phase = 'intro' | 'installing' | 'models' | 'done' | 'error';

interface LogLine {
  id: number;
  text: string;
  isError: boolean;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [installPercent, setInstallPercent] = useState(0);
  const [modelPercent, setModelPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const logIdRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addLog = (text: string, isError = false) => {
    const id = logIdRef.current++;
    setLogs(prev => [...prev.slice(-60), { id, text, isError }]);
    setTimeout(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    }, 50);
  };

  // Listen for install progress events
  useEffect(() => {
    let unlistenInstall: (() => void) | undefined;
    let unlistenModels: (() => void) | undefined;

    listen<SetupProgressEvent>('setup-progress', (event) => {
      const { step, message, percent, done, error } = event.payload;
      setInstallPercent(percent);
      setStatusMessage(message);
      addLog(message, !!error);

      if (error) {
        setErrorMsg(error);
        setPhase('error');
      } else if (done) {
        setPhase('models');
        startModelDownload();
      }
    }).then(fn => { unlistenInstall = fn; });

    listen<SetupProgressEvent>('model-download-progress', (event) => {
      const { step, message, percent, done, error } = event.payload;
      setModelPercent(percent);
      setStatusMessage(message);
      addLog(message, !!error);

      if (error) {
        setErrorMsg(error);
        setPhase('error');
      } else if (done) {
        setPhase('done');
        setTimeout(onComplete, 2500);
      }
    }).then(fn => { unlistenModels = fn; });

    return () => {
      unlistenInstall?.();
      unlistenModels?.();
    };
  }, []);

  const startInstall = async () => {
    setPhase('installing');
    addLog('Starting Python environment setup...');
    try {
      await invoke('install_dependencies');
    } catch (err: any) {
      setErrorMsg(String(err));
      setPhase('error');
    }
  };

  const startModelDownload = async () => {
    addLog('Starting AI model weight downloads...');
    try {
      await invoke('download_models');
    } catch (err: any) {
      setErrorMsg(String(err));
      setPhase('error');
    }
  };

  const overallPercent = phase === 'installing'
    ? Math.round(installPercent * 0.6)
    : phase === 'models'
    ? 60 + Math.round(modelPercent * 0.4)
    : phase === 'done' ? 100 : 0;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'radial-gradient(ellipse at 30% 20%, rgba(0,255,136,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(100,100,255,0.06) 0%, transparent 60%), #080b0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      fontFamily: "'Inter', 'Outfit', system-ui, sans-serif",
    }}>
      {/* Ambient glow orbs */}
      <div style={{ position: 'absolute', top: '15%', left: '20%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,255,136,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '15%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(120,100,255,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: 560,
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '40px 44px',
          boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top shimmer line */}
        <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,255,136,0.5), transparent)' }} />

        <AnimatePresence mode="wait">

          {/* ── INTRO ─────────────────────────────────────────── */}
          {phase === 'intro' && (
            <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,200,100,0.1))',
                  border: '1px solid rgba(0,255,136,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 20px rgba(0,255,136,0.15)'
                }}>
                  <Sparkles size={22} color="#00ff88" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(0,255,136,0.7)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>One-time setup</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>AI Features Setup</div>
                </div>
              </div>

              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13.5, lineHeight: 1.7, marginBottom: 28 }}>
                Cosmo Symphony's AI tools (Upscale, Background Remove) need a one-time download of their runtime and model weights. This runs in the background and only needs to happen once.
              </p>

              {/* What gets installed */}
              {[
                { icon: <Cpu size={15} />, label: 'Python 3.11 Runtime', detail: '~8 MB', color: '#60a5fa' },
                { icon: <Package size={15} />, label: 'AI Libraries (PyTorch, OpenCV, basicsr…)', detail: '~380 MB', color: '#a78bfa' },
                { icon: <Brain size={15} />, label: 'Model Weights (Real-ESRGAN, GFPGAN)', detail: '~130 MB', color: '#34d399' },
              ].map(({ icon, label, detail, color }) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', marginBottom: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                }}>
                  <div style={{ color, opacity: 0.9 }}>{icon}</div>
                  <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, flex: 1 }}>{label}</span>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{detail}</span>
                </div>
              ))}

              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 16, marginBottom: 28 }}>
                Total: ~520 MB · Installed to your AppData folder · Internet connection required
              </p>

              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={startInstall}
                  style={{
                    flex: 1, padding: '13px 20px',
                    background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
                    border: 'none', borderRadius: 10,
                    color: '#000', fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8,
                    boxShadow: '0 4px 20px rgba(0,255,136,0.3)',
                  }}
                >
                  Install Now <ChevronRight size={16} />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onComplete}
                  style={{
                    padding: '13px 20px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, color: 'rgba(255,255,255,0.45)',
                    fontWeight: 500, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Skip for now
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── INSTALLING / MODELS ───────────────────────────── */}
          {(phase === 'installing' || phase === 'models') && (
            <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,200,100,0.1))',
                  border: '1px solid rgba(0,255,136,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Download size={22} color="#00ff88" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(0,255,136,0.7)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    {phase === 'installing' ? 'Step 1 of 2 — Python & Libraries' : 'Step 2 of 2 — AI Models'}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Installing…</div>
                </div>
              </div>

              {/* Overall progress bar */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Overall progress</span>
                  <span style={{ color: 'rgba(0,255,136,0.8)', fontSize: 11, fontWeight: 600 }}>{overallPercent}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <motion.div
                    animate={{ width: `${overallPercent}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    style={{ height: '100%', background: 'linear-gradient(90deg, #00ff88, #00ccaa)', borderRadius: 99 }}
                  />
                </div>
              </div>

              {/* Current step */}
              <div style={{
                padding: '10px 14px', marginBottom: 14,
                background: 'rgba(0,255,136,0.05)',
                border: '1px solid rgba(0,255,136,0.12)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.65)', fontSize: 12.5,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                  style={{ width: 12, height: 12, border: '2px solid rgba(0,255,136,0.5)', borderTopColor: '#00ff88', borderRadius: '50%', flexShrink: 0 }}
                />
                {statusMessage || 'Working…'}
              </div>

              {/* Log output */}
              <div
                ref={logContainerRef}
                style={{
                  height: 140, overflowY: 'auto',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 8, padding: '8px 12px',
                  fontFamily: 'monospace', fontSize: 11,
                  scrollbarWidth: 'thin',
                }}
              >
                {logs.map(line => (
                  <div key={line.id} style={{ color: line.isError ? '#ff6b6b' : 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                    {line.text}
                  </div>
                ))}
              </div>

              <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11.5, marginTop: 14, textAlign: 'center' }}>
                This will take a few minutes. You can minimise the app while it installs.
              </p>
            </motion.div>
          )}

          {/* ── DONE ─────────────────────────────────────────── */}
          {phase === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: 'center', padding: '20px 0' }}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
                style={{ marginBottom: 20 }}
              >
                <CheckCircle2 size={56} color="#00ff88" style={{ margin: '0 auto', filter: 'drop-shadow(0 0 16px rgba(0,255,136,0.5))' }} />
              </motion.div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 10 }}>All done!</div>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13.5 }}>
                AI features are ready. Launching Cosmo Symphony…
              </p>
            </motion.div>
          )}

          {/* ── ERROR ─────────────────────────────────────────── */}
          {phase === 'error' && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <AlertCircle size={36} color="#ff6b6b" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Setup failed</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>You can try again or skip and use the app without AI features</div>
                </div>
              </div>

              <div style={{
                padding: '12px 14px', marginBottom: 20,
                background: 'rgba(255,70,70,0.08)',
                border: '1px solid rgba(255,70,70,0.2)',
                borderRadius: 8, color: '#ff9090', fontSize: 12,
                fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 120, overflowY: 'auto',
              }}>
                {errorMsg}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { setPhase('intro'); setLogs([]); setInstallPercent(0); setModelPercent(0); setErrorMsg(''); }}
                  style={{
                    flex: 1, padding: '12px 20px',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, color: '#fff',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Try Again
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={onComplete}
                  style={{
                    padding: '12px 20px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10, color: 'rgba(255,255,255,0.4)',
                    fontWeight: 500, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Skip
                </motion.button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </div>
  );
}
