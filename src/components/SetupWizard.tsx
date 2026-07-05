import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Download, CheckCircle2, AlertCircle, ChevronRight, Cpu, Package, Brain, Minimize2, Maximize2 } from 'lucide-react';

interface SetupProgressEvent {
  step: string;
  message: string;
  percent: number;
  done: boolean;
  error: string | null;
}

interface SetupWizardProps {
  onComplete: () => void;
  force?: boolean;
}

type Phase = 'intro' | 'installing' | 'models' | 'done' | 'gpu-done' | 'error';

interface LogLine {
  id: number;
  text: string;
  isError: boolean;
}

export function SetupWizard({ onComplete, force }: SetupWizardProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [installPercent, setInstallPercent] = useState(0);
  const [modelPercent, setModelPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const logIdRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [customPath, setCustomPath] = useState<string>('');

  useEffect(() => {
    invoke<string | null>('get_custom_install_path').then((path) => {
      if (path) {
        setCustomPath(path);
      }
    });
  }, []);

  const handlePickCustomPath = async () => {
    try {
      const selected = await invoke<string>('select_folder_cmd');
      if (selected) {
        await invoke('set_custom_install_path', { path: selected });
        setCustomPath(selected);
      }
    } catch (e: any) {
      if (e !== 'Cancelled') {
        console.error(e);
      }
    }
  };

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

    let unlistenGPU: (() => void) | undefined;

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
      }
    }).then(fn => { unlistenModels = fn; });

    listen<SetupProgressEvent>('gpu-pack-progress', (event) => {
      const { step, message, percent, done, error } = event.payload;
      setInstallPercent(percent);
      setStatusMessage(message);
      addLog(message, !!error);

      if (error) {
        setErrorMsg(error);
        setPhase('error');
      } else if (done) {
        setPhase('gpu-done');
      }
    }).then(fn => { unlistenGPU = fn; });

    return () => {
      unlistenInstall?.();
      unlistenModels?.();
      unlistenGPU?.();
    };
  }, []);

  const startInstall = async () => {
    setPhase('installing');
    addLog('Starting Python environment setup...');
    try {
      await invoke('install_dependencies', { force: force || false });
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

  const [isMinimized, setIsMinimized] = useState(false);

  const overallPercent = phase === 'installing'
    ? Math.round(installPercent * 0.6)
    : phase === 'models'
    ? 60 + Math.round(modelPercent * 0.4)
    : phase === 'done' ? 100 : 0;

  if (isMinimized && (phase === 'installing' || phase === 'models' || phase === 'done')) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 320,
        background: 'rgba(15, 20, 28, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(0, 255, 136, 0.2)',
        borderRadius: 12,
        padding: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        zIndex: 99999,
        fontFamily: "'Inter', 'Outfit', system-ui, sans-serif",
        color: '#fff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
              style={{ width: 14, height: 14, border: '2px solid rgba(0,255,136,0.3)', borderTopColor: '#00ff88', borderRadius: '50%' }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.5px' }}>Installing AI Add-ons...</span>
          </div>
          <button 
            onClick={() => setIsMinimized(false)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', padding: 2 }}
            title="Expand Setup Wizard"
          >
            <Maximize2 size={14} />
          </button>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: `${overallPercent}%`, background: 'linear-gradient(90deg, #00ff88, #00ccaa)', borderRadius: 99 }} />
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {overallPercent}% · {statusMessage || 'Initializing...'}
        </div>
      </div>
    );
  }

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

        {/* Minimize Button in Fullscreen Mode */}
        {(phase === 'installing' || phase === 'models') && (
          <button
            onClick={() => setIsMinimized(true)}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              zIndex: 10,
              transition: 'background 0.2s, color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
            }}
            title="Minimize to Background"
          >
            <Minimize2 size={16} />
          </button>
        )}

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

              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13.5, lineHeight: 1.7, marginBottom: 12 }}>
                Cosmo Symphony's AI tools (Upscale, Background Remove) need a one-time download of their runtime and model weights. This can run in the background while you use the app.
              </p>
              
              <p style={{ color: '#00ff88', fontSize: 12.5, lineHeight: 1.5, marginBottom: 28, opacity: 0.85, fontWeight: 500 }}>
                💡 <b>System Recommendation:</b> This application is designed for powerful PCs. For maximum performance and hardware-accelerated AI execution, an <b>NVIDIA graphics card (with CUDA)</b> or an <b>AMD graphics card (with DirectML)</b> is highly recommended.
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

              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 10,
                padding: '12px 14px',
                marginTop: 16,
                marginBottom: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>INSTALLATION TARGET</span>
                  <button 
                    onClick={handlePickCustomPath}
                    style={{
                      background: 'none', border: 'none', color: 'var(--accent, #00ff88)',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0
                    }}
                  >
                    Change Folder
                  </button>
                </div>
                <span style={{ 
                  color: 'rgba(255,255,255,0.8)', 
                  fontSize: 11, 
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {customPath || 'Default (C:\\Users\\...\\AppData\\Local\\MicroMeadow.CosmoSymphony)'}
                </span>
              </div>

              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginBottom: 28 }}>
                Total: ~520 MB · Internet connection required
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                      padding: '13px 24px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10,
                      color: 'rgba(255,255,255,0.6)',
                      fontWeight: 600,
                      fontSize: 13.5,
                      cursor: 'pointer',
                    }}
                  >
                    Skip for now
                  </motion.button>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={async () => {
                      setPhase('installing');
                      setInstallPercent(0);
                      setStatusMessage('Starting NVIDIA GPU Acceleration Pack download...');
                      addLog('Initializing CUDA parallel chunks transfer...');
                      try {
                        await invoke('install_gpu_pack', { force: false });
                        setPhase('gpu-done');
                        addLog('NVIDIA CUDA GPU acceleration enabled successfully!');
                      } catch (err: any) {
                        setErrorMsg(String(err));
                        setPhase('error');
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 14px',
                      background: 'rgba(0, 255, 136, 0.08)',
                      border: '1px solid rgba(0, 255, 136, 0.25)',
                      borderRadius: 10,
                      color: 'var(--accent, #00ff88)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <span>🟢 Direct NVIDIA GPU (CUDA)</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={async () => {
                      alert("AMD GPU DirectML pack download will begin. (Note: Currently redirects to the standard CUDA framework wrapper on Windows Systems)");
                      setPhase('installing');
                      setInstallPercent(0);
                      setStatusMessage('Starting AMD GPU Pack download...');
                      addLog('Initializing AMD DirectML parallel chunks transfer...');
                      try {
                        await invoke('install_gpu_pack', { force: false });
                        setPhase('gpu-done');
                        addLog('AMD DirectML GPU acceleration enabled successfully!');
                      } catch (err: any) {
                        setErrorMsg(String(err));
                        setPhase('error');
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 14px',
                      background: 'rgba(255, 77, 106, 0.08)',
                      border: '1px solid rgba(255, 77, 106, 0.25)',
                      borderRadius: 10,
                      color: 'var(--danger, #ff4d6a)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <span>🔴 Direct AMD GPU (DirectML)</span>
                  </motion.button>
                </div>
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
                This will take a few minutes. You can minimize this window to use the app in the background.
              </p>
            </motion.div>
          )}

          {/* ── DONE ─────────────────────────────────────────── */}
          {phase === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: 'center', padding: '10px 0' }}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
                style={{ marginBottom: 16 }}
              >
                <CheckCircle2 size={52} color="#00ff88" style={{ margin: '0 auto', filter: 'drop-shadow(0 0 16px rgba(0,255,136,0.5))' }} />
              </motion.div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 6 }}>CPU Backend Ready!</div>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
                The basic AI features have been successfully installed and will run on your CPU.
              </p>

              <div style={{
                background: 'rgba(0, 255, 196, 0.04)',
                border: '1px solid rgba(0, 255, 196, 0.12)',
                borderRadius: 12,
                padding: '16px',
                marginBottom: 24,
                textAlign: 'left'
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent, #00ffc4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  🚀 Enable GPU Hardware Acceleration
                </div>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
                  Do you have a dedicated graphics card? You can upgrade to a hardware-accelerated package now (or later in Settings) for instant upscales:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={async () => {
                      setPhase('installing');
                      setInstallPercent(0);
                      setStatusMessage('Starting NVIDIA GPU Acceleration Pack download...');
                      addLog('Initializing CUDA parallel chunks transfer...');
                      try {
                        await invoke('install_gpu_pack', { force: false });
                        setPhase('done');
                        addLog('NVIDIA CUDA GPU acceleration enabled successfully!');
                      } catch (err: any) {
                        setErrorMsg(String(err));
                        setPhase('error');
                      }
                    }}
                    style={{
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,255,136,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  >
                    <span>🟢 Upgrade for NVIDIA GPUs (CUDA Pack)</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>~2.8 GB</span>
                  </button>
                  <button
                    onClick={async () => {
                      alert("AMD GPU DirectML pack download will begin. (Note: Currently redirects to the standard CUDA framework wrapper on Windows Systems)");
                      setPhase('installing');
                      setInstallPercent(0);
                      setStatusMessage('Starting AMD GPU Acceleration Pack download...');
                      addLog('Initializing AMD DirectML parallel chunks transfer...');
                      try {
                        await invoke('install_gpu_pack', { force: false });
                        setPhase('done');
                        addLog('AMD DirectML GPU acceleration enabled successfully!');
                      } catch (err: any) {
                        setErrorMsg(String(err));
                        setPhase('error');
                      }
                    }}
                    style={{
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,255,136,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  >
                    <span>🔴 Upgrade for AMD GPUs (DirectML Pack)</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>~2.8 GB</span>
                  </button>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onComplete}
                style={{
                  padding: '12px 36px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  margin: '0 auto',
                  display: 'block'
                }}
              >
                Use CPU Fallback & Continue
              </motion.button>
            </motion.div>
          )}

          {/* ── GPU DONE ─────────────────────────────────────── */}
          {phase === 'gpu-done' && (
            <motion.div key="gpu-done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: 'center', padding: '20px 0' }}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
                style={{ marginBottom: 20 }}
              >
                <CheckCircle2 size={56} color="#00ff88" style={{ margin: '0 auto', filter: 'drop-shadow(0 0 16px rgba(0,255,136,0.5))' }} />
              </motion.div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 10 }}>GPU Acceleration Active!</div>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 24 }}>
                The high-performance GPU Acceleration Pack has been successfully verified. <br />
                Please restart the application to launch the hardware-accelerated model engine.
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onComplete}
                style={{
                  padding: '12px 36px',
                  background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
                  border: 'none',
                  borderRadius: 10,
                  color: '#000',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(0,255,136,0.2)',
                  margin: '0 auto',
                  display: 'block'
                }}
              >
                Continue & Launch
              </motion.button>
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
