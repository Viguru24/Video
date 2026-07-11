import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, HelpCircle, Monitor, Zap, Command, 
  Play, Camera, Maximize, MousePointer2, 
  Keyboard, Info, ExternalLink, Download
} from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="settings-overlay" onClick={onClose}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="settings-modal help-modal" 
            onClick={e => e.stopPropagation()}
          >
            <div className="settings-header">
              <div className="help-title">
                <HelpCircle size={20} className="text-accent" />
                <h2>COSMO SYMPHONY GUIDE</h2>
              </div>
              <button onClick={onClose} className="close-btn">
                <X size={20} />
              </button>
            </div>

            <div className="settings-body">
              {/* --- SECTION 1: PLAYBACK CAPABILITIES --- */}
              <div className="settings-section">
                <div className="section-header">
                  <Monitor size={16} />
                  <h3>SYMPHONY PLAYBACK</h3>
                </div>
                <div className="format-grid">
                  <div className="format-box active">
                    <span className="format-tag">NATIVE</span>
                    <p>MP4, WebM, MOV, HLS</p>
                    <small>High performance, hardware accelerated.</small>
                  </div>
                  <div className="format-box legacy">
                    <span className="format-tag">LEGACY</span>
                    <p>MKV, AVI, WMV, FLV, ASF</p>
                    <small>Support varies by system codecs.</small>
                  </div>
                </div>
                
                <div className="codec-pro-tip">
                  <div className="tip-icon">
                    <Zap size={20} className="text-accent" />
                  </div>
                  <div className="tip-content">
                    <h4>ELITE POWER-UP: HEVC SUPPORT</h4>
                    <p>Unlock 100% support for high-res 4K MKV and MOV files by installing the official Microsoft extension.</p>
                    <a 
                      href="https://apps.microsoft.com/store/detail/hevc-video-extensions/9NMZLZL57R3T" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="ms-store-link"
                    >
                      <Download size={14} /> Get HEVC Extensions from Microsoft Store
                    </a>
                  </div>
                </div>
              </div>

              {/* --- SECTION 2: KEYBOARD MASTERY --- */}
              <div className="settings-section">
                <div className="section-header">
                  <Keyboard size={16} />
                  <h3>KEYBOARD MASTERY</h3>
                </div>
                <div className="shortcut-grid">
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>i</kbd></div>
                    <div className="desc">Toggle System Configuration & Guide</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>SPACE</kbd></div>
                    <div className="desc">Master Play / Pause (or Toggle Focused Unit)</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>M</kbd></div>
                    <div className="desc">Toggle Master Mute / Unmute</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>L</kbd></div>
                    <div className="desc">Cycle Loop Mode (None âž” Once âž” Always âž” Folder)</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>F</kbd></div>
                    <div className="desc">Toggle Enlarge / Immersive Mode (Focused Unit)</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>ESC</kbd></div>
                    <div className="desc">Close Active Overlay / Exit Enlarge Mode</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>â–²</kbd> / <kbd>â–¼</kbd></div>
                    <div className="desc">Navigate Previous / Next Unit (Enlarge/Immersive)</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>â—€</kbd> / <kbd>â–¶</kbd></div>
                    <div className="desc">Rotate Focused Video (-90Â° / +90Â°)</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>1</kbd> â€” <kbd>8</kbd></div>
                    <div className="desc">Instant Grid Density presets (2 to 16 Units)</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>CTRL + Scroll</kbd></div>
                    <div className="desc">Dynamic / Precision Zoom grid scaling</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>DELETE</kbd></div>
                    <div className="desc">Remove from Grid (Keeps file on disk)</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>SHIFT + DEL</kbd></div>
                    <div className="desc">Move to Recycle Bin (Deletes file from disk)</div>
                  </div>
                </div>
              </div>

              {/* --- SECTION 3: DEEP INTERACTION --- */}
              <div className="settings-section">
                <div className="section-header">
                  <MousePointer2 size={16} />
                  <h3>PREMIUM MOUSE GESTURES</h3>
                </div>
                <div className="interaction-list">
                  <div className="interaction-item">
                    <div className="i-icon"><Maximize size={16} /></div>
                    <div className="i-content">
                      <strong>Double Click</strong>
                      <span>Double click any media card to instantly enter "Deep Focus" enlarged fullscreen mode.</span>
                    </div>
                  </div>
                  <div className="interaction-item">
                    <div className="i-icon"><Monitor size={16} /></div>
                    <div className="i-content">
                      <strong>ALT + Scroll & Alt + Click/Drag (Precision Picture Zoom)</strong>
                      <span>In focus mode, hold Alt and scroll to zoom. Click & Drag to pan. Clicking on the image keeps the zoom state intact (no auto-reset).</span>
                    </div>
                  </div>
                  <div className="interaction-item">
                    <div className="i-icon"><Play size={16} /></div>
                    <div className="i-content">
                      <strong>Hover + Scroll Slideshow Timer</strong>
                      <span>Hover over the slideshow button and scroll with your mouse wheel to dynamically adjust the timer from 2s to 30s.</span>
                    </div>
                  </div>
                  <div className="interaction-item">
                    <div className="i-icon"><Zap size={16} /></div>
                    <div className="i-content">
                      <strong>Drag & Drop Workspace Ordering</strong>
                      <span>Left click and drag cards to reorder your workspace. Drop folders or multiple files anywhere on the app to bulk-add.</span>
                    </div>
                  </div>
                  <div className="interaction-item">
                    <div className="i-icon"><Command size={16} /></div>
                    <div className="i-content">
                      <strong>Stable Hand-Grab Custom Scrollbar</strong>
                      <span>A beautiful light gray custom scrollbar with a grab cursor enables easy, jump-free scrolling.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="help-footer">
                <div className="footer-info">
                  <Info size={14} />
                  <span>COSMO SYMPHONY â€” v1.2.1</span>
                </div>
                <div className="footer-status">SYMPHONY SYSTEM STABLE</div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

