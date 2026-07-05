import React, { useEffect } from 'react';
import { Zap } from 'lucide-react';

interface SaveUpscaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (overwrite: boolean) => void;
}

export const SaveUpscaleModal: React.FC<SaveUpscaleModalProps> = ({
  isOpen,
  onClose,
  onExecute
}) => {
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

  if (!isOpen) return null;

  return (
    <div
      className="save-upscale-options-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(5, 5, 8, 0.85)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300000,
        userSelect: 'none'
      }}
    >
      <div
        style={{
          background: 'rgba(18, 18, 24, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '30px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '10px', borderRadius: '50%', background: 'rgba(0, 255, 136, 0.1)', color: 'var(--accent)', marginBottom: '12px' }}>
            <Zap size={24} fill="currentColor" />
          </div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>
            AI UPSCALE OPTIONS
          </h2>
          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#888' }}>
            Select how you want to save your upscaled high-fidelity image.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Choice 1: Save as Separate File */}
          <button
            onClick={() => onExecute(false)}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.15)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.08)';
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Save as Separate File (Save As)</span>
            <span style={{ fontSize: '11px', color: '#aaa' }}>Creates a new file using serial increments (e.g. daisy_upscaled.1.png).</span>
          </button>

          {/* Choice 2: Overwrite Original */}
          <button
            onClick={() => onExecute(true)}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.15)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.08)';
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Overwrite Original File</span>
            <span style={{ fontSize: '11px', color: '#aaa' }}>Replaces the original file physically with 4x resolution. Auto-bypasses caching.</span>
          </button>
        </div>

        {/* Hardware Recommendation Note */}
        <div style={{
          background: 'rgba(0, 255, 136, 0.04)',
          border: '1px solid rgba(0, 255, 136, 0.12)',
          borderRadius: '12px',
          padding: '12px',
          fontSize: '11px',
          color: 'rgba(255,255,255,0.7)',
          lineHeight: '1.4',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px'
        }}>
          <Zap size={14} color="var(--accent)" style={{ marginTop: '2px', flexShrink: 0 }} />
          <span>
            <strong>Hardware Recommendation:</strong> AI super-resolution utilizes hardware acceleration on <strong>NVIDIA graphics cards</strong> (via CUDA) or <strong>AMD graphics cards</strong> (via DirectML) for maximum performance. A high-fidelity bilateral CPU filter fallback is used automatically if compatible graphics hardware is not detected.
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              padding: '8px 16px',
              transition: 'color 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.color = '#fff'}
            onMouseOut={e => e.currentTarget.style.color = '#888'}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
};
