import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, VolumeX, Repeat } from 'lucide-react';
import type { VideoItem, RepeatMode } from '../types';

interface VolumeRepeatModalProps {
  isOpen: boolean;
  onClose: () => void;
  globalVolume: number;
  setGlobalVolume: (vol: number) => void;
  masterMuted: boolean;
  toggleMasterMute: (soloId?: string) => void;
  globalRepeat: RepeatMode;
  setGlobalRepeat: (mode: RepeatMode) => void;
  videos: VideoItem[];
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
}

export function VolumeRepeatModal({
  isOpen,
  onClose,
  globalVolume,
  setGlobalVolume,
  masterMuted,
  toggleMasterMute,
  globalRepeat,
  setGlobalRepeat,
}: VolumeRepeatModalProps) {
  
  const isLoopOn = globalRepeat === 'always';

  const handleToggleLoop = () => {
    setGlobalRepeat(isLoopOn ? 'none' : 'always');
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="wifi-modal-backdrop" 
          onClick={handleBackdropClick}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(5, 5, 8, 0.6)',
            backdropFilter: 'blur(12px)',
            userSelect: 'none'
          }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={{
              width: '320px',
              background: 'rgba(15, 15, 20, 0.92)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px',
              gap: '20px',
              position: 'relative'
            }}
          >
            {/* Header */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff', letterSpacing: '0.5px' }}>
                Playback Settings
              </span>
              <button 
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
              >
                <X size={14} />
              </button>
            </div>

            {/* Volume Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Volume
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent, #00ff88)' }}>
                  {masterMuted ? 'Muted' : `${Math.round(globalVolume * 100)}%`}
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                  onClick={() => toggleMasterMute()}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: masterMuted ? '#ff4b4b' : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {masterMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>

                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={masterMuted ? 0 : globalVolume}
                  onChange={(e) => {
                    setGlobalVolume(parseFloat(e.target.value));
                    if (masterMuted) toggleMasterMute();
                  }}
                  style={{
                    flex: 1,
                    height: '4px',
                    borderRadius: '2px',
                    background: `linear-gradient(to right, var(--accent, #00ff88) ${(masterMuted ? 0 : globalVolume) * 100}%, rgba(255,255,255,0.1) ${(masterMuted ? 0 : globalVolume) * 100}%)`,
                    outline: 'none',
                    cursor: 'pointer',
                    WebkitAppearance: 'none'
                  }}
                />
              </div>
            </div>

            {/* Loop Toggle Section */}
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '12px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                  Auto Loop
                </span>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                  Endless repeating playback
                </span>
              </div>
              
              <button
                onClick={handleToggleLoop}
                style={{
                  background: isLoopOn ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: isLoopOn ? '1px solid rgba(0, 255, 136, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: isLoopOn ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Repeat size={12} />
                <span>{isLoopOn ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Done button */}
            <button 
              onClick={onClose}
              style={{
                background: 'var(--accent, #00ff88)',
                color: '#000',
                border: 'none',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(0, 255, 136, 0.15)',
                textAlign: 'center'
              }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.05)'}
              onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
            >
              Done
            </button>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
