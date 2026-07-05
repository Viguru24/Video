import React, { useState, useEffect } from 'react';
import { Layout, X, Palette, FolderOpen, Loader } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface GenerateStoreLogosModalProps {
  isOpen: boolean;
  onClose: () => void;
  imagePath: string;
  onLog?: (msg: string) => void;
}

export const GenerateStoreLogosModal: React.FC<GenerateStoreLogosModalProps> = ({
  isOpen,
  onClose,
  imagePath,
  onLog
}) => {
  const [bgColor, setBgColor] = useState('#00000000'); // Default transparent
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successPath, setSuccessPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsGenerating(false);
    setErrorMsg(null);
    setSuccessPath(null);

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

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    setSuccessPath(null);

    if (onLog) {
      onLog(`Generating Microsoft Store logos for ${imagePath}...`);
    }

    try {
      const result: string = await invoke('generate_store_logos', {
        path: imagePath,
        bgColor: bgColor
      });
      setSuccessPath(result);
      if (onLog) {
        onLog(`Successfully generated Store logos in: ${result}`);
      }
    } catch (err: any) {
      setErrorMsg(err.toString());
      if (onLog) {
        onLog(`Store logo generation failed: ${err}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!successPath) return;
    try {
      await invoke('open_folder', { path: successPath });
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };

  const colorPresets = [
    { label: 'Transparent', value: '#00000000' },
    { label: 'Black', value: '#000000ff' },
    { label: 'White', value: '#ffffffff' },
    { label: 'Theme Blue', value: '#4f8ff7ff' },
    { label: 'Dark Mode', value: '#121218ff' }
  ];

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
        zIndex: 350000,
        userSelect: 'none'
      }}
    >
      <div
        style={{
          background: 'rgba(18, 18, 24, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '30px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          position: 'relative'
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          <X size={20} />
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '10px', borderRadius: '50%', background: 'rgba(79, 143, 247, 0.1)', color: '#4f8ff7', marginBottom: '12px' }}>
            <Layout size={24} />
          </div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>
            STORE LOGO CREATOR
          </h2>
          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#aaa', padding: '0 10px', lineHeight: 1.4 }}>
            Generate all mandatory Microsoft Partner Center asset sizes:
          </p>
        </div>

        {/* Sizes List */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '11px',
          color: '#bbb',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>• 9:16 Poster Art (Xbox)</span>
            <strong>720 × 1080 px</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>• 1:1 Box Art</span>
            <strong>1080 × 1080 px</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>• 1:1 App Tile Icon</span>
            <strong>300 × 300 px</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>• 1:1 Medium Store Logo</span>
            <strong>150 × 150 px</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>• 1:1 Small Store Logo</span>
            <strong>71 × 71 px</strong>
          </div>
        </div>

        {/* Configuration Panel */}
        {!successPath && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '12px', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Palette size={14} color="#4f8ff7" />
              <span>Background Canvas Fill:</span>
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {colorPresets.map(preset => (
                <button
                  key={preset.value}
                  onClick={() => setBgColor(preset.value)}
                  style={{
                    background: bgColor === preset.value ? 'rgba(79, 143, 247, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: bgColor === preset.value ? '1px solid #4f8ff7' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    color: bgColor === preset.value ? '#fff' : '#aaa',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Hex Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: '#888' }}>Custom Hex (with Alpha):</span>
              <input
                type="text"
                value={bgColor}
                onChange={e => setBgColor(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  color: '#fff',
                  fontSize: '11px',
                  width: '90px',
                  textAlign: 'center'
                }}
              />
            </div>
          </div>
        )}

        {/* Messages */}
        {errorMsg && (
          <div style={{ background: 'rgba(255, 78, 78, 0.1)', border: '1px solid rgba(255, 78, 78, 0.2)', borderRadius: '10px', padding: '10px', color: '#ff4e4e', fontSize: '11px', lineHeight: 1.4 }}>
            {errorMsg}
          </div>
        )}

        {successPath && (
          <div style={{
            background: 'rgba(0, 255, 136, 0.05)',
            border: '1px solid rgba(0, 255, 136, 0.15)',
            borderRadius: '12px',
            padding: '15px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <span style={{ color: '#00ff88', fontSize: '12px', fontWeight: 'bold' }}>
              All 5 Microsoft Store logos generated successfully!
            </span>
            <button
              onClick={handleOpenFolder}
              style={{
                background: 'rgba(0, 255, 136, 0.1)',
                border: '1px solid rgba(0, 255, 136, 0.3)',
                borderRadius: '8px',
                color: '#00ff88',
                padding: '8px 16px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                alignSelf: 'center',
                transition: 'background 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.2)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.1)'}
            >
              <FolderOpen size={14} />
              Open Output Directory
            </button>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
          >
            {successPath ? 'CLOSE' : 'CANCEL'}
          </button>

          {!successPath && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              style={{
                background: '#4f8ff7',
                border: 'none',
                color: '#fff',
                padding: '8px 20px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'background 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.background = '#659ff9'}
              onMouseOut={e => e.currentTarget.style.background = '#4f8ff7'}
            >
              {isGenerating ? (
                <>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  GENERATING...
                </>
              ) : (
                'GENERATE LOGOS'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
