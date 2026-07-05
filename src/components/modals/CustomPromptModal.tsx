import { motion } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';

interface CustomPromptModalProps {
  title: string;
  message: string;
  defaultValue?: string;
  onResolve: (val: string | null) => void;
}

export function CustomPromptModal({
  title,
  message,
  defaultValue = '',
  onResolve,
}: CustomPromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the input and select the text
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onResolve(value);
    } else if (e.key === 'Escape') {
      onResolve(null);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2000000 }}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="modal-content premium-glass"
        style={{ width: '450px', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '24px' }}
      >
        <div
          className="modal-header"
          style={{
            marginBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              className="accent-icon-box"
              style={{
                background: 'rgba(0, 255, 136, 0.15)',
                border: '1px solid var(--accent, #00ff88)',
              }}
            >
              <HelpCircle
                size={20}
                style={{
                  color: 'var(--accent, #00ff88)',
                }}
              />
            </div>
            <div>
              <h2
                style={{
                  fontSize: '14px',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                {title}
              </h2>
              <span style={{ fontSize: '9px', opacity: 0.5, fontWeight: 800, letterSpacing: '0.5px' }}>
                INPUT DIRECTIVE ACTION
              </span>
            </div>
          </div>
        </div>
        
        <div
          className="modal-body"
          style={{
            color: 'var(--text-secondary)',
            fontSize: '11px',
            lineHeight: '1.6',
            marginBottom: '16px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {message}
        </div>

        <div style={{ marginBottom: '24px' }}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '6px',
              padding: '10px 12px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
              transition: 'border-color 0.2s',
              fontFamily: 'var(--font-sans, sans-serif)',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--accent, #00ff88)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            className="premium-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--text-primary)',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '11px',
              letterSpacing: '0.5px',
            }}
            onClick={() => onResolve(null)}
          >
            CANCEL
          </button>
          <button
            className="premium-btn"
            style={{
              background: 'var(--accent, #00ff88)',
              color: '#000000',
              border: 'none',
              padding: '8px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '11px',
              letterSpacing: '0.5px',
              boxShadow: '0 0 15px rgba(0, 255, 136, 0.25)',
            }}
            onClick={() => onResolve(value)}
          >
            CONFIRM
          </button>
        </div>
      </motion.div>
    </div>
  );
}
