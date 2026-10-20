import React from 'react';
import { RefreshCw } from 'lucide-react';
import { SaveUpscaleModal } from '../modals/SaveUpscaleModal';
import type { VideoItem } from '../../types';

interface PopoutModalsProps {
  showSaveCropOptions: boolean;
  setShowSaveCropOptions: (show: boolean) => void;
  handleSaveCrop: (overwrite: boolean, useAi: boolean) => Promise<void>;
  showSaveUpscaleOptions: boolean;
  setShowSaveUpscaleOptions: (show: boolean) => void;
  upscaleTarget: VideoItem | null;
  executeUpscale: (overwrite: boolean) => Promise<void>;
  upscaleStatus: 'idle' | 'enhancing' | 'success' | 'failed';
  lastEnhancedTitle: string;
  upscaleProgressPercent: number | null;
  upscaleStage: string | null;
  cancelEnhancement: () => void;
}

export const PopoutModals: React.FC<PopoutModalsProps> = ({
  showSaveCropOptions,
  setShowSaveCropOptions,
  handleSaveCrop,
  showSaveUpscaleOptions,
  setShowSaveUpscaleOptions,
  upscaleTarget,
  executeUpscale,
  upscaleStatus,
  lastEnhancedTitle,
  upscaleProgressPercent,
  upscaleStage,
  cancelEnhancement,
}) => {
  return (
    <>
      {showSaveCropOptions && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300000,
            fontFamily: 'Inter, sans-serif'
          }}
        >
          <div
            style={{
              background: '#16161a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '20px',
              padding: '24px',
              width: '360px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)'
            }}
          >
            <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>
              Save Cropped Image
            </h3>
            <p style={{ margin: 0, color: '#aaa', fontSize: '13px', lineHeight: 1.4 }}>
              Choose whether to overwrite the original source image or save the cropped image as a new asset.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => handleSaveCrop(true, false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
              >
                Overwrite Original
              </button>
              <button
                onClick={() => handleSaveCrop(false, false)}
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.2), rgba(0, 210, 255, 0.2))',
                  border: '1px solid rgba(0, 255, 136, 0.4)',
                  color: 'var(--accent, #00ff88)',
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.3), rgba(0, 210, 255, 0.3))'}
                onMouseOut={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.2), rgba(0, 210, 255, 0.2))'}
              >
                Save as New Asset
              </button>
              <button
                onClick={() => handleSaveCrop(true, true)}
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 0, 128, 0.15), rgba(121, 40, 202, 0.15))',
                  border: '1px solid rgba(255, 0, 128, 0.3)',
                  color: '#ff79c6',
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 0, 128, 0.25), rgba(121, 40, 202, 0.25))'}
                onMouseOut={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 0, 128, 0.15), rgba(121, 40, 202, 0.15))'}
              >
                ✨ Overwrite & AI Upscale
              </button>
              <button
                onClick={() => setShowSaveCropOptions(false)}
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
      )}

      {showSaveUpscaleOptions && upscaleTarget && (
        <SaveUpscaleModal
          isOpen={true}
          target={upscaleTarget}
          onClose={() => setShowSaveUpscaleOptions(false)}
          onExecute={executeUpscale}
        />
      )}

      {upscaleStatus === 'enhancing' && (
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
            onClick={cancelEnhancement}
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
      )}
    </>
  );
};
