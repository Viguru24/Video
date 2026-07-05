import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useDragControls } from 'framer-motion';
import { X, Sliders, Save, Loader2, Check, AlertTriangle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { VideoItem, ColorFilters } from '../types';
import { DEFAULT_COLOR_FILTERS } from '../types';
import { isValidPictureExtension, toCosmoUrl } from '../utils/videoUtils';

interface ColorAdjustmentPanelProps {
  video: VideoItem;
  onUpdateVideo: (id: any, updates: any) => void;
  onClose: () => void;
  setVideos?: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addLog?: (msg: string) => void;
}

export function ColorAdjustmentPanel({ 
  video, 
  onUpdateVideo, 
  onClose,
  setVideos,
  addLog
}: ColorAdjustmentPanelProps) {
  const dragControls = useDragControls();
  const filters = video.colorFilters || DEFAULT_COLOR_FILTERS;
  const bodyRef = useRef<HTMLDivElement>(null);

  // Save states
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const updateFilter = (key: keyof ColorFilters, value: any) => {
    const updatedFilters = {
      ...filters,
      [key]: value
    };
    onUpdateVideo(video.id, { colorFilters: updatedFilters });
  };

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLInputElement;
      if (target && target.tagName === 'INPUT' && target.type === 'range') {
        const filterKey = target.getAttribute('data-filter') as keyof ColorFilters;
        if (!filterKey) return;

        e.preventDefault();
        e.stopPropagation();

        const min = parseFloat(target.min || '0');
        const max = parseFloat(target.max || '100');
        const step = parseFloat(target.step || '1');
        const isInt = target.getAttribute('data-integer') === 'true';

        const currentVal = (filters[filterKey] ?? 0) as number;
        const direction = e.deltaY < 0 ? 1 : -1;
        const newVal = Math.min(max, Math.max(min, currentVal + direction * step));
        const processedVal = isInt ? Math.round(newVal) : parseFloat(newVal.toFixed(2));
        updateFilter(filterKey, processedVal);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [filters]);

  const handleReset = () => {
    onUpdateVideo(video.id, {
      prevColorFilters: video.colorFilters,
      colorFilters: { ...DEFAULT_COLOR_FILTERS }
    });
  };

  const handleRedo = () => {
    if (video.prevColorFilters) {
      onUpdateVideo(video.id, {
        colorFilters: video.prevColorFilters,
        prevColorFilters: undefined
      });
    }
  };

  const isImage = video.realPath ? isValidPictureExtension(video.realPath) : false;

  const handleSaveToDisk = async (saveAsCopy: boolean) => {
    if (!video.realPath) return;

    setIsSaving(true);
    setSaveStatus('idle');
    setShowSaveOptions(false);

    if (addLog) {
      addLog(`Baking color adjustments to disk for [${video.title}] (${saveAsCopy ? 'Save As Copy' : 'Overwrite Original'})...`);
    }

    try {
      // Calculate final RGB values matching VideoCard SVG filter formulas
      const {
        brightness = 1.0,
        contrast = 1.0,
        hue = 0,
        saturation = 1.0,
        gamma = 1.0,
        temp = 0,
        tint = 0,
        red = 1.0,
        green = 1.0,
        blue = 1.0,
        alpha = 1.0,
        negative = false,
      } = filters;

      const rTemp = temp > 0 ? 1.0 + (temp / 100) * 0.3 : 1.0 + (temp / 100) * 0.15;
      const bTemp = temp < 0 ? 1.0 - (temp / 100) * 0.3 : 1.0 - (temp / 100) * 0.15;

      const gTint = 1.0 + (tint / 250);
      const rTint = 1.0 - (tint / 500);
      const bTint = 1.0 - (tint / 500);

      const finalR = red * rTemp * rTint;
      const finalG = green * gTint;
      const finalB = blue * bTemp * bTint;

      const resultPath = await invoke<string>('apply_color_adjustments_on_disk', {
        path: video.realPath,
        brightness,
        contrast,
        saturation,
        hue: parseFloat(hue.toString()),
        gamma,
        finalR,
        finalG,
        finalB,
        alpha,
        negative,
        isImage,
        saveAsCopy
      });

      setSaveStatus('success');
      if (addLog) {
        addLog(`Successfully saved adjusted media: ${resultPath}`);
      }

      if (saveAsCopy) {
        // Clear filters on the original card so it reverts to normal in the UI
        onUpdateVideo(video.id, {
          colorFilters: undefined,
          prevColorFilters: undefined
        });

        if (setVideos) {
          const separator = resultPath.includes('\\') ? '\\' : '/';
          const fileNameWithExt = resultPath.substring(resultPath.lastIndexOf(separator) + 1);
          const extIdx = fileNameWithExt.lastIndexOf('.');
          const cleanTitle = extIdx !== -1 ? fileNameWithExt.substring(0, extIdx) : fileNameWithExt;

          const newUnit: VideoItem = {
            id: `adj-${Date.now()}`,
            title: cleanTitle,
            url: toCosmoUrl(resultPath),
            realPath: resultPath,
            currentTime: video.currentTime || 0,
            playing: false,
            muted: video.muted,
            repeatMode: 'none',
            repeatCount: 0,
            cols: video.cols || 1
          };
          setVideos(prev => [...prev, newUnit]);
        }
      } else {
        // Overwrite: update the URL with cache-buster and reset UI colorFilters
        const cacheBuster = `t=${Date.now()}`;
        const cleanUrl = video.url.split('?')[0];
        const newUrl = `${cleanUrl}?${cacheBuster}`;

        onUpdateVideo(video.id, {
          colorFilters: undefined,
          prevColorFilters: undefined,
          url: newUrl
        });
      }

      setTimeout(() => {
        setSaveStatus('idle');
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error("Save adjustments failed:", err);
      setErrorMessage(err.toString());
      setSaveStatus('failed');
      if (addLog) {
        addLog(`Error saving color adjustments: ${err}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -20 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      className="color-adjustment-panel"
    >
      <div 
        className="panel-header" 
        onPointerDown={(e) => dragControls.start(e)}
      >
        <div className="panel-title-group">
          <Sliders size={12} className="panel-icon" />
          <span className="panel-title">COLOR ADJUSTMENT</span>
        </div>
        <button className="panel-close-btn" onClick={onClose} title="Close Panel" disabled={isSaving}>
          <X size={14} />
        </button>
      </div>

      <div className="panel-subtitle" title={video.title}>
        Target: {video.title}
      </div>

      <div className="panel-body scrollable-y" ref={bodyRef}>
        <div className="slider-section">
          <div className="section-label">EXPOSURE & CONTRAST</div>
          
          <div className="slider-row">
            <span className="slider-label">Brightness</span>
            <input 
              type="range" 
              min="0.0" 
              max="3.0" 
              step="0.05" 
              value={filters.brightness} 
              onChange={(e) => updateFilter('brightness', parseFloat(e.target.value))} 
              data-filter="brightness"
            />
            <span className="slider-value">{filters.brightness.toFixed(2)}x</span>
          </div>

          <div className="slider-row">
            <span className="slider-label">Contrast</span>
            <input 
              type="range" 
              min="0.0" 
              max="3.0" 
              step="0.05" 
              value={filters.contrast} 
              onChange={(e) => updateFilter('contrast', parseFloat(e.target.value))} 
              data-filter="contrast"
            />
            <span className="slider-value">{filters.contrast.toFixed(2)}x</span>
          </div>

          <div className="slider-row">
            <span className="slider-label">Hue</span>
            <input 
              type="range" 
              min="-180" 
              max="180" 
              step="1" 
              value={filters.hue} 
              onChange={(e) => updateFilter('hue', parseInt(e.target.value))} 
              data-filter="hue"
              data-integer="true"
            />
            <span className="slider-value">{filters.hue}°</span>
          </div>

          <div className="slider-row">
            <span className="slider-label">Saturation</span>
            <input 
              type="range" 
              min="0.0" 
              max="3.0" 
              step="0.05" 
              value={filters.saturation} 
              onChange={(e) => updateFilter('saturation', parseFloat(e.target.value))} 
              data-filter="saturation"
            />
            <span className="slider-value">{filters.saturation.toFixed(2)}x</span>
          </div>

          <div className="slider-row">
            <span className="slider-label">Gamma</span>
            <input 
              type="range" 
              min="0.1" 
              max="3.0" 
              step="0.05" 
              value={filters.gamma} 
              onChange={(e) => updateFilter('gamma', parseFloat(e.target.value))} 
              data-filter="gamma"
            />
            <span className="slider-value">{filters.gamma.toFixed(2)}</span>
          </div>
        </div>

        <div className="slider-section">
          <div className="section-label">TEMPERATURE & CHANNELS</div>

          <div className="slider-row">
            <span className="slider-label">Temp</span>
            <input 
              type="range" 
              min="-100" 
              max="100" 
              step="1" 
              value={filters.temp} 
              onChange={(e) => updateFilter('temp', parseInt(e.target.value))} 
              className="temp-slider"
              data-filter="temp"
              data-integer="true"
            />
            <span className="slider-value">{filters.temp > 0 ? `+${filters.temp}` : filters.temp}</span>
          </div>

          <div className="slider-row">
            <span className="slider-label">Tint</span>
            <input 
              type="range" 
              min="-100" 
              max="100" 
              step="1" 
              value={filters.tint} 
              onChange={(e) => updateFilter('tint', parseInt(e.target.value))} 
              className="tint-slider"
              data-filter="tint"
              data-integer="true"
            />
            <span className="slider-value">{filters.tint > 0 ? `+${filters.tint}` : filters.tint}</span>
          </div>

          <div className="slider-row">
            <span className="slider-label">Red Gain</span>
            <input 
              type="range" 
              min="0.0" 
              max="2.0" 
              step="0.05" 
              value={filters.red} 
              onChange={(e) => updateFilter('red', parseFloat(e.target.value))} 
              className="red-slider"
              data-filter="red"
            />
            <span className="slider-value">{filters.red.toFixed(2)}</span>
          </div>

          <div className="slider-row">
            <span className="slider-label">Green Gain</span>
            <input 
              type="range" 
              min="0.0" 
              max="2.0" 
              step="0.05" 
              value={filters.green} 
              onChange={(e) => updateFilter('green', parseFloat(e.target.value))} 
              className="green-slider"
              data-filter="green"
            />
            <span className="slider-value">{filters.green.toFixed(2)}</span>
          </div>

          <div className="slider-row">
            <span className="slider-label">Blue Gain</span>
            <input 
              type="range" 
              min="0.0" 
              max="2.0" 
              step="0.05" 
              value={filters.blue} 
              onChange={(e) => updateFilter('blue', parseFloat(e.target.value))} 
              className="blue-slider"
              data-filter="blue"
            />
            <span className="slider-value">{filters.blue.toFixed(2)}</span>
          </div>

          <div className="slider-row">
            <span className="slider-label">Opacity</span>
            <input 
              type="range" 
              min="0.0" 
              max="1.0" 
              step="0.05" 
              value={filters.alpha} 
              onChange={(e) => updateFilter('alpha', parseFloat(e.target.value))} 
              data-filter="alpha"
            />
            <span className="slider-value">{Math.round(filters.alpha * 100)}%</span>
          </div>
        </div>

        <div className="checkbox-section">
          <label className="checkbox-label">
            <input 
              type="checkbox" 
              checked={filters.negative} 
              onChange={(e) => updateFilter('negative', e.target.checked)} 
            />
            <span>Negative image</span>
          </label>
        </div>

        <div className="submenu-actions">
          <button onClick={handleReset} title="Reset all adjustments" disabled={isSaving}>Reset</button>
          <button onClick={handleRedo} disabled={!video.prevColorFilters || isSaving} title="Restore previous adjustments">Redo</button>
        </div>

        <div className="save-action-container" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button 
            className="save-disk-btn" 
            onClick={onClose}
            title="Keep adjustments in the current workspace session"
            style={{ background: 'rgba(255, 255, 255, 0.08)', flex: 1 }}
          >
            <span>Apply</span>
          </button>
          <button 
            className="save-disk-btn" 
            onClick={() => setShowSaveOptions(true)}
            title={video.realPath ? "Bake adjustments directly to the media file on disk" : "Cannot save to disk because the native file path was not resolved"}
            disabled={isSaving || !video.realPath}
            style={{ flex: 1.5 }}
          >
            <Save size={12} />
            <span>Save to Disk</span>
          </button>
        </div>
      </div>

      {/* Confirmation Overlay */}
      {showSaveOptions && (
        <div className="panel-overlay save-options-overlay">
          <AlertTriangle size={24} className="warning-icon animate-pulse-gold" />
          <h4 className="overlay-title">BAKE FILTERS TO DISK</h4>
          <p className="overlay-text">
            This will permanently write the current color parameters to the file on disk. 
            {isImage ? " Image baking is instant." : " Video baking requires re-encoding and will take a few seconds."}
          </p>
          <div className="overlay-buttons">
            <button className="btn-copy" onClick={() => handleSaveToDisk(true)}>
              Save as Copy
            </button>
            <button className="btn-overwrite" onClick={() => handleSaveToDisk(false)}>
              Overwrite Original
            </button>
            <button className="btn-cancel" onClick={() => setShowSaveOptions(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Loading/Processing Overlay */}
      {isSaving && (
        <div className="panel-overlay loading-overlay">
          <Loader2 size={32} className="panel-spinner" />
          <h4 className="overlay-title">PROCESSING FILTERS</h4>
          <p className="overlay-text">
            {isImage ? "Writing updated pixels to image file..." : "Re-encoding video stream with color adjustments... Please wait."}
          </p>
        </div>
      )}

      {/* Success State Overlay */}
      {saveStatus === 'success' && (
        <div className="panel-overlay success-overlay">
          <Check size={32} className="success-icon" />
          <h4 className="overlay-title">SUCCESSFULLY SAVED</h4>
          <p className="overlay-text">Adjusted media has been written successfully.</p>
        </div>
      )}

      {/* Failure State Overlay */}
      {saveStatus === 'failed' && (
        <div className="panel-overlay failure-overlay">
          <AlertTriangle size={32} className="danger-icon" />
          <h4 className="overlay-title">SAVE FAILED</h4>
          <p className="overlay-text">{errorMessage}</p>
          <button className="btn-close-overlay" onClick={() => setSaveStatus('idle')}>
            Close
          </button>
        </div>
      )}
    </motion.div>,
    document.body
  );
}
