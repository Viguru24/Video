import React from 'react';

interface ReshapeToolbarProps {
  activeTab: 'stretch' | 'sculpt';
  setActiveTab: (tab: 'stretch' | 'sculpt') => void;
  showSplitView: boolean;
  setShowSplitView: (val: boolean) => void;
  historyStep: number;
  historyStackLength: number;
  onUndo: () => void;
  onRedo: () => void;
  isSaving: boolean;
  onSaveCopy: () => void;
  onSaveOverwrite: () => void;
  scaleX: number;
  setScaleX: (v: number) => void;
  scaleY: number;
  setScaleY: (v: number) => void;
  sculptMode: 'inflate' | 'deflate' | 'blemish';
  setSculptMode: (mode: 'inflate' | 'deflate' | 'blemish') => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  brushStrength: number;
  setBrushStrength: (strength: number) => void;
  onReset: () => void;
}

export const ReshapeToolbar: React.FC<ReshapeToolbarProps> = ({
  activeTab,
  setActiveTab,
  showSplitView,
  setShowSplitView,
  historyStep,
  historyStackLength,
  onUndo,
  onRedo,
  isSaving,
  onSaveCopy,
  onSaveOverwrite,
  scaleX,
  setScaleX,
  scaleY,
  setScaleY,
  sculptMode,
  setSculptMode,
  brushSize,
  setBrushSize,
  brushStrength,
  setBrushStrength,
  onReset
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.38)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '20px',
        padding: '6px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
        zIndex: 250002,
        userSelect: 'none',
        maxWidth: '620px',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      {/* Toggle Collapse Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: '10px', alignItems: 'center' }}>
          <button
            onClick={() => setActiveTab('stretch')}
            style={{
              background: activeTab === 'stretch' ? 'var(--accent, #00ff88)' : 'transparent',
              color: activeTab === 'stretch' ? '#000' : 'rgba(255,255,255,0.8)',
              border: 'none',
              borderRadius: '7px',
              padding: '3px 9px',
              fontSize: '9px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ↔️ Stretch
          </button>
          <button
            onClick={() => setActiveTab('sculpt')}
            style={{
              background: activeTab === 'sculpt' ? 'var(--accent, #00ff88)' : 'transparent',
              color: activeTab === 'sculpt' ? '#000' : 'rgba(255,255,255,0.8)',
              border: 'none',
              borderRadius: '7px',
              padding: '3px 9px',
              fontSize: '9px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            🎨 Sculpt
          </button>
          <button
            onClick={() => setShowSplitView(!showSplitView)}
            onPointerDown={() => setShowSplitView(true)}
            onPointerUp={() => setShowSplitView(false)}
            style={{
              background: showSplitView ? '#00e5ff' : 'rgba(255,255,255,0.07)',
              color: showSplitView ? '#000' : 'rgba(255,255,255,0.8)',
              border: 'none',
              borderRadius: '7px',
              padding: '3px 9px',
              fontSize: '9px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="Click or Hold to Compare (Auto-dismisses on click or sculpt)"
          >
            {showSplitView ? '↔️ Split: ON' : '↔️ Split'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* Undo & Redo History Buttons */}
          <button
            onClick={onUndo}
            disabled={historyStep <= 0}
            title="Undo Last Stroke (Ctrl+Z)"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: historyStep > 0 ? '#fff' : 'rgba(255,255,255,0.25)',
              borderRadius: '7px',
              padding: '3px 8px',
              fontSize: '9px',
              cursor: historyStep > 0 ? 'pointer' : 'default'
            }}
          >
            ↩️ Undo
          </button>
          <button
            onClick={onRedo}
            disabled={historyStep >= historyStackLength - 1}
            title="Redo (Ctrl+Y)"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: historyStep < historyStackLength - 1 ? '#fff' : 'rgba(255,255,255,0.25)',
              borderRadius: '7px',
              padding: '3px 8px',
              fontSize: '9px',
              cursor: historyStep < historyStackLength - 1 ? 'pointer' : 'default'
            }}
          >
            ↪️ Redo
          </button>

          <button
            onClick={onSaveCopy}
            disabled={isSaving}
            style={{
              background: 'var(--accent, #00ff88)',
              border: 'none',
              color: '#000',
              padding: '3px 10px',
              borderRadius: '10px',
              fontSize: '9px',
              fontWeight: 800,
              cursor: isSaving ? 'wait' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            ➕ {isSaving ? 'Saving...' : 'Save Copy'}
          </button>
          <button
            onClick={onSaveOverwrite}
            disabled={isSaving}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#fff',
              padding: '3px 10px',
              borderRadius: '10px',
              fontSize: '9px',
              fontWeight: 700,
              cursor: isSaving ? 'wait' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            💾 Overwrite
          </button>
        </div>
      </div>

      {activeTab === 'stretch' && (
        <div style={{ display: 'flex', gap: '16px', width: '100%', justifyContent: 'center', alignItems: 'center', paddingTop: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '160px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
              <span>Width (Thinner/Wider)</span>
              <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 'bold' }}>{Math.round(scaleX * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.8"
              step="0.01"
              value={scaleX}
              onChange={(e) => setScaleX(parseFloat(e.target.value))}
              style={{ accentColor: 'var(--accent, #00ff88)' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '160px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
              <span>Height (Shorter/Taller)</span>
              <span style={{ color: 'var(--accent, #00ff88)', fontWeight: 'bold' }}>{Math.round(scaleY * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.8"
              step="0.01"
              value={scaleY}
              onChange={(e) => setScaleY(parseFloat(e.target.value))}
              style={{ accentColor: 'var(--accent, #00ff88)' }}
            />
          </div>

          <button
            onClick={onReset}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '10px',
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
        </div>
      )}

      {activeTab === 'sculpt' && (
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', width: '100%', justifyContent: 'center', paddingTop: '4px' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: '6px' }}>
            <button
              onClick={() => setSculptMode('blemish')}
              style={{
                background: sculptMode === 'blemish' ? 'var(--accent, #00ff88)' : 'transparent',
                color: sculptMode === 'blemish' ? '#000' : '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '10px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              🩹 Spot Blemish Eraser
            </button>
            <button
              onClick={() => setSculptMode('inflate')}
              style={{
                background: sculptMode === 'inflate' ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '10px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              🔍 Inflate
            </button>
            <button
              onClick={() => setSculptMode('deflate')}
              style={{
                background: sculptMode === 'deflate' ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '10px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              🔍 Deflate
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '150px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>Brush Size:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <input
                  type="number"
                  min="1"
                  max="600"
                  value={brushSize}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) setBrushSize(Math.max(1, Math.min(600, val)));
                  }}
                  style={{
                    width: '38px',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '4px',
                    color: 'var(--accent, #00ff88)',
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '1px 3px',
                    textAlign: 'center'
                  }}
                />
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>px</span>
              </div>
            </div>
            <input
              type="range"
              min="1"
              max="600"
              step="1"
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value) || 1)}
              style={{ accentColor: 'var(--accent, #00ff88)' }}
              title="Brush Size (Shortcut: [ to shrink down to 1px, ] to enlarge)"
            />
            <div style={{ display: 'flex', gap: '3px', marginTop: '1px' }}>
              {[1, 5, 15, 45, 120].map((size) => (
                <button
                  key={size}
                  onClick={() => setBrushSize(size)}
                  style={{
                    background: brushSize === size ? 'var(--accent, #00ff88)' : 'rgba(255,255,255,0.08)',
                    color: brushSize === size ? '#000' : 'rgba(255,255,255,0.7)',
                    border: 'none',
                    borderRadius: '3px',
                    fontSize: '8px',
                    fontWeight: 700,
                    padding: '1px 4px',
                    cursor: 'pointer'
                  }}
                >
                  {size}p
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '110px' }}>
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)' }}>Strength: {Math.round(brushStrength * 100)}%</span>
            <input
              type="range"
              min="0.1"
              max="0.8"
              step="0.05"
              value={brushStrength}
              onChange={(e) => setBrushStrength(parseFloat(e.target.value))}
              style={{ accentColor: 'var(--accent, #00ff88)' }}
            />
          </div>

          <button
            onClick={onReset}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '10px',
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
};
