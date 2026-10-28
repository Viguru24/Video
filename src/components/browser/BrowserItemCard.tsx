import React, { useState, useEffect, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Folder, File, Plus, Image as ImageIcon, Film, Check } from 'lucide-react';
import { toCosmoUrl, isValidMediaExtension, isTauri } from '../../utils/videoUtils';

export interface BrowserItem {
  name: string;
  path: string;
  is_dir: boolean;
  is_media: boolean;
}

export function VideoPreview({ path, src, isHovered }: { path: string; src?: string; isHovered: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState(() => {
    if (isTauri()) {
      try {
        return convertFileSrc(path);
      } catch {}
    }
    return src || toCosmoUrl(path);
  });
  const [triedFallback, setTriedFallback] = useState(false);

  useEffect(() => {
    if (isTauri()) {
      try {
        setVideoSrc(convertFileSrc(path));
      } catch {
        setVideoSrc(toCosmoUrl(path));
      }
    } else {
      setVideoSrc(src || toCosmoUrl(path));
    }
    setTriedFallback(false);
  }, [path, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHovered) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isHovered]);

  const handleLoadedData = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    try {
      if (video.currentTime < 0.5) {
        const targetTime = Math.min(1.0, (video.duration || 2) / 2);
        video.currentTime = targetTime;
      }
    } catch {}
  };

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setRetryCount(0);
  }, [path, src]);

  const handleError = () => {
    if (retryCount < 2) {
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);
      setTimeout(() => {
        const base = toCosmoUrl(path);
        const sep = base.includes('?') ? '&' : '?';
        setVideoSrc(`${base}${sep}_retry=${Date.now()}`);
      }, nextRetry * 500);
      return;
    }

    if (!triedFallback) {
      setTriedFallback(true);
      if (videoSrc.includes('asset.localhost')) {
        setVideoSrc(`http://cosmo.localhost/${encodeURIComponent(path)}`);
      } else if (isTauri()) {
        try {
          setVideoSrc(convertFileSrc(path));
        } catch {
          setVideoSrc(`cosmo://localhost/${encodeURIComponent(path)}`);
        }
      }
    }
  };

  const finalSrc = videoSrc.includes('#') ? videoSrc : `${videoSrc}#t=1.0`;

  return (
    <video 
      ref={videoRef}
      src={finalSrc} 
      className="file-thumb" 
      muted
      playsInline
      loop
      preload="metadata"
      onLoadedData={handleLoadedData}
      onError={handleError}
      style={{ objectFit: 'cover', width: '100%', height: '100%', display: 'block' }}
    />
  );
}

export function ImageThumbnail({ path, name }: { path: string; name: string }) {
  const ext = path.split('.').pop()?.toUpperCase() || 'IMG';
  const isRaw = ['DNG', 'CR2', 'CR3', 'NEF', 'ARW', 'RAW', 'ORF', 'RW2', 'PEF'].includes(ext);

  const getInitialSrc = () => {
    if (isRaw) {
      return `http://cosmo.localhost/${encodeURIComponent(path)}?thumb=1`;
    }
    if (isTauri()) {
      try {
        return convertFileSrc(path);
      } catch {}
    }
    return toCosmoUrl(path);
  };

  const [imgSrc, setImgSrc] = useState(getInitialSrc);
  const [hasError, setHasError] = useState(false);
  const [fallbackStage, setFallbackStage] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setImgSrc(getInitialSrc());
    setHasError(false);
    setFallbackStage(0);
    setIsLoaded(false);
    setRetryCount(0);
  }, [path]);

  const handleError = () => {
    if (fallbackStage === 0) {
      setFallbackStage(1);
      setImgSrc(`http://cosmo.localhost/${encodeURIComponent(path)}?thumb=1`);
      return;
    }

    if (fallbackStage === 1) {
      setFallbackStage(2);
      setImgSrc(`cosmo://localhost/${encodeURIComponent(path)}?thumb=1`);
      return;
    }

    if (retryCount < 2) {
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);
      setTimeout(() => {
        const base = imgSrc.split('?')[0];
        setImgSrc(`${base}?thumb=1&_r=${Date.now()}`);
      }, nextRetry * 300);
      return;
    }

    setHasError(true);
  };

  if (hasError) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        background: 'radial-gradient(circle at center, rgba(30, 30, 48, 0.95), rgba(12, 12, 18, 0.98))',
        color: 'rgba(255, 255, 255, 0.8)'
      }}>
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'rgba(0, 255, 136, 0.12)',
          border: '1px solid rgba(0, 255, 136, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent, #00ff88)'
        }}>
          <ImageIcon size={13} />
        </div>
        <span style={{
          fontSize: '8px',
          fontWeight: 800,
          letterSpacing: '0.6px',
          color: 'var(--accent, #00ff88)',
          background: 'rgba(0, 255, 136, 0.08)',
          padding: '1px 5px',
          borderRadius: '3px',
          textTransform: 'uppercase'
        }}>
          {ext}
        </span>
      </div>
    );
  }

  return (
    <img 
      src={imgSrc} 
      className="file-thumb" 
      alt={name}
      onLoad={() => setIsLoaded(true)}
      onError={handleError}
      style={{
        objectFit: 'cover',
        width: '100%',
        height: '100%',
        display: 'block',
        opacity: isLoaded ? 1 : 0.8,
        transition: 'opacity 0.2s ease'
      }}
    />
  );
}

export function BrowserItemCard({ 
  item, 
  index,
  layoutMode, 
  isSelected = false,
  hasSelection = false,
  onToggleSelect,
  onAddFile, 
  onDragStart, 
  onDoubleClick 
}: { 
  item: BrowserItem; 
  index: number;
  layoutMode: 'grid' | 'list';
  isSelected?: boolean;
  hasSelection?: boolean;
  onToggleSelect?: (path: string, e: React.MouseEvent) => void;
  onAddFile: (path: string) => void;
  onDragStart: (e: React.DragEvent, path: string) => void;
  onDoubleClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isVideo = !item.is_dir && isValidMediaExtension(item.path, 'video');
  const isPicture = !item.is_dir && isValidMediaExtension(item.path, 'picture');

  if (item.is_dir) {
    return (
      <div 
        className={`browser-item-card is-dir layout-${layoutMode}`}
        onDoubleClick={onDoubleClick}
      >
        <div className="dir-item-content">
          <Folder size={14} className="dir-icon" />
          <span className="dir-name" title={item.name}>{item.name}</span>
        </div>
      </div>
    );
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || hasSelection) {
      e.stopPropagation();
      onToggleSelect?.(item.path, e);
    }
  };

  return (
    <div 
      className={`browser-item-card is-file layout-${layoutMode} ${isSelected ? 'is-selected' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, item.path)}
      onClick={handleCardClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {layoutMode === 'list' ? (
        <div className="file-item-content-list">
          <button
            type="button"
            className={`browser-item-checkbox-list ${isSelected ? 'selected' : ''} ${hasSelection ? 'has-selection' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(item.path, e);
            }}
            title={isSelected ? "Deselect item" : "Select item"}
          >
            {isSelected && <Check size={10} strokeWidth={3} />}
          </button>
          {isVideo ? (
            <Film size={13} className="file-icon video-icon" style={{ color: 'var(--accent, #00ff88)' }} />
          ) : isPicture ? (
            <ImageIcon size={13} className="file-icon pic-icon" style={{ color: '#38bdf8' }} />
          ) : (
            <File size={13} className="file-icon" />
          )}
          <span className="file-name" title={item.name}>{item.name}</span>
          <button 
            className="add-item-badge-btn-list" 
            onClick={(e) => {
              e.stopPropagation();
              onAddFile(item.path);
            }}
            title="Add to grid workspace"
          >
            <Plus size={10} />
          </button>
        </div>
      ) : (
        <div className="file-item-content">
          <div className="file-thumbnail-container">
            {/* Selection Checkbox */}
            <button
              type="button"
              className={`browser-item-checkbox ${isSelected ? 'selected' : ''} ${hasSelection ? 'has-selection' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.(item.path, e);
              }}
              title={isSelected ? "Deselect item" : "Select item"}
            >
              {isSelected && <Check size={10} strokeWidth={3} />}
            </button>

            {/* Media Type Corner Badge */}
            <div className={`browser-item-type-badge ${isVideo ? 'badge-video' : 'badge-picture'}`}>
              {isVideo ? <Film size={9} /> : <ImageIcon size={9} />}
            </div>

            {isVideo ? (
              <VideoPreview path={item.path} src={toCosmoUrl(item.path)} isHovered={isHovered} />
            ) : (
              <ImageThumbnail path={item.path} name={item.name} />
            )}
            
            <div className="thumb-hover-overlay">
              <button 
                className="add-item-badge-btn" 
                onClick={(e) => {
                  e.stopPropagation();
                  onAddFile(item.path);
                }}
                title="Add to grid workspace"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
          <span className="file-name" title={item.name}>{item.name}</span>
        </div>
      )}
    </div>
  );
}
