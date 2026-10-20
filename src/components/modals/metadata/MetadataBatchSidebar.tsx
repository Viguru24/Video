import React from 'react';
import { CheckSquare, Square } from 'lucide-react';
import type { VideoItem } from '../../../types';
import type { FileMetadataReport } from './MetadataTypes';
import { formatBytes } from './MetadataTypes';

interface MetadataBatchSidebarProps {
  filteredItemPaths: { path: string; item: VideoItem }[];
  itemPaths: { path: string; item: VideoItem }[];
  reports: Record<string, FileMetadataReport>;
  checkedPaths: Set<string>;
  activePath: string;
  stats: { total: number; comfyCount: number; exifCount: number; gpsCount: number };
  filterMode: 'all' | 'comfyui' | 'exif';
  setFilterMode: (mode: 'all' | 'comfyui' | 'exif') => void;
  toggleCheckAllVisible: () => void;
  toggleCheckPath: (path: string) => void;
  setActivePath: (path: string) => void;
}

export const MetadataBatchSidebar: React.FC<MetadataBatchSidebarProps> = ({
  filteredItemPaths,
  itemPaths,
  reports,
  checkedPaths,
  activePath,
  stats,
  filterMode,
  setFilterMode,
  toggleCheckAllVisible,
  toggleCheckPath,
  setActivePath,
}) => {
  return (
    <div
      style={{
        width: '320px',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0, 0, 0, 0.2)',
      }}
    >
      {/* Sidebar Controls */}
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={toggleCheckAllVisible}
            style={{
              background: 'none',
              border: 'none',
              color: '#e2e8f0',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: 0,
            }}
          >
            {filteredItemPaths.length > 0 &&
            filteredItemPaths.every(({ path }) => checkedPaths.has(path)) ? (
              <CheckSquare size={14} style={{ color: 'var(--accent, #00ff88)' }} />
            ) : (
              <Square size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
            )}
            <span>
              {checkedPaths.size} of {itemPaths.length} Checked
            </span>
          </button>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Click row to inspect</span>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(
            [
              { id: 'all', label: `All (${stats.total})` },
              { id: 'comfyui', label: `ComfyUI (${stats.comfyCount})` },
              { id: 'exif', label: `EXIF (${stats.exifCount})` },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterMode(f.id)}
              style={{
                flex: 1,
                padding: '4px 6px',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                background: filterMode === f.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                border:
                  filterMode === f.id
                    ? '1px solid rgba(255,255,255,0.25)'
                    : '1px solid rgba(255,255,255,0.06)',
                color: filterMode === f.id ? '#fff' : 'rgba(255,255,255,0.5)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable File Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {filteredItemPaths.map(({ path, item }) => {
          const rep = reports[path];
          const isChecked = checkedPaths.has(path);
          const isActive = activePath === path;
          const fileName = rep?.file_name || item.title || path.split(/[\\/]/).pop() || 'File';

          return (
            <div
              key={path}
              onClick={() => setActivePath(path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                marginBottom: '4px',
                borderRadius: '9px',
                cursor: 'pointer',
                background: isActive
                  ? 'rgba(0, 255, 136, 0.1)'
                  : isChecked
                  ? 'rgba(255, 255, 255, 0.03)'
                  : 'transparent',
                border: isActive
                  ? '1px solid rgba(0, 255, 136, 0.35)'
                  : '1px solid rgba(255, 255, 255, 0.04)',
                transition: 'all 0.12s ease',
              }}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCheckPath(path);
                }}
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '2px' }}
              >
                {isChecked ? (
                  <CheckSquare size={15} style={{ color: 'var(--accent, #00ff88)' }} />
                ) : (
                  <Square size={15} style={{ color: 'rgba(255,255,255,0.3)' }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '11.5px',
                    fontWeight: isActive ? 800 : 600,
                    color: isActive ? '#fff' : '#e2e8f0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={fileName}
                >
                  {fileName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                  {rep ? (
                    <>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                        {formatBytes(rep.file_size_bytes)}
                      </span>
                      {rep.has_comfyui && (
                        <span
                          style={{
                            fontSize: '8.5px',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(168, 85, 247, 0.22)',
                            color: '#d8b4fe',
                            border: '1px solid rgba(168, 85, 247, 0.4)',
                          }}
                        >
                          COMFYUI
                        </span>
                      )}
                      {rep.has_exif && (
                        <span
                          style={{
                            fontSize: '8.5px',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(56, 189, 248, 0.18)',
                            color: '#7dd3fc',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                          }}
                        >
                          EXIF
                        </span>
                      )}
                      {rep.has_gps && (
                        <span
                          style={{
                            fontSize: '8.5px',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(245, 158, 11, 0.22)',
                            color: '#fcd34d',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                          }}
                        >
                          GPS
                        </span>
                      )}
                      {!rep.has_comfyui && !rep.has_exif && (
                        <span
                          style={{
                            fontSize: '8.5px',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(0, 255, 136, 0.12)',
                            color: 'var(--accent, #00ff88)',
                          }}
                        >
                          CLEAN
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>Scanning...</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
