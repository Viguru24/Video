import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  MessageSquare, 
  Copy, 
  ExternalLink, 
  FolderOpen, 
  QrCode, 
  Smartphone, 
  Check, 
  Share2, 
  Film, 
  Image as ImageIcon,
  Sparkles, 
  Clock, 
  HardDrive,
  Globe,
  Send,
  Mail
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem } from '../../types';
import { toCosmoUrl, toRealPath, isTauri } from '../../utils/videoUtils';

interface WhatsAppShareModalProps {
  target: VideoItem | null;
  onClose: () => void;
  addLog: (msg: string) => void;
}

type SharePlatform = 'whatsapp' | 'telegram' | 'discord' | 'email';

export function WhatsAppShareModal({ target, onClose, addLog }: WhatsAppShareModalProps) {
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'desktop' | 'mobile'>('desktop');
  const [selectedPlatform, setSelectedPlatform] = useState<SharePlatform>('whatsapp');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [shareUrl, setShareUrl] = useState<string>('');
  const [loadingQr, setLoadingQr] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const effectivePath = target ? (target.realPath || toRealPath(target.url)) : null;
  const mediaSrc = target ? toCosmoUrl(target.realPath || target.url) : '';
  const isImage = target ? (target.type === 'picture' || 
    (effectivePath && /\.(png|jpe?g|webp|gif|bmp|avif|tiff|ico)$/i.test(effectivePath))) : false;

  // Initialize QR Code / Mobile Wi-Fi share room when mobile tab selected
  useEffect(() => {
    let active = true;
    if (activeTab === 'mobile' && effectivePath) {
      setLoadingQr(true);
      (async () => {
        try {
          // 1. Tell Wi-Fi share server about this file
          if (isTauri()) {
            await invoke('set_wifi_shared_files', { paths: [effectivePath] });
          }
          // 2. Create room to get QR Code
          const res = await fetch('http://127.0.0.1:48273/api/rooms/create', { method: 'POST' });
          if (res.ok) {
            const data = await res.json();
            if (active && data.success) {
              setShareUrl(data.shareUrl);
              setQrDataUrl(data.qrDataUrl || '');
            }
          }
        } catch (err) {
          console.error('Failed to init Wi-Fi share:', err);
        } finally {
          if (active) setLoadingQr(false);
        }
      })();
    }

    return () => {
      active = false;
    };
  }, [activeTab, effectivePath]);

  // Keyboard shortcut: Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!target) return null;

  const handleShareAction = async (platform: string, mode: 'app' | 'web' | 'clipboard' | 'explorer') => {
    if (!effectivePath) {
      setFeedbackMsg({ text: 'File path could not be resolved.', type: 'error' });
      return;
    }

    try {
      if (isTauri()) {
        const msg = await invoke<string>('share_media_file', {
          path: effectivePath,
          platform,
          mode
        });

        addLog(`🚀 Share (${platform} ${mode}): ${target.title}`);
        setFeedbackMsg({ text: msg, type: 'success' });
        setCopiedStatus(`${platform}-${mode}`);
        setTimeout(() => setCopiedStatus(null), 3500);
      } else {
        // Fallback for web mode
        navigator.clipboard.writeText(effectivePath);
        if (platform === 'whatsapp') window.open('https://web.whatsapp.com', '_blank');
        else if (platform === 'telegram') window.open('https://web.telegram.org', '_blank');
        else if (platform === 'discord') window.open('https://discord.com/app', '_blank');
        setFeedbackMsg({ text: `Opened ${platform} and copied file to clipboard!`, type: 'success' });
      }
    } catch (err: any) {
      console.error('Share action failed:', err);
      setFeedbackMsg({ text: err?.toString() || 'Action failed', type: 'error' });
    }
  };

  const platforms: { id: SharePlatform; name: string; icon: any; color: string; bg: string; border: string }[] = [
    { id: 'whatsapp', name: 'WhatsApp', icon: MessageSquare, color: '#25D366', bg: 'rgba(37, 211, 102, 0.15)', border: 'rgba(37, 211, 102, 0.35)' },
    { id: 'telegram', name: 'Telegram', icon: Send, color: '#229ED9', bg: 'rgba(34, 158, 217, 0.15)', border: 'rgba(34, 158, 217, 0.35)' },
    { id: 'discord', name: 'Discord', icon: MessageSquare, color: '#5865F2', bg: 'rgba(88, 101, 242, 0.15)', border: 'rgba(88, 101, 242, 0.35)' },
    { id: 'email', name: 'Email', icon: Mail, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)' }
  ];

  const currentPlat = platforms.find(p => p.id === selectedPlatform) || platforms[0];

  return (
    <div 
      className="modal-backdrop" 
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(24px) saturate(180%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '24px'
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '700px',
          background: 'linear-gradient(165deg, rgba(16, 24, 22, 0.94) 0%, rgba(10, 16, 15, 0.97) 50%, rgba(5, 10, 9, 0.99) 100%)',
          border: `1px solid ${currentPlat.border}`,
          borderRadius: '24px',
          boxShadow: '0 28px 70px -12px rgba(0, 0, 0, 0.8), 0 0 45px rgba(37, 211, 102, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}
      >
        {/* Top Ambient Glow */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '2px',
          background: `linear-gradient(90deg, transparent, ${currentPlat.color}, transparent)`,
          boxShadow: `0 0 18px ${currentPlat.color}`
        }} />

        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: `linear-gradient(135deg, ${currentPlat.color} 0%, #059669 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 4px 16px ${currentPlat.color}40`,
              color: '#fff'
            }}>
              <Share2 size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>
                  Quick Share & Export Studio
                </h2>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: isImage ? 'rgba(56, 189, 248, 0.15)' : 'rgba(37, 211, 102, 0.15)',
                  color: isImage ? '#38bdf8' : '#25D366',
                  border: `1px solid ${isImage ? 'rgba(56, 189, 248, 0.35)' : 'rgba(37, 211, 102, 0.35)'}`
                }}>
                  {isImage ? '📸 Image & Photo' : '🎬 Video Clip'}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)', margin: '2px 0 0 0' }}>
                Instant copy & launch for WhatsApp, Telegram, Discord, and Phone
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Media Preview Banner */}
        <div style={{
          padding: '14px 24px',
          background: 'rgba(0, 0, 0, 0.35)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '84px',
            height: '56px',
            borderRadius: '10px',
            overflow: 'hidden',
            background: '#000',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            position: 'relative',
            flexShrink: 0
          }}>
            {isImage ? (
              <img src={mediaSrc} alt={target.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} decoding="async" />
            ) : (
              <video src={mediaSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
            )}
            <div style={{
              position: 'absolute',
              bottom: '2px',
              right: '2px',
              background: 'rgba(0, 0, 0, 0.8)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontSize: '9px',
              color: isImage ? '#38bdf8' : '#25D366',
              fontWeight: 800
            }}>
              {isImage ? 'IMG' : 'VID'}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: '3px'
            }}>
              {target.title}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.5)'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <HardDrive size={12} style={{ color: currentPlat.color }} />
                {effectivePath ? effectivePath.split('\\').pop() : 'Local Media'}
              </span>
              <span>•</span>
              <span style={{ color: currentPlat.color, fontWeight: 600 }}>Ready to paste (Ctrl+V)</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          padding: '12px 24px 0 24px',
          gap: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <button
            onClick={() => setActiveTab('desktop')}
            style={{
              padding: '10px 18px',
              background: activeTab === 'desktop' ? `${currentPlat.color}20` : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'desktop' ? `2px solid ${currentPlat.color}` : '2px solid transparent',
              color: activeTab === 'desktop' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              borderRadius: '8px 8px 0 0'
            }}
          >
            <Send size={15} style={{ color: activeTab === 'desktop' ? currentPlat.color : 'inherit' }} />
            Desktop Share (WhatsApp & Apps)
          </button>

          <button
            onClick={() => setActiveTab('mobile')}
            style={{
              padding: '10px 18px',
              background: activeTab === 'mobile' ? 'rgba(37, 211, 102, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'mobile' ? '2px solid #25D366' : '2px solid transparent',
              color: activeTab === 'mobile' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              borderRadius: '8px 8px 0 0'
            }}
          >
            <Smartphone size={15} style={{ color: activeTab === 'mobile' ? '#25D366' : 'inherit' }} />
            Send to Phone (Wi-Fi QR)
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: '420px' }}>
          {activeTab === 'desktop' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Platform Selector Pills */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Target Platform
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {platforms.map(p => {
                    const isSelected = selectedPlatform === p.id;
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPlatform(p.id)}
                        style={{
                          padding: '10px 8px',
                          background: isSelected ? p.bg : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${isSelected ? p.color : 'rgba(255, 255, 255, 0.08)'}`,
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        }}
                      >
                        <Icon size={15} style={{ color: p.color }} />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.75)' }}>
                          {p.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary Action Button: Open Selected App */}
              <button
                onClick={() => handleShareAction(selectedPlatform, 'app')}
                style={{
                  padding: '16px 20px',
                  background: `linear-gradient(135deg, ${currentPlat.color}25 0%, ${currentPlat.color}10 100%)`,
                  border: `1px solid ${currentPlat.color}`,
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.25s ease',
                  boxShadow: `0 4px 20px ${currentPlat.color}20`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${currentPlat.color}35 0%, ${currentPlat.color}15 100%)`;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${currentPlat.color}25 0%, ${currentPlat.color}10 100%)`;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: currentPlat.color,
                    color: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    boxShadow: `0 0 16px ${currentPlat.color}60`
                  }}>
                    <currentPlat.icon size={22} fill={selectedPlatform === 'whatsapp' ? '#000' : 'none'} />
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Open {currentPlat.name} App
                      <span style={{ fontSize: '10px', background: currentPlat.color, color: '#000', padding: '1px 6px', borderRadius: '8px', fontWeight: 800 }}>RECOMMENDED</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)', marginTop: '2px' }}>
                      Copies {isImage ? 'image' : 'video'} to clipboard & launches {currentPlat.name}. Just press <kbd style={{ background: 'rgba(0,0,0,0.5)', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', color: currentPlat.color }}>Ctrl+V</kbd> in your chat!
                    </div>
                  </div>
                </div>
                <div style={{ color: currentPlat.color }}>
                  {copiedStatus === `${selectedPlatform}-app` ? <Check size={20} /> : <ExternalLink size={18} />}
                </div>
              </button>

              {/* Action 2: Web Version */}
              <button
                onClick={() => handleShareAction(selectedPlatform, 'web')}
                style={{
                  padding: '12px 18px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.borderColor = currentPlat.border;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: currentPlat.bg,
                    color: currentPlat.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Globe size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                      Open {currentPlat.name} Web (Browser)
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
                      Copies {isImage ? 'image' : 'video'} to clipboard & opens web browser version
                    </div>
                  </div>
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                  {copiedStatus === `${selectedPlatform}-web` ? <Check size={18} style={{ color: currentPlat.color }} /> : <ExternalLink size={16} />}
                </div>
              </button>

              {/* Action 3 & 4: Quick Copy & Show in Explorer */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  onClick={() => handleShareAction('clipboard', 'clipboard')}
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: currentPlat.color
                  }}>
                    <Copy size={16} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Copy {isImage ? 'Image' : 'File'}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)' }}>Ready to paste (Ctrl+V)</div>
                  </div>
                </button>

                <button
                  onClick={() => handleShareAction('explorer', 'explorer')}
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8'
                  }}>
                    <FolderOpen size={16} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Show in Explorer</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)' }}>Drag & drop file</div>
                  </div>
                </button>
              </div>

              {/* Pro Tip Guide */}
              <div style={{
                background: `${currentPlat.color}10`,
                border: `1px solid ${currentPlat.color}30`,
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <Sparkles size={16} style={{ color: currentPlat.color, marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)', lineHeight: '1.45' }}>
                  <strong style={{ color: currentPlat.color }}>How it works:</strong> Clicking any share button copies the actual {isImage ? 'image file' : 'video file'} directly to your Windows clipboard. Simply switch to <strong style={{ color: '#fff' }}>{currentPlat.name}</strong> (or Slack, Messenger, etc.) and press <strong style={{ color: '#fff' }}>Ctrl+V</strong> in the chat to attach and send!
                </div>
              </div>
            </div>
          ) : (
            /* Mobile Phone QR Code */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '12px 0'
            }}>
              <div style={{
                background: '#fff',
                padding: '16px',
                borderRadius: '18px',
                boxShadow: '0 8px 32px rgba(37, 211, 102, 0.25)',
                marginBottom: '18px',
                width: '180px',
                height: '180px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {loadingQr ? (
                  <div style={{ color: '#128C7E', fontSize: '12px', fontWeight: 600 }}>Generating QR...</div>
                ) : qrDataUrl ? (
                  <img src={qrDataUrl} alt="Wi-Fi Share QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <QrCode size={90} color="#128C7E" />
                )}
              </div>

              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: '0 0 6px 0' }}>
                Scan to Open on Phone
              </h3>
              <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', maxWidth: '400px', margin: 0, lineHeight: 1.45 }}>
                Ensure your mobile phone is on the same local Wi-Fi. Scan with your camera to open the {isImage ? 'photo' : 'video'} on your phone with a 1-tap <strong style={{ color: '#25D366' }}>Share to WhatsApp</strong> or <strong style={{ color: '#38bdf8' }}>Save to Camera Roll</strong> button!
              </p>

              {shareUrl && (
                <div style={{
                  marginTop: '16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  color: '#25D366',
                  fontFamily: 'monospace'
                }}>
                  {shareUrl}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feedback Toast */}
        {feedbackMsg && (
          <div style={{
            padding: '12px 24px',
            background: feedbackMsg.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(37, 211, 102, 0.2)',
            borderTop: feedbackMsg.type === 'error' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(37, 211, 102, 0.4)',
            color: feedbackMsg.type === 'error' ? '#f87171' : '#25D366',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Check size={14} />
            {feedbackMsg.text}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          background: 'rgba(0, 0, 0, 0.4)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 20px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
