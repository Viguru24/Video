import { X, Monitor, MousePointer2, Info, Gauge, Zap, ListRestart, Layers, Palette, HelpCircle, Keyboard, Play, Camera, Maximize, ExternalLink, Download, Sparkles } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../../store/useStore';

interface SettingsModalProps {
  confirmDeletion: boolean;
  setConfirmDeletion: React.Dispatch<React.SetStateAction<boolean>>;
  snapshotDir: string;
  setSnapshotDir: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
  onShowLogs: () => void;
  onForceSetup?: () => void;
}

export function SettingsModal({
  confirmDeletion,
  setConfirmDeletion,
  snapshotDir,
  setSnapshotDir,
  onClose,
  onShowLogs,
  onForceSetup
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'preferences' | 'guide' | 'shortcuts'>('preferences');
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const {
    theme,
    setTheme,
    alwaysOnTop,
    setAlwaysOnTop,
    fitMode,
    setFitMode,
    smartCulling,
    setSmartCulling,
    enableOSFullscreen,
    setEnableOSFullscreen,
    enableSlideshowPanZoom,
    setEnableSlideshowPanZoom,
    aiHardwareStatus,
    setAiHardwareStatus
  } = useStore();
  
  const [customPath, setCustomPath] = useState<string>('');
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [uninstallStatus, setUninstallStatus] = useState<string>('');
  const [showConfirmUninstall, setShowConfirmUninstall] = useState(false);

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
        addLog(`Custom install path set to: ${selected}`);
      }
    } catch (e: any) {
      if (e !== 'Cancelled') {
        console.error(e);
      }
    }
  };

  const handleClearCustomPath = async () => {
    try {
      await invoke('set_custom_install_path', { path: null });
      setCustomPath('');
      addLog('Restored default installation folder (AppData/Local)');
    } catch (e) {
      console.error(e);
    }
  };

  const handleUninstall = async () => {
    setShowConfirmUninstall(false);
    setIsUninstalling(true);
    setUninstallStatus('Uninstalling AI Add-ons...');
    try {
      const report = await invoke<string>('uninstall_addons');
      setUninstallStatus(report);
    } catch (e: any) {
      setUninstallStatus(`Uninstall failed: ${e}`);
    }
  };

  const CustomInstallDirSetting = () => {
    return (
      <>
        <div className="setting-item" style={{ marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>AI INSTALLATION DRIVE / FOLDER</label>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                  Save heavy AI packages (~3 GB) to an alternate drive (e.g. D:\ or E:\)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {customPath && (
                  <button 
                    onClick={handleClearCustomPath}
                    className="browse-btn"
                    style={{ height: '24px', padding: '0 8px', fontSize: '9px', opacity: 0.7 }}
                  >
                    Use Default
                  </button>
                )}
                <button 
                  onClick={handlePickCustomPath}
                  className="browse-btn"
                  style={{ height: '24px', padding: '0 10px', fontSize: '9px', fontWeight: 700 }}
                >
                  {customPath ? 'Change Path' : 'Select Folder'}
                </button>
              </div>
            </div>
            
            <div style={{ 
              background: 'rgba(0,0,0,0.25)', 
              border: '1px solid rgba(255,255,255,0.06)', 
              borderRadius: '4px', 
              padding: '6px 10px', 
              fontSize: '9.5px', 
              color: customPath ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.5)',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              Location: {customPath || 'Default (C:\\Users\\...\\AppData\\Local\\MicroMeadow.CosmoSymphony)'}
            </div>
          </div>
        </div>

          <div className="setting-item" style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '10px', fontWeight: 900, color: '#ef4444', letterSpacing: '1px' }}>UNINSTALL ADD-ONS</label>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                  Purge all model weights and packages to free up storage space
                </span>
              </div>
              <button 
                onClick={() => setShowConfirmUninstall(true)}
                className="browse-btn"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  height: '28px', 
                  padding: '0 12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  fontWeight: 700
                }}
              >
                <span>Uninstall AI Add-ons</span>
              </button>
            </div>
          </div>

          {/* Uninstall double-confirmation dialog */}
          {showConfirmUninstall && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ fontSize: '10.5px', color: '#fff', lineHeight: 1.4 }}>
                <strong>Are you absolutely sure?</strong> This will permanently delete the AI enhancers, models, and dependencies, reclaiming approximately <strong>2 to 4 GB</strong> of space.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={handleUninstall}
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 12px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Yes, Remove All
                </button>
                <button 
                  onClick={() => setShowConfirmUninstall(false)}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '4px',
                    padding: '5px 12px',
                    fontSize: '10px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Uninstaller Status / Result Report */}
          {uninstallStatus && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '6px',
              background: 'rgba(15,20,28,0.95)',
              border: '1px solid rgba(0, 255, 136, 0.25)',
              color: '#fff',
              fontSize: '10.5px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.4,
              maxHeight: '160px',
              overflowY: 'auto'
            }}>
              {uninstallStatus}
              {uninstallStatus.includes('successfully') && (
                <button 
                  onClick={() => { setUninstallStatus(''); setIsUninstalling(false); }}
                  className="browse-btn"
                  style={{ display: 'block', marginTop: '10px', height: '22px', fontSize: '9px' }}
                >
                  Acknowledge Report
                </button>
              )}
            </div>
          )}
      </>
    );
  };

  const addLog = (msg: string) => {
    // Just a placeholder or we can use custom events, but let's just trigger a log if needed
    console.log(msg);
  };

  const mouseDownOnOverlay = useRef(false);

  return (
    <div 
      className="settings-overlay" 
      onMouseDown={(e) => {
        mouseDownOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnOverlay.current) {
          onClose();
        }
      }}
    >
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>System Configuration</h2>
          <button onClick={onClose} className="premium-close-btn">
            <X size={18} />
          </button>
        </div>
        <div className="settings-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
          {/* TAB BAR */}
          <div className="settings-tab-bar">
            <button 
              className={`settings-tab-btn ${activeTab === 'preferences' ? 'active' : ''}`} 
              onClick={() => setActiveTab('preferences')}
            >
              <Palette size={12} />
              <span>Preferences</span>
            </button>
            <button 
              className={`settings-tab-btn ${activeTab === 'guide' ? 'active' : ''}`} 
              onClick={() => setActiveTab('guide')}
            >
              <HelpCircle size={12} />
              <span>User Guide</span>
            </button>
            <button 
              className={`settings-tab-btn ${activeTab === 'shortcuts' ? 'active' : ''}`} 
              onClick={() => setActiveTab('shortcuts')}
            >
              <Keyboard size={12} />
              <span>Shortcuts</span>
            </button>
          </div>

          {/* TAB CONTENT: PREFERENCES */}
          {activeTab === 'preferences' && (
            <>
              <div style={{
                background: 'rgba(0, 255, 136, 0.04)',
                border: '1px solid rgba(0, 255, 136, 0.15)',
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <Zap size={16} color="var(--accent)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <strong style={{ color: '#fff', fontSize: '11px', display: 'block', marginBottom: '2px' }}>High-Performance Hardware Recommended</strong>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.4', display: 'block' }}>
                    Cosmo Video Symphony is engineered for powerful computers. For seamless multi-stream playback, AI subject extraction, and 4x AI upscaling, we highly recommend using a high-spec system with an <b>NVIDIA graphics card</b> supporting CUDA, or an <b>AMD graphics card</b> supporting DirectML.
                  </span>
                </div>
              </div>

              <div className="settings-section">
                <h3>Global Configuration</h3>
                <div className="setting-item">
                  <label>Snapshot Destination</label>
                  <div className="path-picker">
                    <input type="text" readOnly value={snapshotDir || 'Default'} />
                    <button
                      onClick={async () => {
                        const res = await invoke<string | null>('select_folder_cmd');
                        if (res) setSnapshotDir(res);
                      }}
                      className="browse-btn"
                    >
                      Browse
                    </button>
                  </div>
                </div>
                
                <div className="setting-item">
                  <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>DISPLAY ARCHITECTURE</label>
                  <div className="premium-segmented-control">
                    <div 
                      className="control-highlight" 
                      style={{ transform: `translateX(${fitMode === 'cover' ? '0%' : '100%'})` }}
                    />
                    <button className={fitMode === 'cover' ? 'active' : ''} onClick={() => setFitMode('cover')}>
                      WALL
                    </button>
                    <button className={fitMode === 'contain' ? 'active' : ''} onClick={() => setFitMode('contain')}>
                      NATIVE
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>OS FULLSCREEN ON SOLO VIEW</label>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                        {enableOSFullscreen ? 'Toggles OS-level fullscreen (may flicker briefly)' : 'Stays windowed for 100% fluid, lag-free transitions'}
                      </span>
                    </div>
                    <button 
                      className={`premium-switch ${enableOSFullscreen ? 'active' : ''}`}
                      onClick={() => setEnableOSFullscreen(!enableOSFullscreen)}
                      data-label={enableOSFullscreen ? 'ACTIVE' : 'OFF'}
                    >
                      <div className="switch-rail">
                        <div className="switch-thumb" />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>SMART CULLING (HIBERNATION)</label>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                        {smartCulling ? 'Unloads off-screen elements to save memory' : 'Keeps all media active at all times (best for high-spec PCs)'}
                      </span>
                    </div>
                    <button 
                      className={`premium-switch ${smartCulling ? 'active' : ''}`}
                      onClick={() => setSmartCulling(!smartCulling)}
                      data-label={smartCulling ? 'ACTIVE' : 'OFF'}
                    >
                      <div className="switch-rail">
                        <div className="switch-thumb" />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>SLIDESHOW PAN & ZOOM</label>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                        {enableSlideshowPanZoom ? 'The effect is now ON' : 'The effect is now OFF'}
                      </span>
                    </div>
                    <button 
                      className={`premium-switch ${enableSlideshowPanZoom ? 'active' : ''}`}
                      onClick={() => setEnableSlideshowPanZoom(!enableSlideshowPanZoom)}
                      data-label={enableSlideshowPanZoom ? 'ON' : 'OFF'}
                    >
                      <div className="switch-rail">
                        <div className="switch-thumb" />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>DELETION CONFIRMATION</label>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                        {confirmDeletion ? 'Prompts you before any deletion' : 'Deletes instantly without warning'}
                      </span>
                    </div>
                    <button 
                      className={`premium-switch ${confirmDeletion ? 'active' : ''}`}
                      onClick={() => setConfirmDeletion(!confirmDeletion)}
                      data-label={confirmDeletion ? 'CONFIRM' : 'INSTANT'}
                    >
                      <div className="switch-rail">
                        <div className="switch-thumb" />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>SYSTEM LOGS & TELEMETRY</label>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                        Review real-time playback logs and system events
                      </span>
                    </div>
                    <button 
                      onClick={onShowLogs}
                      className="browse-btn"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '28px', padding: '0 12px' }}
                    >
                      <Layers size={12} />
                      <span>View Logs</span>
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>AI ENVIRONMENT SETUP</label>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                        Force a clean download and extraction of the AI dependencies from VPS
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={async () => {
                          setAiHardwareStatus('Detecting...');
                          try {
                            const res = await invoke<string>('detect_ai_hardware');
                            setAiHardwareStatus(res);
                          } catch (e) {
                            console.error(e);
                            setAiHardwareStatus('CPU (Bilateral Filter Fallback)');
                          }
                        }}
                        className="browse-btn"
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          height: '28px', 
                          padding: '0 12px',
                          background: 'rgba(255,255,255,0.06)',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.12)',
                          fontWeight: 600
                        }}
                      >
                        <Sparkles size={12} />
                        <span>Re-detect GPU</span>
                      </button>

                      {onForceSetup && (
                        <button 
                          onClick={onForceSetup}
                          className="browse-btn"
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            height: '28px', 
                            padding: '0 12px',
                            background: 'var(--accent, #00ff88)',
                            color: '#000',
                            border: 'none',
                            fontWeight: 700
                          }}
                        >
                          <ListRestart size={12} />
                          <span>Force Reinstall</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI Custom Installation Drive / Folder Picker */}
                <CustomInstallDirSetting />
              </div>

              <div className="protocol-box" style={{ border: confirmDeletion ? '1px solid rgba(var(--accent-rgb), 0.2)' : '1px solid rgba(239, 68, 68, 0.3)', transition: 'border 0.3s ease', marginTop: '16px' }}>
                <div className="protocol-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '10px', fontWeight: 900, color: confirmDeletion ? 'var(--accent)' : '#ef4444', letterSpacing: '1px', transition: 'color 0.3s ease' }}>
                    OPERATIONAL PROTOCOLS
                  </label>
                  <span style={{ fontSize: '9px', fontWeight: 'bold', color: confirmDeletion ? 'var(--accent)' : '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'color 0.3s ease' }}>
                    {confirmDeletion ? '🛡️ Protected Mode' : '⚠️ Warning: Instant Mode'}
                  </span>
                </div>
                <div className="protocol-content" style={{ marginTop: '8px', fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div className="protocol-row" style={{ color: confirmDeletion ? '#fff' : 'rgba(255, 255, 255, 0.85)' }}>
                    <strong style={{ color: confirmDeletion ? 'inherit' : '#ef4444' }}>REMOVE FROM GRID:</strong>
                    <span>Removes from grid view only. File stays on disk. {confirmDeletion ? '(Confirm prompt active)' : '((INSTANT - No Prompt!))'}</span>
                  </div>
                  <div className="protocol-row" style={{ color: confirmDeletion ? '#fff' : 'rgba(255, 255, 255, 0.85)' }}>
                    <strong style={{ color: confirmDeletion ? 'inherit' : '#ef4444' }}>RECYCLE BIN:</strong>
                    <span>Deletes physical file by moving to Recycle Bin. {confirmDeletion ? '(Confirm prompt active)' : '((INSTANT - No Prompt!))'}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB CONTENT: USER GUIDE */}
          {activeTab === 'guide' && (
            <>
              <div className="settings-section">
                <h3>Symphony Playback Engines</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px', marginBottom: '16px' }}>
                  <div style={{ background: 'rgba(0,255,136,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,255,136,0.1)' }}>
                    <span style={{ fontSize: '9px', color: 'var(--accent, #00ff88)', fontWeight: 'bold', letterSpacing: '1px' }}>NATIVE VIDEO</span>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#fff', fontWeight: 600 }}>MP4, WebM, MOV, M4V, HLS</p>
                    <small style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', display: 'block', marginTop: '4px' }}>GPU accelerated, lag-free.</small>
                  </div>
                  <div style={{ background: 'rgba(168,85,247,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(168,85,247,0.1)' }}>
                    <span style={{ fontSize: '9px', color: '#a855f7', fontWeight: 'bold', letterSpacing: '1px' }}>IMAGE ENGINE</span>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#fff', fontWeight: 600 }}>PNG, JPG, JPEG, SVG, WEBP</p>
                    <small style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', display: 'block', marginTop: '4px' }}>Ultra-sharp renders, upscaling.</small>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  marginBottom: '20px'
                }}>
                  <Download size={16} color="var(--accent, #00ff88)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ fontSize: '11px', color: '#fff', fontWeight: 'bold', margin: '0 0 4px 0' }}>ELITE POWER-UP: HEVC SUPPORT</h4>
                    <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', margin: '0 0 6px 0' }}>
                      Unlock full support for high-resolution 4K MKV, HEVC, and MOV files by installing the official Microsoft extension.
                    </p>
                    <a 
                      href="https://apps.microsoft.com/store/detail/hevc-video-extensions/9NMZLZL57R3T" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ fontSize: '10px', color: 'var(--accent, #00ff88)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}
                    >
                      <span>Get HEVC Extensions from Microsoft Store</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(0, 255, 136, 0.02)',
                  border: '1px solid rgba(0, 255, 136, 0.08)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  marginBottom: '20px'
                }}>
                  <Zap size={16} color="var(--accent, #00ff88)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ fontSize: '11px', color: '#fff', fontWeight: 'bold', margin: '0 0 4px 0' }}>HARDWARE-AWARE SECURE DELETION</h4>
                    <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', margin: '0' }}>
                      Cosmo Symphony automatically queries your physical storage device media type. 
                      For <strong>SSDs & NVMes</strong>, it avoids wear-inducing overwrites and triggers direct hardware block erasure via Windows API <code>FSCTL_FILE_LEVEL_TRIM</code> commands. 
                      For <strong>traditional HDDs</strong>, it performs a secure 3-pass cryptographic wipe (Zero, 0xFF, and random passes) followed by truncation.
                    </p>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3>Premium Mouse Gestures</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <MousePointer2 size={14} style={{ color: 'var(--accent, #00ff88)', flexShrink: 0 }} />
                    <div>
                      <strong style={{ fontSize: '11px', color: '#fff', display: 'block' }}>Double Click Zoom</strong>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Double click any tile to immediately enter full-screen focus mode.</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <Maximize size={14} style={{ color: 'var(--accent, #00ff88)', flexShrink: 0 }} />
                    <div>
                      <strong style={{ fontSize: '11px', color: '#fff', display: 'block' }}>ALT + Scroll Wheel (Precision Zoom)</strong>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Hold <kbd>Alt</kbd> and use your scroll wheel to zoom into pictures. Drag to pan around. Click keeps your zoom state stable.</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <Gauge size={14} style={{ color: 'var(--accent, #00ff88)', flexShrink: 0 }} />
                    <div>
                      <strong style={{ fontSize: '11px', color: '#fff', display: 'block' }}>Hover + Scroll Slideshow Timer</strong>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Hover over the slideshow play button and scroll to dynamically adjust the delay (from 2 to 30 seconds).</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB CONTENT: KEYBOARD SHORTCUTS */}
          {activeTab === 'shortcuts' && (
            <div className="settings-section">
              <h3>System Key Bindings</h3>
              <div className="shortcut-list" style={{ gap: '10px', display: 'flex', flexDirection: 'column', marginTop: '8px' }}>
                
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--accent, #00ff88)', fontWeight: 'bold', letterSpacing: '1px' }}>CORE SYSTEM COMMANDS</span>
                </div>
                <div className="shortcut-item">
                  <kbd>i</kbd>
                  <span>Toggle Configuration Panel</span>
                </div>
                <div className="shortcut-item">
                  <kbd>SPACE</kbd>
                  <span>Master Play / Pause (or Toggle Focused Unit)</span>
                </div>
                <div className="shortcut-item">
                  <kbd>M</kbd>
                  <span>Toggle Master Mute / Unmute</span>
                </div>
                <div className="shortcut-item">
                  <kbd>L</kbd>
                  <span>Cycle Loop Mode (None to Once to Always to Folder)</span>
                </div>

                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', marginTop: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--accent, #00ff88)', fontWeight: 'bold', letterSpacing: '1px' }}>NAVIGATION & ZOOM</span>
                </div>
                <div className="shortcut-item">
                  <kbd>F</kbd>
                  <span>Toggle Enlarge / Immersive Mode</span>
                </div>
                <div className="shortcut-item">
                  <kbd>ESC</kbd>
                  <span>Exit Focus / Enlarge Mode</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Up</kbd> or <kbd>Down</kbd>
                  <span>Navigate Previous or Next Unit (Focus Mode)</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Left</kbd> or <kbd>Right</kbd>
                  <span>Rotate Focused Video (-90deg or +90deg)</span>
                </div>
                <div className="shortcut-item">
                  <kbd>1</kbd> to <kbd>8</kbd>
                  <span>Instant Grid Density (2 to 16 Units)</span>
                </div>
                <div className="shortcut-item">
                  <kbd>CTRL + Scroll</kbd>
                  <span>Zoom directly to where your cursor points</span>
                </div>

                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', marginTop: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--accent, #00ff88)', fontWeight: 'bold', letterSpacing: '1px' }}>GRID DESTRUCTION</span>
                </div>
                <div className="shortcut-item">
                  <kbd>DELETE</kbd>
                  <span>Remove tile from Grid (Keeps physical file on disk)</span>
                </div>
                <div className="shortcut-item">
                  <kbd>SHIFT + DELETE</kbd>
                  <span>Move physical file directly to Recycle Bin</span>
                </div>
              </div>
            </div>
          )}
        </div>

          <div className="settings-footer" style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.6, fontSize: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Info size={12} />
              <span>COSMO SYMPHONY v1.1.9</span>
            </div>
            <span>SYSTEM STABLE</span>
          </div>
        </div>
      </div>
  );
}
