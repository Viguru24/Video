import React, { useEffect } from 'react';
import { Zap } from 'lucide-react';

interface SaveCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (overwrite: boolean, useAi: boolean) => void;
}

export const SaveCropModal: React.FC<SaveCropModalProps> = ({
  isOpen,
  onClose,
  onSave
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
          {/* Choice 1: Save as Separate File */}
          <button
            onClick={() => onSave(false, false)}
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
            <span style={{ fontSize: '11px', color: '#aaa' }}>Creates a new file using serial increments (e.g. Daisy28.1.png).</span>
          </button>

          {/* Choice 2: Overwrite Original */}
          <button
            onClick={() => onSave(true, false)}
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
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Overwrite Original</span>
            <span style={{ fontSize: '11px', color: '#aaa' }}>Replaces the original file physically. Auto-bypasses caching.</span>
          </button>

          {/* Choice 3: AI Enhance & Save as Separate File */}
          <button
            onClick={() => onSave(false, true)}
            style={{
              background: 'rgba(0, 255, 136, 0.03)',
              border: '1px solid rgba(0, 255, 136, 0.15)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(0, 255, 136, 0.06)';
              e.currentTarget.style.border = '1px solid rgba(0, 255, 136, 0.3)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(0, 255, 136, 0.03)';
              e.currentTarget.style.border = '1px solid rgba(0, 255, 136, 0.15)';
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={12} fill="currentColor" /> AI Enhance & Save as New File
            </span>
            <span style={{ fontSize: '11px', color: '#aaa' }}>Runs 4x GFPGAN/Real-ESRGAN local super-resolution over the crop and saves as a separate file.</span>
          </button>

          {/* Choice 4: AI Enhance & Overwrite Original */}
          <button
            onClick={() => onSave(true, true)}
            style={{
              background: 'rgba(0, 255, 136, 0.03)',
              border: '1px solid rgba(0, 255, 136, 0.15)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(0, 255, 136, 0.06)';
              e.currentTarget.style.border = '1px solid rgba(0, 255, 136, 0.3)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(0, 255, 136, 0.03)';
              e.currentTarget.style.border = '1px solid rgba(0, 255, 136, 0.15)';
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={12} fill="currentColor" /> AI Enhance & Overwrite Original
            </span>
            <span style={{ fontSize: '11px', color: '#aaa' }}>Runs 4x GFPGAN/Real-ESRGAN local super-resolution over the crop and overwrites the original file physically.</span>
          </button>
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
