import { useRef, useState, useEffect } from 'react';
import { 
  CheckCheck, 
  Plus, 
  Film, 
  Image as ImageIcon, 
  CheckSquare, 
  X, 
  ChevronDown 
} from 'lucide-react';

export interface BrowserBatchBarProps {
  selectedCount: number;
  totalFilteredCount: number;
  onAddSelected: () => void;
  onSelectAllInView: () => void;
  onSelectAllVideos: () => void;
  onSelectAllPictures: () => void;
  onClearSelection: () => void;
}

export function BrowserBatchBar({
  selectedCount,
  totalFilteredCount,
  onAddSelected,
  onSelectAllInView,
  onSelectAllVideos,
  onSelectAllPictures,
  onClearSelection
}: BrowserBatchBarProps) {
  const [showSelectMenu, setShowSelectMenu] = useState(false);
  const selectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (selectMenuRef.current && !selectMenuRef.current.contains(e.target as Node)) {
        setShowSelectMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="browser-selection-bar">
      <div className="browser-selection-info">
        <CheckCheck size={12} className="selection-icon" />
        <span className="selection-count">
          {selectedCount > 0 
            ? `${selectedCount} item${selectedCount > 1 ? 's' : ''} selected` 
            : `Select items to add`}
        </span>
      </div>

      <div className="browser-selection-actions">
        {selectedCount > 0 && (
          <button 
            className="browser-btn-add-selected"
            onClick={onAddSelected}
            title={`Add ${selectedCount} selected item(s) to workspace`}
          >
            <Plus size={11} />
            <span>Add Selected ({selectedCount})</span>
          </button>
        )}

        <div className="browser-select-menu-container" ref={selectMenuRef}>
          <button 
            className="browser-btn-select-menu"
            onClick={() => setShowSelectMenu(prev => !prev)}
            title="Batch Selection Options"
          >
            <span>Select</span>
            <ChevronDown size={10} />
          </button>

          {showSelectMenu && (
            <div className="browser-select-dropdown">
              <div 
                className="browser-select-item"
                onClick={() => { setShowSelectMenu(false); onSelectAllInView(); }}
              >
                <CheckSquare size={11} />
                <span>Select All in View ({totalFilteredCount})</span>
              </div>
              <div 
                className="browser-select-item"
                onClick={() => { setShowSelectMenu(false); onSelectAllVideos(); }}
              >
                <Film size={11} />
                <span>Select All Videos</span>
              </div>
              <div 
                className="browser-select-item"
                onClick={() => { setShowSelectMenu(false); onSelectAllPictures(); }}
              >
                <ImageIcon size={11} />
                <span>Select All Pictures</span>
              </div>
              {selectedCount > 0 && (
                <>
                  <div className="browser-select-divider" />
                  <div 
                    className="browser-select-item clear-item"
                    onClick={() => { setShowSelectMenu(false); onClearSelection(); }}
                  >
                    <X size={11} />
                    <span>Clear Selection</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {selectedCount > 0 && (
          <button 
            className="browser-btn-clear-selection"
            onClick={onClearSelection}
            title="Clear Selection"
          >
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
