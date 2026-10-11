import React from 'react';
import { Sparkles, Share2 } from 'lucide-react';
import type { VideoItem } from '../../types';
import { useStore } from '../../store/useStore';

interface SoloAiMenuProps {
  focusedVideo: VideoItem;
  showAiMenu: boolean;
  setShowAiMenu: (show: boolean) => void;
  setShowReshapeModal: (show: boolean) => void;
  setShowFrameModal: (show: boolean) => void;
  setShowPortraitBlurModal: (show: boolean) => void;
  handleUpscale: (v: VideoItem) => void;
  isStickerLoading?: boolean;
  onCreateSticker?: (video: VideoItem) => void;
}

export const SoloAiMenu: React.FC<SoloAiMenuProps> = ({
  focusedVideo,
  showAiMenu,
  setShowAiMenu,
  setShowReshapeModal,
  setShowFrameModal,
  setShowPortraitBlurModal,
  handleUpscale,
  isStickerLoading,
  onCreateSticker,
}) => {
  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          setShowAiMenu(!showAiMenu);
        }}
        style={{
          background: showAiMenu ? 'rgba(255, 255, 255, 0.15)' : 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          borderRadius: '50%',
          transition: 'all 0.2s'
        }}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseOut={e => {
          if (!showAiMenu) e.currentTarget.style.background = 'none';
        }}
        title="✨ AI & Reshape Tools"
      >
        <Sparkles size={14} style={{ color: '#fff' }} />
      </button>

      {/* Popover Menu for AI & Reshape Tools */}
      {showAiMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: '40px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 10, 14, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '14px',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)',
            zIndex: 250000,
            minWidth: '200px'
          }}
        >
          {focusedVideo.type === 'video' && (
            <button
              onClick={() => {
                setShowAiMenu(false);
                useStore.getState().setTrimCropModalTarget(focusedVideo);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent, #00ff88)',
                padding: '5px 10px',
                borderRadius: '8px',
                fontSize: '10px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                whiteSpace: 'nowrap'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.12)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <span>✂️ Trim, Crop & Pan Studio</span>
            </button>
          )}

          <button
            onClick={() => {
              setShowAiMenu(false);
              useStore.getState().setWhatsAppShareTarget(focusedVideo);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent, #00ff88)',
              padding: '5px 10px',
              borderRadius: '8px',
              fontSize: '10px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              whiteSpace: 'nowrap'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.12)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            <Share2 size={12} />
            <span>🚀 Share...</span>
          </button>

          {focusedVideo.type !== 'video' && (
            <>
              <button
                onClick={() => {
                  setShowAiMenu(false);
                  setShowReshapeModal(true);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  whiteSpace: 'nowrap'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>✨ Reshape & Sculpt Studio</span>
              </button>

              <button
                onClick={() => {
                  setShowAiMenu(false);
                  setShowFrameModal(true);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  whiteSpace: 'nowrap'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>🖼️ Photo Frames & Corners</span>
              </button>

              <button
                onClick={() => {
                  setShowAiMenu(false);
                  setShowPortraitBlurModal(true);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  whiteSpace: 'nowrap'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>✨ AI Portrait Blur (Bokeh)</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              setShowAiMenu(false);
              handleUpscale(focusedVideo);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              padding: '5px 10px',
              borderRadius: '8px',
              fontSize: '10px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              whiteSpace: 'nowrap'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            <span>⚡ AI Upscale (4x Enhance)</span>
          </button>

          {onCreateSticker && (
            <button
              onClick={() => {
                setShowAiMenu(false);
                onCreateSticker(focusedVideo);
              }}
              disabled={isStickerLoading}
              style={{
                background: 'transparent',
                border: 'none',
                color: isStickerLoading ? '#666' : '#fff',
                padding: '5px 10px',
                borderRadius: '8px',
                fontSize: '10px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: isStickerLoading ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                whiteSpace: 'nowrap'
              }}
              onMouseOver={e => {
                if (!isStickerLoading) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <span>✂️ Create AI Sticker Cutout</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
