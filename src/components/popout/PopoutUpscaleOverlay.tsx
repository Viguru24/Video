import React from 'react';
import { RefreshCw } from 'lucide-react';

interface PopoutUpscaleOverlayProps {
  upscaleStatus: 'idle' | 'enhancing' | 'success' | 'failed';
  lastEnhancedTitle: string;
  upscaleProgressPercent: number | null;
  upscaleStage: string | null;
  onCancelEnhancement: () => void;
}

export const PopoutUpscaleOverlay: React.FC<PopoutUpscaleOverlayProps> = ({
  upscaleStatus,
  lastEnhancedTitle,
  upscaleProgressPercent,
  upscaleStage,
  onCancelEnhancement,
}) => {
  if (upscaleStatus !== 'enhancing') return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(5, 5, 8, 0.93)',
        backdropFilter: 'blur(25px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 400000,
        gap: '20px',
        userSelect: 'none',
        fontFamily: 'Inter, sans-serif'
      }}
    >
      <RefreshCw size={48} className="spin" style={{ color: 'var(--accent, #00ff88)' }} />
      <h3 style={{ margin: 0, color: '#fff', fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        ✨ AI Super-Resolution Active
      </h3>
      <p style={{ margin: 0, color: '#ccc', fontSize: '13px' }}>
        {lastEnhancedTitle 
          ? `Processing "${lastEnhancedTitle}"${upscaleProgressPercent !== null ? ` (${upscaleStage}: ${upscaleProgressPercent}%)` : '...'}` 
          : 'Enhancing target, please wait...'}
      </p>
      
      <div style={{ width: '280px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
        <div 
          style={{ 
            height: '100%', 
            background: 'linear-gradient(90deg, var(--accent, #00ff88), #00d2ff)', 
            width: upscaleProgressPercent !== null ? `${upscaleProgressPercent}%` : '5%',
            borderRadius: '3px',
            transition: upscaleProgressPercent !== null ? 'width 0.2s ease-out' : 'none',
            animation: upscaleProgressPercent === null ? 'shimmerBar 40s linear forwards' : 'none'
          }} 
        />
      </div>

      <button
        onClick={onCancelEnhancement}
        style={{
          background: 'rgba(255, 77, 77, 0.1)',
          border: '1px solid rgba(255, 77, 77, 0.25)',
          color: '#ff4d4d',
          borderRadius: '12px',
          padding: '10px 24px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '12px',
          transition: 'all 0.2s',
          marginTop: '15px'
        }}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.2)'}
        onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 77, 77, 0.1)'}
      >
        CANCEL UPSCALE
      </button>
    </div>
  );
};
