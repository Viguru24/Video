import React from 'react';

interface ReshapeSuccessModalProps {
  path: string;
  onClose: () => void;
  onLog?: (msg: string) => void;
}

export const ReshapeSuccessModal: React.FC<ReshapeSuccessModalProps> = ({
  path,
  onClose,
  onLog
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300000,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(20, 20, 28, 0.95), rgba(12, 12, 18, 0.98))',
          border: '1px solid rgba(0, 255, 136, 0.3)',
          borderRadius: '24px',
          padding: '28px 32px',
          width: '440px',
          maxWidth: '90%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 255, 136, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '16px'
        }}
      >
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: 'rgba(0, 255, 136, 0.12)',
            border: '2px solid var(--accent, #00ff88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            color: 'var(--accent, #00ff88)',
            boxShadow: '0 0 20px rgba(0, 255, 136, 0.4)'
          }}
        >
          ✓
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#fff', letterSpacing: '0.5px' }}>
            Photo Saved Successfully!
          </span>
          <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
            A reshaped copy has been saved to your disk:
          </span>
        </div>

        <div
          onClick={() => {
            navigator.clipboard.writeText(path);
            if (onLog) onLog(`Copied file path to clipboard: ${path}`);
          }}
          title="Click to copy path to clipboard"
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '10px 14px',
            fontSize: '11px',
            color: 'var(--accent, #00ff88)',
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            width: '100%',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          📋 {path}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: '8px',
            background: 'linear-gradient(135deg, #00ff88, #00b862)',
            border: 'none',
            color: '#000',
            padding: '10px 32px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            letterSpacing: '1px',
            boxShadow: '0 4px 20px rgba(0, 255, 136, 0.4)',
            width: '100%'
          }}
        >
          DONE
        </button>
      </div>
    </div>
  );
};
