import React from 'react';

interface PopoutCropModalProps {
  isOpen: boolean;
  onSaveCrop: (overwrite: boolean, useAi: boolean) => void;
  onClose: () => void;
}

export const PopoutCropModal: React.FC<PopoutCropModalProps> = ({
  isOpen,
  onSaveCrop,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="save-crop-options-overlay"
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>
            SAVE CROPPED SELECTION
          </h2>
          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#888' }}>
            Select how you want to save your cropped asset.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={() => onSaveCrop(false, false)}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              borderRadius: '12px',
              padding: '12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
          >
            Save as Copy
          </button>
          <button
            onClick={() => onSaveCrop(true, false)}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              borderRadius: '12px',
              padding: '12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
          >
            Overwrite Original
          </button>
          <button
            onClick={() => onSaveCrop(false, true)}
            style={{
              background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))',
              border: '1px solid rgba(0, 255, 136, 0.35)',
              color: 'var(--accent, #00ff88)',
              borderRadius: '12px',
              padding: '12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.7)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
            }}
          >
            ✨ Save as Copy & AI Upscale
          </button>
          <button
            onClick={() => onSaveCrop(true, true)}
            style={{
              background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))',
              border: '1px solid rgba(0, 255, 136, 0.35)',
              color: 'var(--accent, #00ff88)',
              borderRadius: '12px',
              padding: '12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.25), rgba(0, 150, 255, 0.25))';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.7)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 150, 255, 0.15))';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
            }}
          >
            ✨ Overwrite & AI Upscale
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 77, 77, 0.1)',
              border: '1px solid rgba(255, 77, 77, 0.2)',
              color: '#ff4d4d',
              borderRadius: '12px',
              padding: '10px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              transition: 'all 0.2s',
              marginTop: '10px'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.1)'}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
