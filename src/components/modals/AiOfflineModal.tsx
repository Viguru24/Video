import React from 'react';
import { AlertCircle } from 'lucide-react';

interface AiOfflineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
}

export const AiOfflineModal: React.FC<AiOfflineModalProps> = ({
  isOpen,
  onClose,
  onBack
}) => {
  if (!isOpen) return null;

  return (
    <div
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
        zIndex: 360000
      }}
    >
      <div
        style={{
          background: 'rgba(24, 18, 18, 0.75)',
          border: '1px solid rgba(255, 78, 78, 0.15)',
          borderRadius: '20px',
          padding: '30px',
          maxWidth: '450px',
          width: '90%',
          boxShadow: '0 30px 60px rgba(0,0,0,0.8)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}
      >
        <div style={{ color: '#ff4e4e', display: 'flex', justifyContent: 'center' }}>
          <AlertCircle size={48} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#ff4e4e' }}>AI ENHANCER OFFLINE</h3>
          <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#aaa', lineHeight: 1.5 }}>
            The local PyTorch/RTX upscaling server at port 12000 is not running or failed to initialize.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={onBack}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
          >
            BACK
          </button>
          <button
            onClick={onClose}
            style={{
              background: '#ff4e4e',
              border: 'none',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.background = '#ff6b6b'}
            onMouseOut={e => e.currentTarget.style.background = '#ff4e4e'}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
