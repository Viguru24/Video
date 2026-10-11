import React from 'react';
import { Smartphone, Download, Trash2, Loader2, X } from 'lucide-react';
import { getMediaIcon, formatFileSize } from './wifiShareUtils';

export interface RoomPhoneFile {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
}

interface PhoneUploadsTabProps {
  phoneFiles: RoomPhoneFile[];
  isImportingAll: boolean;
  importProgress: { current: number; total: number } | null;
  importError: string | null;
  importingFileIds: Set<string>;
  deletingFileIds: Set<string>;
  onImportAll: () => void;
  onClearAll: () => void;
  onDismissError: () => void;
  onImportSingle: (id: string, name: string) => void;
  onDeleteFile: (id: string, name: string) => void;
}

export const PhoneUploadsTab: React.FC<PhoneUploadsTabProps> = ({
  phoneFiles,
  isImportingAll,
  importProgress,
  importError,
  importingFileIds,
  deletingFileIds,
  onImportAll,
  onClearAll,
  onDismissError,
  onImportSingle,
  onDeleteFile
}) => {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(6, 44, 28, 0.3) 0%, rgba(16, 28, 20, 0.4) 100%)',
      border: '1px solid rgba(0, 255, 136, 0.25)',
      borderRadius: '10px',
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }}>
      {/* Phone Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#00ff88' }}>
            Incoming Files
          </span>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)' }}>
            ({phoneFiles.length})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {phoneFiles.length > 0 && (
            <>
              <button
                onClick={onImportAll}
                disabled={isImportingAll}
                style={{
                  background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                  border: 'none',
                  color: '#000000',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '9px',
                  fontWeight: 800,
                  cursor: isImportingAll ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  boxShadow: '0 2px 6px rgba(0, 255, 136, 0.25)'
                }}
                title="Import all phone files to grid"
              >
                {isImportingAll ? (
                  <>
                    <Loader2 size={9} className="spin" />
                    <span>Importing ({importProgress?.current}/{importProgress?.total})...</span>
                  </>
                ) : (
                  <>
                    <Download size={9} />
                    <span>Import All ({phoneFiles.length})</span>
                  </>
                )}
              </button>

              <button
                onClick={onClearAll}
                style={{
                  background: 'rgba(255, 77, 77, 0.12)',
                  border: '1px solid rgba(255, 77, 77, 0.25)',
                  color: '#ff6666',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  fontSize: '8.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
                title="Delete all phone uploads from room"
              >
                <Trash2 size={8} />
                <span>Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Import Error Banner */}
      {importError && (
        <div style={{
          background: 'rgba(255, 77, 77, 0.15)',
          border: '1px solid rgba(255, 77, 77, 0.4)',
          borderRadius: '6px',
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          fontSize: '9.5px',
          color: '#ff7b7b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>⚠️</span>
            <span>{importError}</span>
          </div>
          <button
            onClick={onDismissError}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              padding: '1px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Phone Files List */}
      <div style={{
        maxHeight: '160px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        background: 'rgba(0, 0, 0, 0.25)',
        borderRadius: '6px',
        padding: '4px'
      }}>
        {phoneFiles.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '65px', color: 'rgba(255,255,255,0.4)', fontSize: '9px', gap: '3px' }}>
            <Smartphone size={14} style={{ opacity: 0.4 }} />
            <span>No files uploaded from phone yet</span>
          </div>
        ) : (
          phoneFiles.map((file) => {
            const isImporting = importingFileIds.has(file.id);
            const isDeleting = deletingFileIds.has(file.id);

            return (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '3px 6px',
                  background: 'rgba(0, 255, 136, 0.05)',
                  border: '1px solid rgba(0, 255, 136, 0.12)',
                  borderRadius: '5px',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flex: 1 }}>
                  {getMediaIcon(file.name, file.mimeType)}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={file.name}>
                      {file.name}
                    </span>
                    <span style={{ fontSize: '8px', color: 'rgba(0, 255, 136, 0.8)', fontWeight: 600 }}>
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                  <button
                    onClick={() => onImportSingle(file.id, file.name)}
                    disabled={isImporting || isImportingAll}
                    style={{
                      background: '#00ff88',
                      color: '#000000',
                      border: 'none',
                      borderRadius: '3px',
                      padding: '2px 6px',
                      fontSize: '8.5px',
                      fontWeight: 800,
                      cursor: isImporting ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                  >
                    {isImporting ? <Loader2 size={8} className="spin" /> : <Download size={8} />}
                    <span>Import</span>
                  </button>

                  <button
                    onClick={() => onDeleteFile(file.id, file.name)}
                    disabled={isDeleting}
                    style={{
                      background: 'rgba(255, 77, 77, 0.1)',
                      border: '1px solid rgba(255, 77, 77, 0.2)',
                      color: '#ff6666',
                      borderRadius: '3px',
                      padding: '2px 4px',
                      fontSize: '8px',
                      cursor: isDeleting ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Delete upload"
                  >
                    <Trash2 size={8} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
