import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Share2, Type, Layout, Palette, Play, Download, Camera } from 'lucide-react';
import type { VideoItem } from '../types';

interface PromoExporterProps {
  isOpen: boolean;
  onClose: () => void;
  videos: VideoItem[];
}

export function PromoExporter({ isOpen, onClose, videos }: PromoExporterProps) {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(videos[0]?.id || null);
  const [headline, setHeadline] = useState('COSMO SYMPHONY');
  const [tagline, setTagline] = useState('THE BEST VIDEO VIEWER FOR WINDOWS');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [themeColor, setThemeColor] = useState('#4f8ff7');
  
  const selectedVideo = videos.find(v => v.id === selectedVideoId);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" style={{ zIndex: 3000 }} onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="promo-modal" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <div className="header-title-group">
            <Share2 size={18} className="accent-text" />
            <h2>Social Promo Workshop</h2>
          </div>
          <button onClick={onClose} className="close-modal-btn">
            <X size={20} />
          </button>
        </div>

        <div className="promo-workshop-body">
          {/* Left Panel: Configuration */}
          <div className="promo-config-panel">
            <div className="promo-section">
              <h3><Layout size={14} /> Format & Target</h3>
              <div className="format-grid">
                {(['9:16', '1:1', '16:9'] as const).map((ratio) => (
                  <button 
                    key={ratio}
                    className={`format-btn ${aspectRatio === ratio ? 'active' : ''}`}
                    onClick={() => setAspectRatio(ratio)}
                  >
                    <span className="ratio-label">{ratio}</span>
                    <span className="platform-label">
                      {ratio === '9:16' ? 'TikTok / Reels' : ratio === '1:1' ? 'Instagram' : 'YouTube / Ads'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="promo-section">
              <h3><Type size={14} /> Branding & Copy</h3>
              <div className="input-group">
                <label>Headline</label>
                <input 
                  type="text" 
                  value={headline} 
                  onChange={(e) => setHeadline(e.target.value.toUpperCase())}
                  placeholder="App Name..." 
                />
              </div>
              <div className="input-group">
                <label>Tagline</label>
                <input 
                  type="text" 
                  value={tagline} 
                  onChange={(e) => setTagline(e.target.value.toUpperCase())}
                  placeholder="Value Proposition..." 
                />
              </div>
            </div>

            <div className="promo-section">
              <h3><Palette size={14} /> Accent Theme</h3>
              <div className="color-presets">
                {['#4f8ff7', '#e5484d', '#30a46c', '#f59e0b', '#8b5cf6'].map(color => (
                  <button 
                    key={color}
                    className={`color-btn ${themeColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setThemeColor(color)}
                  />
                ))}
              </div>
            </div>

            <div className="promo-section">
              <h3><Play size={14} /> Select Source Material</h3>
              <div className="source-list">
                {videos.map(v => (
                  <button 
                    key={v.id}
                    className={`source-item ${selectedVideoId === v.id ? 'active' : ''}`}
                    onClick={() => setSelectedVideoId(v.id)}
                  >
                    <span className="source-title">{v.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel: Live Preview */}
          <div className="promo-preview-panel">
            <div className="preview-container">
              <div className={`preview-viewport ratio-${aspectRatio.replace(':', '-')}`}>
                {selectedVideo ? (
                  <>
                    <video 
                      src={selectedVideo.url} 
                      autoPlay 
                      loop 
                      muted 
                      className="preview-video-bg"
                    />
                    
                    {/* Glassmorphic Brand Overlays */}
                    <div className="promo-overlay-layer">
                      <motion.div 
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="promo-header-badge"
                        style={{ borderTop: `2px solid ${themeColor}` }}
                      >
                        <img src="/logo.png" className="promo-logo-mini" alt="Logo" />
                        <span className="promo-headline">{headline}</span>
                      </motion.div>

                      <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="promo-central-msg"
                      >
                        <div className="msg-pill" style={{ backgroundColor: themeColor }}>
                          NOW ON WINDOWS
                        </div>
                        <div className="main-tagline">{tagline}</div>
                      </motion.div>

                      <div className="promo-footer-branding">
                        <div className="platform-badges">
                          <div className="badge">ULTRA HIGH PERFORMANCE</div>
                          <div className="badge">NATIVE 4K SUPPORT</div>
                        </div>
                        <div className="cta-button" style={{ backgroundColor: themeColor }}>
                          GET COSMO SYMPHONY
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="no-source">SELECT A VIDEO TO PREVIEW PROMO</div>
                )}
              </div>
            </div>

            <div className="preview-actions">
              <div className="record-hint">
                <Camera size={14} />
                <span>Ready for capture. Use <strong>Win + Alt + R</strong> to record this preview.</span>
              </div>
              <button 
                className="export-btn" 
                onClick={() => {
                  const video = document.querySelector('.preview-video-bg') as HTMLVideoElement;
                  const viewport = document.querySelector('.preview-viewport');
                  if (!video || !viewport) return;

                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  if (!ctx) return;

                  // Set canvas size to match aspect ratio at high resolution
                  const scale = 2; // 2x for high quality
                  canvas.width = viewport.clientWidth * scale;
                  canvas.height = viewport.clientHeight * scale;

                  // 1. Draw Video Frame
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                  // 2. Draw Semi-transparent Dark Overlay for text legibility
                  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);

                  // 3. Draw Branding (Simplified version of UI for canvas)
                  ctx.fillStyle = themeColor;
                  ctx.font = `bold ${24 * scale}px Inter`;
                  ctx.textAlign = 'center';
                  ctx.fillText(headline, canvas.width / 2, 60 * scale);

                  ctx.fillStyle = '#ffffff';
                  ctx.font = `bold ${14 * scale}px Inter`;
                  ctx.fillText(tagline, canvas.width / 2, canvas.height / 2 + 40 * scale);

                  ctx.fillStyle = themeColor;
                  ctx.fillRect(canvas.width / 2 - 100 * scale, canvas.height - 80 * scale, 200 * scale, 40 * scale);
                  ctx.fillStyle = '#ffffff';
                  ctx.font = `bold ${12 * scale}px Inter`;
                  ctx.fillText('GET COSMO SYMPHONY', canvas.width / 2, canvas.height - 55 * scale);

                  // 4. Download
                  const link = document.createElement('a');
                  link.download = `promo_${selectedVideo.title.replace(/\s+/g, '_')}.jpg`;
                  link.href = canvas.toDataURL('image/jpeg', 0.9);
                  link.click();
                }}
              >
                <Download size={16} /> DOWNLOAD PACK
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
