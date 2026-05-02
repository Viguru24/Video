import React from 'react';
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
                    <div className="keys"><kbd>1</kbd> — <kbd>8</kbd></div>
                    <div className="desc">Set Grid Density (2 to 16 Units)</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>SPACE</kbd></div>
                    <div className="desc">Master Play / Pause Toggle</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>F</kbd></div>
                    <div className="desc">Toggle Solo Mode (Focused Unit)</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>S</kbd></div>
                    <div className="desc">Quick Snapshot (Focused Unit)</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>ESC</kbd></div>
                    <div className="desc">Exit Solo / Close Modals / Exit App</div>
                  </div>
                  <div className="help-shortcut-item">
                    <div className="keys"><kbd>CTRL</kbd> + <kbd>Scroll</kbd></div>
                    <div className="desc">Precision Density Control</div>
                  </div>
                </div>
              </div>

              {/* --- SECTION 3: DEEP INTERACTION --- */}
              <div className="settings-section">
                <div className="section-header">
                  <MousePointer2 size={16} />
                  <h3>DEEP INTERACTION</h3>
                </div>
                <div className="interaction-list">
                  <div className="interaction-item">
                    <div className="i-icon"><Maximize size={16} /></div>
                    <div className="i-content">
                      <strong>Double Click</strong>
                      <span>Enter "Deep Focus" mode for immersive solo viewing.</span>
                    </div>
                  </div>
                  <div className="interaction-item">
                    <div className="i-icon"><Command size={16} /></div>
                    <div className="i-content">
                      <strong>Right Click</strong>
                      <span>Activate the Context Menu for unit controls.</span>
                    </div>
                  </div>
                  <div className="interaction-item">
                    <div className="i-icon"><Zap size={16} /></div>
                    <div className="i-content">
                      <strong>Drag & Drop</strong>
                      <span>Reorder your workspace or drop folders to bulk-add videos.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="help-footer">
                <div className="footer-info">
                  <Info size={14} />
                  <span>COSMO SYMPHONY — v3.0.0 (STABLE)</span>
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
