import { useState } from 'react';
import { X, Save, Play, Trash2 } from 'lucide-react';
import type { VideoItem } from '../../types';

interface CollectionsModalProps {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  collections: Record<string, VideoItem[]>;
  setCollections: React.Dispatch<React.SetStateAction<Record<string, VideoItem[]>>>;
  addLog: (msg: string) => void;
  onClose: () => void;
}

export function CollectionsModal({
  videos, setVideos,
  collections, setCollections,
  addLog, onClose
}: CollectionsModalProps) {
  const [collectionName, setCollectionName] = useState('');

  const saveCollection = () => {
    if (!collectionName.trim()) return;
    setCollections(p => ({ ...p, [collectionName]: videos }));
    setCollectionName('');
    addLog(`Saved Set: ${collectionName}`);
  };

  const loadCollection = (col: VideoItem[]) => {
    setVideos(col);
    onClose();
    addLog('Loaded workspace set.');
  };

  const deleteCollection = (name: string) => {
    setCollections(p => {
      const n = { ...p };
      delete n[name];
      return n;
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '400px' }}>
        <div className="modal-header">
          <h2>Workspace Collections</h2>
          <button onClick={onClose} className="premium-close-btn">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="collection-save">
            <input
              placeholder="Set Name..."
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
            />
            <button onClick={saveCollection} className="save-btn">
              <Save size={14} /> SAVE
            </button>
          </div>
          <div className="collection-list">
            {Object.entries(collections).length === 0 && (
              <p className="empty-msg" style={{ textAlign: 'center', opacity: 0.5, fontSize: '12px', padding: '20px' }}>
                No sets saved yet.
              </p>
            )}
            {Object.entries(collections).map(([name, vids]) => (
              <div key={name} className="collection-item">
                <div className="coll-info">
                  <span className="coll-name">{name}</span>
                  <span className="coll-meta">{vids.length} units</span>
                </div>
                <div className="coll-actions">
                  <button onClick={() => loadCollection(vids)} className="coll-btn load" title="Load Set">
                    <Play size={12} fill="currentColor" />
                  </button>
                  <button onClick={() => deleteCollection(name)} className="coll-btn del" title="Delete Set">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
