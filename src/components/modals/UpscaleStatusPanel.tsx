import React from 'react';

interface UpscaleStatusPanelProps {
  status: 'idle' | 'enhancing' | 'success' | 'failed' | 'fallback';
  progressPercent: number | null;
  stage: string | null;
  title: string;
  onCancel: () => void;
  onDismiss: () => void;
}

export const UpscaleStatusPanel: React.FC<UpscaleStatusPanelProps> = ({
  status,
  progressPercent,
  stage,
  title,
  onCancel,
  onDismiss
}) => {
  if (status === 'idle') return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '25px',
        right: '25px',
        width: '350px',
        background: 'rgba(10, 10, 16, 0.85)',
        backdropFilter: 'blur(16px)',
        border: status === 'success' 
          ? '1px solid rgba(0, 255, 136, 0.5)' 
          : (status === 'fallback' 
              ? '1px solid rgba(255, 170, 0, 0.5)' 
              : (status === 'failed' ? '1px solid rgba(255, 68, 68, 0.5)' : '1px solid rgba(0, 255, 136, 0.25)')),
        borderRadius: '16px',
        boxShadow: status === 'success'
          ? '0 8px 32px rgba(0, 255, 136, 0.15)'
          : (status === 'fallback'
              ? '0 8px 32px rgba(255, 170, 0, 0.15)'
              : '0 8px 32px rgba(0, 0, 0, 0.5)'),
        padding: '18px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        zIndex: 350000,
        color: '#fff',
        fontFamily: 'Inter, sans-serif',
        animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      {status === 'enhancing' ? (
        <div className="spinner" style={{ width: '28px', height: '28px', border: '3px solid rgba(0, 255, 136, 0.1)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
      ) : (
        status === 'success' ? (
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0, 255, 136, 0.15)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: 'bounceIn 0.5s ease' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
        ) : (
          status === 'fallback' ? (
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255, 170, 0, 0.15)', border: '1px solid #ffaa00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: 'bounceIn 0.5s ease' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffaa00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
          ) : (
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255, 68, 68, 0.15)', border: '1px solid #ff4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </div>
          )
        )
      )}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes bounceIn {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.1); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: status === 'success' ? 'var(--accent)' : (status === 'fallback' ? '#ffaa00' : '#ff4444'), letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          {status === 'enhancing' 
            ? 'AI Super-Resolution Active' 
            : (status === 'success' 
                ? 'Upscale Finished!' 
                : (status === 'fallback' ? 'Basic Resize Completed' : 'Upscale Failed'))}
        </h4>
        <p style={{ margin: 0, fontSize: '11px', color: '#ccc', lineHeight: '1.4' }}>
          {status === 'enhancing' 
            ? (stage === 'loading_vram'
                ? 'Loading AI model into V-RAM...'
                : (stage === 'upscaling'
                    ? `OK now upscaling "${title}"${progressPercent !== null ? ` (${progressPercent}%)` : '...'}`
                    : `Processing "${title}"${stage ? ` (${stage})` : ''}...`
                  )
              )
            : (status === 'success' 
                ? `Hey, your upscale for "${title}" is finished! Enjoy your high-fidelity asset.` 
                : (status === 'fallback'
                    ? `Completed using high-quality Lanczos3 resize. Place AI models in .cosmo_models for super-resolution.`
                    : 'An error occurred during upscaling.'))
          }
        </p>
        
        {status === 'enhancing' && (
          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
            <div 
              style={{ 
                height: '100%', 
                background: 'linear-gradient(90deg, var(--accent), #00d2ff)', 
                width: progressPercent !== null ? `${progressPercent}%` : '5%',
                borderRadius: '2px',
                transition: progressPercent !== null ? 'width 0.2s ease-out' : 'none',
                animation: progressPercent === null ? 'shimmerBar 40s linear forwards' : 'none'
              }} 
            />
            <style>{`
              @keyframes shimmerBar {
                0% { width: 5%; }
                5% { width: 25%; }
                20% { width: 45%; }
                50% { width: 70%; }
                80% { width: 85%; }
                95% { width: 92%; }
                100% { width: 95%; }
              }
            `}</style>
          </div>
        )}
      </div>

      {status === 'enhancing' ? (
        <button
          onClick={onCancel}
          title="Cancel enhancement"
          style={{
            flexShrink: 0,
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'rgba(255, 68, 68, 0.12)',
            border: '1px solid rgba(255, 68, 68, 0.4)',
            color: '#ff4444',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(255, 68, 68, 0.25)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'rgba(255, 68, 68, 0.12)'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ff4444">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        </button>
      ) : (
        <button
          onClick={onDismiss}
          title="Dismiss"
          style={{
            flexShrink: 0,
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            lineHeight: 1,
            transition: 'all 0.15s ease',
          }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
        >
          ×
        </button>
      )}
    </div>
  );
};
