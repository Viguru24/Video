import React from 'react';
import { Monitor, Trash2 } from 'lucide-react';
import { getMediaIcon, formatFileSize } from './wifiShareUtils';

export interface RoomPcFile {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
}

interface PcFilesTabProps {
  pcFiles: RoomPcFile[];
  deletingFileIds: Set<string>;
  onClearAll: () => void;
  onDeleteFile: (id: string, name: string) => void;
}

export const PcFilesTab: React.FC<PcFilesTabProps> = ({
  pcFiles,
  deletingFileIds,
  onClearAll,
  onDeleteFile
}) => {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(0, 119, 182, 0.1) 0%, rgba(13, 27, 42, 0.4) 100%)',
      border: '1px solid rgba(0, 210, 255, 0.25)',
      borderRadius: '10px',
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }}>
      {/* PC Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#00d2ff' }}>
            Shared with Phone
          </span>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)' }}>
            ({pcFiles.length})
          </span>
        </div>

        {pcFiles.length > 0 && (
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
            title="Clear all PC files from room"
          >
            <Trash2 size={8} />
            <span>Clear All</span>
          </button>
        )}
      </div>

      {/* PC Files List */}
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
        {pcFiles.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '65px', color: 'rgba(255,255,255,0.4)', fontSize: '9px', gap: '3px' }}>
            <Monitor size={14} style={{ opacity: 0.4 }} />
            <span>No files currently shared from PC</span>
          </div>
        ) : (
          pcFiles.map((file) => {
            const isDeleting = deletingFileIds.has(file.id);
            return (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '3px 6px',
                  background: 'rgba(0, 210, 255, 0.05)',
                  border: '1px solid rgba(0, 210, 255, 0.12)',
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
                    <span style={{ fontSize: '8px', color: 'rgba(0, 210, 255, 0.8)', fontWeight: 600 }}>
                      {formatFileSize(file.size)} • Ready for phone
                    </span>
                  </div>
                </div>

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
                  title="Remove from room"
                >
                  <Trash2 size={8} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
