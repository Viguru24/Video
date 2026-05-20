import { X, Monitor, MousePointer2, Info, Gauge, Zap, ListRestart, Layers, Palette } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../../store/useStore';

interface SettingsModalProps {
  confirmDeletion: boolean;
  setConfirmDeletion: React.Dispatch<React.SetStateAction<boolean>>;
  snapshotDir: string;
  setSnapshotDir: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
  onShowLogs: () => void;
}

export function SettingsModal({
  confirmDeletion,
  setConfirmDeletion,
  snapshotDir,
  setSnapshotDir,
  onClose,
  onShowLogs
}: SettingsModalProps) {
  const {
    theme,
    setTheme,
    alwaysOnTop,
    setAlwaysOnTop,
    fitMode,
    setFitMode
  } = useStore();

  const addLog = (msg: string) => {
    // Just a placeholder or we can use custom events, but let's just trigger a log if needed
    console.log(msg);
  };

  return (
    <div className="settings-overlay">
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>System Configuration</h2>
          <button onClick={onClose} className="premium-close-btn">
            <X size={18} />
          </button>
        </div>
        <div className="settings-body">
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
          </div>

          <div className="protocol-box" style={{ border: confirmDeletion ? '1px solid rgba(var(--accent-rgb), 0.2)' : '1px solid rgba(239, 68, 68, 0.3)', transition: 'border 0.3s ease' }}>
            <div className="protocol-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '10px', fontWeight: 900, color: confirmDeletion ? 'var(--accent)' : '#ef4444', letterSpacing: '1px', transition: 'color 0.3s ease' }}>
                OPERATIONAL PROTOCOLS
              </label>
              <span style={{ fontSize: '9px', fontWeight: 'bold', color: confirmDeletion ? 'var(--accent)' : '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'color 0.3s ease' }}>
                {confirmDeletion ? '🛡️ Protected Mode' : '⚠️ Warning: Instant Mode'}
              </span>
            </div>
            <div className="protocol-content">
              <div className="protocol-row" style={{ color: confirmDeletion ? '#fff' : 'rgba(255, 255, 255, 0.85)' }}>
                <strong style={{ color: confirmDeletion ? 'inherit' : '#ef4444' }}>REMOVE FROM GRID:</strong>
                <span>Removes from grid view only. File stays on disk. {confirmDeletion ? '(Confirm prompt active)' : '((INSTANT - No Prompt!))'}</span>
              </div>
              <div className="protocol-row" style={{ color: confirmDeletion ? '#fff' : 'rgba(255, 255, 255, 0.85)' }}>
                <strong style={{ color: confirmDeletion ? 'inherit' : '#ef4444' }}>RECYCLE BIN:</strong>
                <span>Deletes the physical file by moving it to the Recycle Bin. {confirmDeletion ? '(Confirm prompt active)' : '((INSTANT - No Prompt!))'}</span>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>Symphony Controls & Key Bindings</h3>
            <div className="shortcut-list" style={{ gap: '12px', display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginTop: '6px', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>CORE SYSTEM COMMANDS</span>
              </div>
              <div className="shortcut-item">
                <kbd>i</kbd>
                <span>Toggle System Configuration & Guide</span>
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
                <span>Cycle Loop Mode (None ➔ Once ➔ Always ➔ Folder)</span>
              </div>

              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginTop: '12px', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>IMMERSIVE & FOCUS MODES</span>
              </div>
              <div className="shortcut-item">
                <kbd>F</kbd>
                <span>Toggle Enlarge / Immersive Mode (Focused Unit)</span>
              </div>
              <div className="shortcut-item">
                <kbd>ESC</kbd>
                <span>Close Active Overlay / Exit Enlarge Mode</span>
              </div>
              <div className="shortcut-item">
                <kbd>Double Click</kbd>
                <span>Enter Deep Immersive Focus on a Unit</span>
              </div>

              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginTop: '12px', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>NAVIGATION & ROTATION</span>
              </div>
              <div className="shortcut-item">
                <kbd>▲</kbd> / <kbd>▼</kbd>
                <span>Navigate Previous / Next Unit (Enlarge/Immersive Mode)</span>
              </div>
              <div className="shortcut-item">
                <kbd>◀</kbd> / <kbd>▶</kbd>
                <span>Rotate Focused Video (-90° / +90°)</span>
              </div>
              <div className="shortcut-item">
                <kbd>1</kbd> — <kbd>8</kbd>
                <span>Instant Grid Density presets (2 to 16 Units)</span>
              </div>
              <div className="shortcut-item">
                <kbd>CTRL + Scroll</kbd>
                <span>Dynamic / Precision Zoom grid scaling</span>
              </div>

              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginTop: '12px', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>DESTRUCTIVE COMMANDS</span>
              </div>
              <div className="shortcut-item">
                <kbd>DELETE</kbd>
                <span>Remove from Grid (Keeps local file, removes from grid view)</span>
              </div>
              <div className="shortcut-item">
                <kbd>SHIFT + DELETE</kbd>
                <span>Move to Recycle Bin (Moves physical file to Windows Recycle Bin)</span>
              </div>

            </div>
          </div>

          {/* MERGED GUIDE CONTENT */}
          <div className="settings-section guide-section">
            <div className="section-header">
              <Monitor size={16} />
              <h3>SYMPHONY PLAYBACK & SYSTEM MECHANICS</h3>
            </div>
            <div className="format-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
              <div className="format-box" style={{ background: 'rgba(0,255,136,0.05)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(0,255,136,0.2)' }}>
                <span style={{ fontSize: '10px', color: 'var(--success-color)', fontWeight: 'bold' }}>NATIVE VIDEO CORE</span>
                <p style={{ margin: '5px 0', fontSize: '11px' }}>MP4, WebM, MOV, M4V, HLS</p>
              </div>
              <div className="format-box" style={{ background: 'rgba(0,180,255,0.05)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(0,180,255,0.2)' }}>
                <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 'bold' }}>IMAGE ENGINE</span>
                <p style={{ margin: '5px 0', fontSize: '11px' }}>PNG, JPG, JPEG, SVG, WEBP</p>
              </div>
            </div>

            <div style={{ marginTop: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
              <h3 style={{ fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', margin: 0, color: 'var(--text-color)' }}>Premium Mouse Gestures</h3>
            </div>

            <div className="interaction-list" style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                  <MousePointer2 size={18} />
                </div>
                <div className="i-content">
                  <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>Double Click</strong>
                  <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>Double click any media card to instantly enter "Deep Focus" enlarged fullscreen mode.</span>
                </div>
              </div>

              <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                  <Monitor size={18} />
                </div>
                <div className="i-content">
                  <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>ALT + Scroll & Alt + Click/Drag (Precision Picture Zoom)</strong>
                  <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>In focus mode, hold <kbd>Alt</kbd> and use the <strong>Scroll Wheel</strong> to dynamically zoom in and out. **Click & Drag** to pan. Clicking on the picture will keep the zoom state intact; it will never reset accidentally.</span>
                </div>
              </div>

              <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                  <Gauge size={18} />
                </div>
                <div className="i-content">
                  <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>Hover + Scroll Slideshow Timer</strong>
                  <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>Hover your mouse over the slideshow button and <strong>scroll with the mouse wheel</strong> to dynamically fine-tune the timer interval (from 2 to 30 seconds).</span>
                </div>
              </div>

              <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                  <Zap size={18} />
                </div>
                <div className="i-content">
                  <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>Drag & Drop Workspace Ordering</strong>
                  <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>Left click and drag cards to freely reorder files. Drop folders or multiple files directly onto the app window to bulk-add them to the workspace.</span>
                </div>
              </div>

              <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                  <ListRestart size={18} />
                </div>
                <div className="i-content">
                  <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>Stable Hand-Grab Custom Scrollbar</strong>
                  <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>The grid features a customized, highly visible scrollbar that blends with the theme. Use the <strong>Grab Hand</strong> cursor to easily navigate without layout jumping.</span>
                </div>
              </div>

              <div className="interaction-item" style={{ display: 'flex', gap: '12px' }}>
                <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                  <Layers size={18} />
                </div>
                <div className="i-content">
                  <strong style={{ fontSize: '13px', display: 'block', color: '#fff' }}>Adaptive Buffer Memory (Pre-caching)</strong>
                  <span style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>When scrolling through images or videos in fullscreen, the engine automatically pre-caches the next 2 and previous 2 media items into memory for navigation.</span>
                </div>
              </div>

            </div>
          </div>

          <div className="settings-footer" style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.6, fontSize: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Info size={12} />
              <span>COSMO SYMPHONY v3.4.0</span>
            </div>
            <span>SYSTEM STABLE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
