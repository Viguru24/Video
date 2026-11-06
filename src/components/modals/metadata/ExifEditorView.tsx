import React, { useState } from 'react';
import { Save, MapPin, Search } from 'lucide-react';
import type { FileMetadataReport, EditableExifFields, MetadataKeyValue } from './types';

export interface ExifEditorViewProps {
  activeReport: FileMetadataReport | undefined;
  activePath: string | null;
  checkedList: string[];
  isProcessing: boolean;
  editableExif: EditableExifFields;
  setEditableExif: React.Dispatch<React.SetStateAction<EditableExifFields>>;
  editableComfyEntries: MetadataKeyValue[];
  onExecuteMetadataAction: (
    action: 'strip_comfyui' | 'strip_exif' | 'strip_all' | 'update_metadata',
    targetPaths: string[],
    exifData?: EditableExifFields,
    comfyData?: MetadataKeyValue[]
  ) => void;
}

export function ExifEditorView({
  activeReport,
  activePath,
  checkedList,
  isProcessing,
  editableExif,
  setEditableExif,
  editableComfyEntries,
  onExecuteMetadataAction,
}: ExifEditorViewProps) {
  const [exifSearch, setExifSearch] = useState('');

  const filteredExifEntries = activeReport?.exif_entries.filter((entry) => {
    if (!exifSearch.trim()) return true;
    const q = exifSearch.toLowerCase();
    return entry.key.toLowerCase().includes(q) || entry.value.toLowerCase().includes(q);
  }) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Editable EXIF Form */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.025)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#38bdf8' }}>
              EDITABLE EXIF / FILE METADATA TAGS
            </div>
            <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.45)' }}>
              Edit fields below and save to this file or apply across all {checkedList.length} checked files.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() =>
                setEditableExif({
                  title: '',
                  artist: '',
                  copyright: '',
                  description: '',
                  comment: '',
                  software: '',
                  date_time: '',
                })
              }
              style={{
                padding: '6px 10px',
                borderRadius: '7px',
                fontSize: '10.5px',
                fontWeight: 700,
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#d4d4d8',
              }}
            >
              Clear Fields
            </button>

            {activePath && (
              <button
                disabled={isProcessing}
                onClick={() =>
                  onExecuteMetadataAction(
                    'update_metadata',
                    [activePath],
                    editableExif,
                    editableComfyEntries
                  )
                }
                style={{
                  padding: '6px 12px',
                  borderRadius: '7px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: 'rgba(56, 189, 248, 0.18)',
                  border: '1px solid rgba(56, 189, 248, 0.45)',
                  color: '#bae6fd',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Save size={12} />
                Save EXIF to Active File
              </button>
            )}

            {checkedList.length > 1 && (
              <button
                disabled={isProcessing}
                onClick={() =>
                  onExecuteMetadataAction('update_metadata', checkedList, editableExif)
                }
                style={{
                  padding: '6px 12px',
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
                Batch Apply EXIF to All Checked ({checkedList.length})
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '10px',
          }}
        >
          {(
            [
              { key: 'title', label: 'Title', placeholder: 'Image / File Title...' },
              { key: 'artist', label: 'Artist / Author', placeholder: 'Creator or Author name...' },
              { key: 'copyright', label: 'Copyright', placeholder: '© 2026 ...' },
              { key: 'software', label: 'Software', placeholder: 'Application / Encoder...' },
              { key: 'date_time', label: 'Date / Time', placeholder: 'YYYY:MM:DD HH:MM:SS' },
              { key: 'description', label: 'Description', placeholder: 'Subject or scene description...' },
            ] as const
          ).map((field) => (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
                {field.label}
              </label>
              <input
                type="text"
                value={editableExif[field.key] || ''}
                placeholder={field.placeholder}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditableExif((prev) => ({ ...prev, [field.key]: val }));
                }}
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '7px',
                  padding: '7px 10px',
                  color: '#fff',
                  fontSize: '11.5px',
                  outline: 'none',
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
            User Comment / Notes
          </label>
          <textarea
            rows={2}
            value={editableExif.comment || ''}
            placeholder="Optional comment embedded in EXIF UserComment / PNG Comment..."
            onChange={(e) => {
              const val = e.target.value;
              setEditableExif((prev) => ({ ...prev, comment: val }));
            }}
            style={{
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '7px',
              padding: '7px 10px',
              color: '#fff',
              fontSize: '11.5px',
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Raw Detected EXIF Entries List */}
      <div>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 800,
            color: 'rgba(255,255,255,0.6)',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          <span>DETECTED RAW EXIF / CONTAINER TAGS ({activeReport?.exif_entries.length || 0})</span>
          {activeReport && (activeReport as any).has_gps && (
            <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={12} /> GPS Coordinates Present
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 6px' }}>
            <Search size={11} style={{ color: 'rgba(255,255,255,0.4)', marginRight: '4px' }} />
            <input
              type="text"
              placeholder="Search tags..."
              value={exifSearch}
              onChange={(e) => setExifSearch(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '10px',
                outline: 'none',
                width: '120px'
              }}
            />
          </div>
        </div>

        {!activeReport || filteredExifEntries.length === 0 ? (
          <div
            style={{
              padding: '28px 20px',
              textAlign: 'center',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '10px',
              border: '1px dashed rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.45)',
              fontSize: '12px',
            }}
          >
            {activeReport && activeReport.exif_entries.length > 0 
              ? `No tags match "${exifSearch}"`
              : '✨ No EXIF, GPS, or camera tags detected in this file.'}
          </div>
        ) : (
          <div
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
              overflow: 'hidden',
              background: 'rgba(0,0,0,0.25)',
            }}
          >
            {filteredExifEntries.map((entry, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '7px 12px',
                  borderBottom: idx < filteredExifEntries.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  fontSize: '11px',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                }}
              >
                <div style={{ width: '180px', color: '#7dd3fc', fontWeight: 700, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry.key}
                </div>
                <div style={{ flex: 1, color: '#f4f4f5', wordBreak: 'break-all' }}>
                  {entry.value}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9.5px', marginLeft: '12px', flexShrink: 0 }}>
                  {entry.category}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
