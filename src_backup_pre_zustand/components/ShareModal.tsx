import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, ExternalLink, Share2, MessageCircle, Send } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl?: string;
  title?: string;
  description?: string;
}

const SOCIAL_PLATFORMS = [
  {
    name: 'WhatsApp (Desktop)',
    icon: <MessageCircle size={20} />,
    color: '#25D366',
    url: (url: string, text: string) => `whatsapp://send?text=${encodeURIComponent(text + ' ' + url)}`,
    fallback: (url: string, text: string) => `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`,
    id: 'whatsapp'
  },
  {
    name: 'WhatsApp Web',
    icon: <MessageCircle size={20} />,
    color: '#128C7E',
    url: (url: string, text: string) => `https://web.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`,
    id: 'whatsapp-web'
  },
  {
    name: 'Telegram',
    icon: <Send size={20} />,
    color: '#0088cc',
    url: (url: string, text: string) => `tg://msg_url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    fallback: (url: string, text: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    id: 'telegram'
  },
  {
    name: 'LinkedIn',
    icon: <ExternalLink size={20} />,
    color: '#0A66C2',
    url: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    id: 'linkedin'
  }
];

export function ShareModal({ 
  isOpen, 
  onClose, 
  shareUrl = 'https://cosmo.symphony', 
  title = 'COSMO SYMPHONY',
  description = 'The ultimate video orchestration engine for Windows.'
}: ShareModalProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async (platform: any) => {
    const text = `COSMO SYMPHONY ASSET\n\nUnit: ${title}\n${description}`;
    const url = platform.url(shareUrl, text);
    
    console.log(`[Share] Attempting to open: ${url}`);
    
    try {
      await openUrl(url);
    } catch (e) {
      console.warn("Deep link failed, trying fallback...", e);
      if (platform.fallback) {
        try {
          await openUrl(platform.fallback(shareUrl, text));
        } catch (err) {
          console.error("Fallback failed:", err);
          alert("Deep link blocked by system. Please use the Direct Link below.");
        }
      } else {
        alert("Action blocked by system. Please use the Direct Link below.");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="share-overlay">
        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="share-modal" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="share-header">
            <div className="share-title-wrap">
              <div className="share-icon-bg">
                <Share2 size={18} className="accent-text" />
              </div>
              <div className="share-text-content">
                <h2>Share Experience</h2>
                <p>Broadcast COSMO SYMPHONY to your network</p>
              </div>
            </div>
            <button onClick={onClose} className="premium-close-btn">
              <X size={18} />
            </button>
          </div>

          <div className="share-body">
            <div className="social-grid">
              {SOCIAL_PLATFORMS.map((platform) => (
                <motion.button
                  key={platform.id}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="social-btn"
                  onClick={() => handleShare(platform)}
                >
                  <div className="social-icon-wrapper" style={{ backgroundColor: `${platform.color}15`, color: platform.color }}>
                    {platform.icon}
                  </div>
                  <span className="social-name">{platform.name}</span>
                </motion.button>
              ))}
            </div>

            <div className="share-link-section">
              <label>Direct App Link</label>
              <div className="link-input-group">
                <input type="text" readOnly value={shareUrl} />
                <button 
                  className={`copy-btn ${copied ? 'copied' : ''}`} 
                  onClick={handleCopy}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="share-link-section" style={{ marginTop: '12px' }}>
              <label>Unit File Path (for manual attach)</label>
              <div className="link-input-group">
                <input type="text" readOnly value={description.replace('Video Source: ', '')} />
                <button 
                  className="copy-btn" 
                  onClick={() => {
                    navigator.clipboard.writeText(description.replace('Video Source: ', ''));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <Copy size={16} />
                  <span>Copy Path</span>
                </button>
              </div>
            </div>
          </div>

          <div className="share-footer">
            <div className="preview-card">
              <div className="preview-thumb">
                <img src="/logo.png" alt="Cosmo Logo" />
              </div>
              <div className="preview-info">
                <strong>{title}</strong>
                <span>{description}</span>
              </div>
              <ExternalLink size={14} className="preview-link-icon" />
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
