import React from 'react';

interface BootScreenProps {
  onBypass: () => void;
  onOpenWebsite: (e: React.MouseEvent) => void;
}

export const BootScreen: React.FC<BootScreenProps> = ({ onBypass, onOpenWebsite }) => {
  return (
    <div className="cosmo-boot">
      <div className="boot-nebula" />
      <div className="boot-content">
        <img src="/logo.png" className="boot-logo" alt="Cosmo Symphony" />
        <div className="boot-text">
          <h2>COSMO SYMPHONY</h2>
          <div className="boot-loader-bar">
            <div className="boot-loader-progress" />
          </div>
          <p>Initializing Symphony Orchestrator...</p>
          <div style={{ marginTop: '16px', fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', letterSpacing: '0.5px', WebkitFontSmoothing: 'antialiased' }}>
            🚀 Discover more professional tools & AI creative suites at{' '}
            <a 
              href="https://cosmowhisper.com" 
              onClick={onOpenWebsite} 
              style={{ color: 'var(--accent, #00ff88)', textDecoration: 'underline', fontWeight: 600, cursor: 'pointer' }}
            >
              cosmowhisper.com
            </a>
          </div>
          <button 
            className="boot-bypass-btn"
            onClick={onBypass} 
          >
            EMERGENCY BYPASS
          </button>
        </div>
      </div>
    </div>
  );
};
