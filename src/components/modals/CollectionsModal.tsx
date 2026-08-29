import { useState, useRef, useEffect } from 'react';
import { X, Save, Play, Trash2, FolderOpen, Film } from 'lucide-react';
import type { VideoItem } from '../../types';
import { invoke } from '@tauri-apps/api/core';
import { toCosmoUrl, isTauri, safeSetLocalStorage } from '../../utils/videoUtils';
import { cleanCollectionsForPersistence } from '../../hooks/useWorkspacePersistence';

interface CollectionsModalProps {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  collections: Record<string, VideoItem[]>;
  setCollections: React.Dispatch<React.SetStateAction<Record<string, VideoItem[]>>>;
  addLog: (msg: string) => void;
  onClose: () => void;
}

/** Return a human-readable summary for what a saved collection contains. */
function collectionSummary(vids: VideoItem[]): { label: string; icon: 'folder' | 'film' } {
  const folderTiles = vids.filter(v => v.repeatMode === 'folder' || v.folderPath);
  const fileTiles   = vids.filter(v => !v.repeatMode?.includes('folder') && !v.folderPath);

  const parts: string[] = [];
  if (folderTiles.length === 1) {
    // Show the folder name itself
    const name = folderTiles[0].folderPath
      ? folderTiles[0].folderPath.split(/[\\/]/).pop()
      : folderTiles[0].title;
    parts.push(name || '1 folder');
  } else if (folderTiles.length > 1) {
    parts.push(`${folderTiles.length} folders`);
  }
  if (fileTiles.length > 0) parts.push(`${fileTiles.length} file${fileTiles.length !== 1 ? 's' : ''}`);
  if (parts.length === 0) parts.push('empty');

  const totalTiles = vids.length;
  const icon: 'folder' | 'film' = folderTiles.length > 0 ? 'folder' : 'film';
  return { label: `${totalTiles} tile${totalTiles !== 1 ? 's' : ''} · ${parts.join(', ')}`, icon };
}

export function CollectionsModal({
  videos, setVideos,
  collections, setCollections,
  addLog, onClose
}: CollectionsModalProps) {
  const [collectionName, setCollectionName] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const saveCollection = () => {
    const name = collectionName.trim();
    if (!name) return;
    console.log("[CollectionsModal] Saving collection", name, "with videos:", videos);
    setCollections(p => {
      const next = { ...p, [name]: videos };
      const cleaned = cleanCollectionsForPersistence(next);
      const dataStr = JSON.stringify(cleaned);
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-collections', data: dataStr }).catch(console.error);
      }
      localStorage.setItem('cosmo-collections', dataStr);
      return next;
    });
    setCollectionName('');
    addLog(`Saved Set: ${name}`);
  };

  const loadCollection = async (col: VideoItem[]) => {
    onClose();
    addLog('Loading workspace set...');
    console.log("[CollectionsModal] loadCollection called with:", col);

    let scannedItems = col;
    if (isTauri()) {
      scannedItems = await Promise.all(col.map(async v => {
        if ((v.repeatMode === 'folder' || v.folderPath) && v.folderPath) {
          try {
            const scanned = await invoke<{ name: string; url: string }[]>('get_folder_videos', {
              path: v.folderPath,
              mode: v.folderMode || 'all',
            });
            if (scanned && scanned.length > 0) {
              scanned.sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
              );
              const folderWithUrls = scanned.map(item => ({
                name: item.name,
                url: toCosmoUrl(item.url),
                path: item.url,
              }));
              return {
                ...v,
                folderFiles: folderWithUrls,
                url: toCosmoUrl(scanned[0].url),
                realPath: scanned[0].url,
                title: scanned[0].name,
                currentIdx: 0,
              };
            }
          } catch (err) {
            console.error(`Failed to scan collection folder: ${v.folderPath}`, err);
          }
        }
        return v;
      }));
    }

    console.log("[CollectionsModal] loadCollection final scanned items:", scannedItems);
    setVideos(scannedItems);
    addLog(`Loaded set: ${scannedItems.length} tiles ready.`);
  };

  const deleteCollection = (name: string) => {
    if (name === "Demo Symphony") return;
    setCollections(p => {
      const next = { ...p };
      delete next[name];
      const cleaned = cleanCollectionsForPersistence(next);
      const dataStr = JSON.stringify(cleaned);
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-collections', data: dataStr }).catch(console.error);
      }
      safeSetLocalStorage('cosmo-collections', dataStr);
      return next;
    });
  };

  const entries = Object.entries(collections);

  const mouseDownOnOverlay = useRef(false);

  return (
    <div 
      className="modal-overlay" 
      onMouseDown={(e) => {
        mouseDownOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnOverlay.current) {
          onClose();
        }
      }}
    >
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '440px' }}>
        <div className="modal-header">
          <h2>Workspace Sets</h2>
          <button onClick={onClose} className="premium-close-btn">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {/* Save current workspace */}
          <div className="collection-save">
            <input
              placeholder="Set name..."
              value={collectionName}
              onChange={e => setCollectionName(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter') saveCollection(); }}
            />
            <button onClick={saveCollection} className="save-btn" disabled={!collectionName.trim()}>
              <Save size={14} /> SAVE
            </button>
          </div>

          {/* List */}
          <div className="collection-list">
            {entries.length === 0 && (
              <p className="empty-msg" style={{ textAlign: 'center', opacity: 0.5, fontSize: '12px', padding: '20px' }}>
                No sets saved yet. Save the current workspace above.
              </p>
            )}
            {entries.map(([name, vids]) => {
              const { label, icon } = collectionSummary(vids);
              return (
                <div key={name} className="collection-item">
                  <div className="coll-info">
                    <span className="coll-name">{name}</span>
                    <span className="coll-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {icon === 'folder'
                        ? <FolderOpen size={10} style={{ opacity: 0.6 }} />
                        : <Film size={10} style={{ opacity: 0.6 }} />}
                      {label}
                    </span>
                  </div>
                  <div className="coll-actions">
                    <button onClick={() => loadCollection(vids)} className="coll-btn load" title="Load Set">
                      <Play size={12} fill="currentColor" />
                    </button>
                    {name !== "Demo Symphony" && (
                      <button onClick={() => deleteCollection(name)} className="coll-btn del" title="Delete Set">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
