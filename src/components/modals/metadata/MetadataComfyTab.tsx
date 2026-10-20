import React from 'react';
import { Plus, Save, Trash2, Wand2, Copy, Check } from 'lucide-react';
import type { MetadataKeyValue, ExtractedComfySummary } from './MetadataTypes';
import { formatBytes } from './MetadataTypes';

interface MetadataComfyTabProps {
  comfySummary: ExtractedComfySummary | null;
  editableComfyEntries: MetadataKeyValue[];
  setEditableComfyEntries: React.Dispatch<React.SetStateAction<MetadataKeyValue[]>>;
  activePath: string;
  isProcessing: boolean;
  copiedKey: string | null;
  copyText: (key: string, text: string) => void;
  onSaveComfyEdits: () => void;
}

export const MetadataComfyTab: React.FC<MetadataComfyTabProps> = ({
  comfySummary,
  editableComfyEntries,
  setEditableComfyEntries,
  activePath,
  isProcessing,
  copiedKey,
  copyText,
  onSaveComfyEdits,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Smart ComfyUI Extracted Summary */}
      {comfySummary && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'rgba(168, 85, 247, 0.08)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#d8b4fe', letterSpacing: '0.6px' }}>
              🧬 EXTRACTED COMFYUI GENERATION SUMMARY ({comfySummary.nodeCount} NODES)
            </span>
          </div>

          {comfySummary.models.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                Models / Checkpoints:
              </span>
              {comfySummary.models.map((m) => (
                <span
                  key={m}
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(0,0,0,0.35)',
                    color: '#f3e8ff',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          )}

          {comfySummary.samplerInfo.length > 0 && (
            <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
              <strong style={{ color: 'rgba(255,255,255,0.55)' }}>Sampler: </strong>
              {comfySummary.samplerInfo.join(' | ')}
            </div>
          )}

          {comfySummary.positivePrompts.map((p, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid rgba(0, 255, 136, 0.2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--accent, #00ff88)' }}>
                  POSITIVE PROMPT
                </span>
                <button
                  onClick={() => copyText(`pos-${idx}`, p)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#cbd5e1',
                    fontSize: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copiedKey === `pos-${idx}` ? <Check size={11} /> : <Copy size={11} />}
                  {copiedKey === `pos-${idx}` ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: '11.5px', color: '#f1f5f9', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                {p}
              </div>
            </div>
          ))}

          {comfySummary.negativePrompts.map((p, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid rgba(248, 113, 113, 0.2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#f87171' }}>
                  NEGATIVE PROMPT
                </span>
                <button
                  onClick={() => copyText(`neg-${idx}`, p)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#cbd5e1',
                    fontSize: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copiedKey === `neg-${idx}` ? <Check size={11} /> : <Copy size={11} />}
                  {copiedKey === `neg-${idx}` ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: '11.5px', color: '#fca5a5', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                {p}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw ComfyUI Chunks Editor */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>
          EMBEDDED COMFYUI / AI CHUNKS ({editableComfyEntries.length})
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() =>
              setEditableComfyEntries((prev) => [
                ...prev,
                { key: 'prompt', value: '{}', source: 'PNG tEXt' },
              ])
            }
            style={{
              padding: '5px 10px',
              borderRadius: '7px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Plus size={12} />
            Add Chunk
          </button>
          {activePath && (
            <button
              disabled={isProcessing}
              onClick={onSaveComfyEdits}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                background: 'rgba(0, 255, 136, 0.18)',
                border: '1px solid rgba(0, 255, 136, 0.45)',
                color: 'var(--accent, #00ff88)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Save size={12} />
              Save ComfyUI Edits to File
            </button>
          )}
        </div>
      </div>

      {editableComfyEntries.length === 0 ? (
        <div
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '12px',
            border: '1px dashed rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.45)',
            fontSize: '12px',
          }}
        >
          ✨ No ComfyUI workflow or prompt JSON chunks are embedded in this file.
        </div>
      ) : (
        editableComfyEntries.map((entry, idx) => (
          <div
            key={idx}
            style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>
                  KEY:
                </span>
                <input
                  type="text"
                  value={entry.key}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditableComfyEntries((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, key: val } : item))
                    );
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    color: '#e9d5ff',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    width: '160px',
                  }}
                />
                <span
                  style={{
                    fontSize: '9.5px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.5)',
                  }}
                >
                  {entry.source} • {formatBytes(entry.value.length)}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => {
                    try {
                      const pretty = JSON.stringify(JSON.parse(entry.value), null, 2);
                      setEditableComfyEntries((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, value: pretty } : item))
                      );
                    } catch {
                      // Not valid JSON
                    }
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    color: '#cbd5e1',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Wand2 size={11} />
                  Format JSON
                </button>
                <button
                  onClick={() => copyText(`chunk-${idx}`, entry.value)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    color: '#cbd5e1',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copiedKey === `chunk-${idx}` ? <Check size={11} /> : <Copy size={11} />}
                  {copiedKey === `chunk-${idx}` ? 'Copied' : 'Copy JSON'}
                </button>
                <button
                  onClick={() =>
                    setEditableComfyEntries((prev) => prev.filter((_, i) => i !== idx))
                  }
                  title="Remove this chunk (click Save ComfyUI Edits to write)"
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    padding: '4px 7px',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            <textarea
              value={entry.value}
              onChange={(e) => {
                const val = e.target.value;
                setEditableComfyEntries((prev) =>
                  prev.map((item, i) => (i === idx ? { ...item, value: val } : item))
                );
              }}
              rows={8}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px',
                color: '#e2e8f0',
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: '11px',
                lineHeight: 1.45,
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>
        ))
      )}
    </div>
  );
};
