import React from 'react';
import { Check, AlertTriangle, Share2 } from 'lucide-react';
import type { VideoItem } from '../../../types';
import { useStore } from '../../../store/useStore';

interface TrimCropFooterProps {
  target: VideoItem;
  errorMessage: string | null;
  isProcessing: boolean;
  processingMsg: string;
  onClose: () => void;
  onExport: (overwrite: boolean) => void;
}

/**
 * Footer bar for Trim, Crop & Pan Studio displaying status/hotkeys and export actions.
 */
export const TrimCropFooter: React.FC<TrimCropFooterProps> = ({
  target,
  errorMessage,
  isProcessing,
  processingMsg,
  onClose,
  onExport,
}) => (
  <div
    style={{
      padding: '12px 20px',
      background: 'rgba(255, 255, 255, 0.02)',
      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '12px',
      flexShrink: 0,
    }}
  >
    {errorMessage ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          color: '#ff4d4d',
          fontWeight: 600,
        }}
      >
        <AlertTriangle size={15} />
        {errorMessage}
      </div>
    ) : isProcessing ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13px',
          color: 'var(--accent, #00ff88)',
          fontWeight: 700,
        }}
      >
        <div
          className="spinner"
          style={{
            width: '16px',
            height: '16px',
            border: '2px solid rgba(0,255,136,0.3)',
            borderTopColor: '#00ff88',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        {processingMsg}
      </div>
    ) : (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.5)',
        }}
      >
        <span>Hotkeys:</span>
        <span
          style={{
            background: 'rgba(255,255,255,0.08)',
            padding: '2px 5px',
            borderRadius: '4px',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          Space
        </span>{' '}
        (Play)
        <span
          style={{
            background: 'rgba(255,255,255,0.08)',
            padding: '2px 5px',
            borderRadius: '4px',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          I
        </span>{' '}
        (In)
        <span
          style={{
            background: 'rgba(255,255,255,0.08)',
            padding: '2px 5px',
            borderRadius: '4px',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          O
        </span>{' '}
        (Out)
        <span
          style={{
            background: 'rgba(255,255,255,0.08)',
            padding: '2px 5px',
            borderRadius: '4px',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          &lt; / &gt;
        </span>{' '}
        (Frame Step)
      </div>
    )}

    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <button
        onClick={() => useStore.getState().setWhatsAppShareTarget(target)}
        title="Share"
        style={{
          background: 'rgba(0, 255, 136, 0.12)',
          border: '1px solid rgba(0, 255, 136, 0.35)',
          color: 'var(--accent, #00ff88)',
          padding: '9px 16px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 255, 136, 0.22)';
          e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0, 255, 136, 0.12)';
          e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.35)';
        }}
      >
        <Share2 size={15} />
        <span>Share...</span>
      </button>

      <button
        onClick={onClose}
        disabled={isProcessing}
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: 'rgba(255, 255, 255, 0.75)',
          padding: '9px 18px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.75)';
        }}
      >
        Cancel
      </button>

      <button
        onClick={() => onExport(true)}
        disabled={isProcessing}
        style={{
          background: 'rgba(255, 77, 77, 0.12)',
          border: '1px solid rgba(255, 77, 77, 0.35)',
          color: '#ff6666',
          padding: '9px 18px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 700,
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 77, 77, 0.22)';
          e.currentTarget.style.borderColor = '#ff4d4d';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 77, 77, 0.12)';
          e.currentTarget.style.borderColor = 'rgba(255, 77, 77, 0.35)';
        }}
      >
        Replace Video In-Place
      </button>

      <button
        onClick={() => onExport(false)}
        disabled={isProcessing}
        style={{
          background: 'linear-gradient(135deg, var(--accent, #00ff88) 0%, #00e5ff 100%)',
          border: 'none',
          color: '#000',
          padding: '9px 22px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 800,
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 20px rgba(0, 255, 136, 0.35)',
          transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.03)';
          e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 255, 136, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 255, 136, 0.35)';
        }}
      >
        <Check size={16} strokeWidth={3} />
        Save as New Clip
      </button>
    </div>
  </div>
);
