import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  X, Play, Pause, Volume2, VolumeX,
  Layers, ChevronLeft, ChevronRight, Plus, 
  Trash2, Maximize2, Sparkles, FileVideo, Camera, Printer
} from 'lucide-react';
import type { VideoItem, CollageItem, CollageConfig } from '../types';
import { isValidPictureExtension } from '../utils/videoUtils';

interface CollageWorkspaceProps {
  videos: VideoItem[]; // active grid files
  collageItems: CollageItem[];
  setCollageItems: React.Dispatch<React.SetStateAction<CollageItem[]>>;
  collageConfig: CollageConfig;
  setCollageConfig: (cfg: CollageConfig) => void;
  onDeepFocus: (id: string) => void;
  addLog: (msg: string) => void;
}

const BACKGROUND_PRESETS = [
  { name: 'Void Black',      swatch: '#09090e',                                                                         value: '#09090e' },
  { name: 'Neon Cyberpunk',  swatch: 'linear-gradient(135deg, #4a1fa8 0%, #9b06b4 100%)',                               value: 'linear-gradient(135deg, #0d081b 0%, #2a0845 50%, #05020c 100%)' },
  { name: 'Electric Cobalt', swatch: 'linear-gradient(135deg, #0a3cff 0%, #00c8ff 100%)',                               value: 'linear-gradient(135deg, #04082a 0%, #071840 100%)' },
  { name: 'Crimson Night',   swatch: 'linear-gradient(135deg, #c0152a 0%, #ff6060 100%)',                               value: 'linear-gradient(135deg, #1f0408 0%, #3b0a10 100%)' },
  { name: 'Acid Emerald',    swatch: 'linear-gradient(135deg, #00b84a 0%, #00ff99 100%)',                               value: 'linear-gradient(135deg, #031208 0%, #062a12 100%)' },
  { name: 'Sunset Gold',     swatch: 'linear-gradient(135deg, #ff8800 0%, #ffdd00 100%)',                               value: 'linear-gradient(135deg, #1a0e00 0%, #2e1800 100%)' },
  { name: 'Arctic White',    swatch: 'linear-gradient(135deg, #e8f0ff 0%, #ffffff 100%)',                               value: 'linear-gradient(135deg, #d0daf0 0%, #eef3ff 100%)' },
  { name: 'Sleek Charcoal',  swatch: 'linear-gradient(135deg, #2a2a32 0%, #3a3a46 100%)',                               value: '#1e1e26' },
];

export function CollageWorkspace({
  videos,
  collageItems,
  setCollageItems,
  collageConfig,
  setCollageConfig,
  onDeepFocus,
  addLog
}: CollageWorkspaceProps) {
  const [showShelf, setShowShelf] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Dragging, resizing and rotation state trackers
  const [activeAction, setActiveAction] = useState<{
    itemId: string;
    type: 'drag' | 'resize' | 'rotate';
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
    startRotation: number;
  } | null>(null);

  // Add item from the side tray/shelf
  const handleAddItem = (video: VideoItem) => {
    const isImg = isValidPictureExtension(video.realPath || '');
    
    // Determine center of canvas or random spawn position
    let spawnX = 150;
    let spawnY = 150;
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      spawnX = (rect.width / 2) - 160 + (Math.random() * 60 - 30);
      spawnY = (rect.height / 2) - 120 + (Math.random() * 60 - 30);
    }

    const newItem: CollageItem = {
      id: `collage-${video.id}-${Date.now()}`,
      mediaId: video.id,
      realPath: video.realPath || '',
      url: video.url,
      title: video.title,
      isImage: isImg,
      x: spawnX,
      y: spawnY,
      width: 320,
      height: 240,
      rotation: 0,
      zIndex: collageItems.length + 1,
      playing: true,
      muted: true
    };

    setCollageItems(prev => [...prev, newItem]);
    addLog(`COLLAGE: Added "${video.title}" to canvas`);
  };

  // Drag, resize, rotate pointer move handlers
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!activeAction || !canvasRef.current) return;
      e.preventDefault();

      const canvasRect = canvasRef.current.getBoundingClientRect();
      const item = collageItems.find(x => x.id === activeAction.itemId);
      if (!item) return;

      if (activeAction.type === 'drag') {
        const dx = e.clientX - activeAction.startX;
        const dy = e.clientY - activeAction.startY;
        
        let newX = activeAction.startLeft + dx;
        let newY = activeAction.startTop + dy;

        // Keep item partially within canvas bounds
        newX = Math.max(-item.width + 50, Math.min(canvasRect.width - 50, newX));
        newY = Math.max(-item.height + 50, Math.min(canvasRect.height - 50, newY));

        setCollageItems(prev => prev.map(x => x.id === item.id ? { ...x, x: newX, y: newY } : x));
      } 
      else if (activeAction.type === 'resize') {
        const dx = e.clientX - activeAction.startX;
        const dy = e.clientY - activeAction.startY;
        
        // Calculate new dimensions rotating correct dx/dy according to current angle if necessary, 
        // but simple linear size change relative to rotation is standard and works nicely.
        const newWidth = Math.max(120, activeAction.startWidth + dx);
        const newHeight = Math.max(90, activeAction.startHeight + dy);

        setCollageItems(prev => prev.map(x => x.id === item.id ? { ...x, width: newWidth, height: newHeight } : x));
      } 
      else if (activeAction.type === 'rotate') {
        // Find center of item in page space coordinates
        const itemCenterX = canvasRect.left + item.x + item.width / 2;
        const itemCenterY = canvasRect.top + item.y + item.height / 2;

        const rads = Math.atan2(e.clientY - itemCenterY, e.clientX - itemCenterX);
        let degrees = rads * (180 / Math.PI) + 90; // Offset rotation to point topwards
        if (degrees < 0) degrees += 360;

        // Snapping: hold Shift to snap to nearest 15 degrees
        if (e.shiftKey) {
          degrees = Math.round(degrees / 15) * 15;
        }

        setCollageItems(prev => prev.map(x => x.id === item.id ? { ...x, rotation: degrees } : x));
      }
    };

    const handlePointerUp = () => {
      setActiveAction(null);
    };

    if (activeAction) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [activeAction, collageItems]);

  // Bring to Front (increases z-index to maximum + 1)
  const bringToFront = (id: string) => {
    setCollageItems(prev => {
      const maxZ = prev.reduce((max, item) => item.zIndex > max ? item.zIndex : max, 0);
      return prev.map(x => x.id === id ? { ...x, zIndex: maxZ + 1 } : x);
    });
  };

  // Send to Back (decreases z-index to minimum - 1)
  const sendToBack = (id: string) => {
    setCollageItems(prev => {
      const minZ = prev.reduce((min, item) => item.zIndex < min ? item.zIndex : min, 999);
      const targetZ = Math.max(1, minZ - 1);
      return prev.map(x => x.id === id ? { ...x, zIndex: targetZ } : x);
    });
  };

  // Remove element from canvas
  const handleRemoveItem = (id: string) => {
    setCollageItems(prev => prev.filter(x => x.id !== id));
  };

  // Trigger sync play/pause
  const handleSyncPlayState = (playing: boolean) => {
    setCollageItems(prev => prev.map(x => ({ ...x, playing })));
    addLog(`COLLAGE: Playback synchronization: ${playing ? 'PLAY' : 'PAUSE'}`);
  };

  // Trigger sync mute/unmute
  const handleSyncMuteState = (muted: boolean) => {
    setCollageItems(prev => prev.map(x => ({ ...x, muted })));
    addLog(`COLLAGE: Audio synchronization: ${muted ? 'MUTED' : 'UNMUTED'}`);
  };

  // ── EXPORT: draw all items onto an off-screen canvas and save as PNG ──
  const handleExportPng = async () => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const W = Math.round(rect.width);
    const H = Math.round(rect.height);

    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    // Fill background
    const bg = collageConfig.backgroundValue;
    if (bg.startsWith('linear-gradient')) {
      // Parse a simple two-stop gradient for export
      const match = bg.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g);
      if (match && match.length >= 2) {
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, match[0]);
        grad.addColorStop(1, match[match.length - 1]);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = '#09090e';
      }
    } else {
      ctx.fillStyle = bg;
    }
    ctx.fillRect(0, 0, W, H);

    // Draw each image item (videos are skipped — browser security prevents cross-origin canvas reads)
    const sortedItems = [...collageItems].sort((a, b) => a.zIndex - b.zIndex);
    for (const item of sortedItems) {
      if (!item.isImage) continue; // can't taint canvas with video
      try {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.save();
            const cx = item.x + item.width / 2;
            const cy = item.y + item.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate((item.rotation * Math.PI) / 180);
            ctx.drawImage(img, -item.width / 2, -item.height / 2, item.width, item.height);
            ctx.restore();
            resolve();
          };
          img.onerror = () => resolve();
          img.src = item.url;
        });
      } catch { /* skip tainted items */ }
    }

    const dataUrl = offscreen.toDataURL('image/png');
    const fileName = `Cosmo_Collage_${Date.now()}.png`;
    try {
      const savedPath = await invoke<string>('save_snapshot', {
        base64Data: dataUrl,
        fileName,
        customDir: null
      });
      addLog(`COLLAGE EXPORT: Saved → ${savedPath}`);
    } catch (e) {
      addLog(`COLLAGE EXPORT ERROR: ${e}`);
    }
  };

  // ── PRINT: open browser print dialog focused on the canvas ──
  const handlePrint = () => {
    window.print();
    addLog('COLLAGE: Print dialog opened');
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#09090c', overflow: 'hidden', position: 'relative' }}>
      
      {/* Side Media Shelf (Collapsible Tray) */}
      <div 
        style={{
          width: showShelf ? '280px' : '0px',
          background: 'rgba(12, 12, 16, 0.95)',
          backdropFilter: 'blur(16px)',
          borderRight: showShelf ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
          zIndex: 10
        }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', color: '#fff' }}>Grid Tiles</h3>
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>CLICK TO DROP ON CANVAS</span>
          </div>
          <button 
            className="sidebar-close-btn"
            onClick={() => setShowShelf(false)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Media List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }} className="video-scroll">
          {videos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
              No tiles available. Ingest files in the Media Grid first.
            </div>
          ) : (
            videos.map(v => {
              const isImg = isValidPictureExtension(v.realPath || '');
              return (
                <div 
                  key={v.id}
                  onClick={() => handleAddItem(v)}
                  className="premium-glass"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.02)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                  }}
                >
                  <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {isImg ? (
                      <img src={v.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    ) : (
                      <FileVideo size={16} style={{ color: 'var(--accent, #00ff88)' }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '11px', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {v.title}
                    </span>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {isImg ? 'IMAGE' : 'VIDEO'}
                    </span>
                  </div>
                  <Plus size={14} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Workspace Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        
        {/* Canvas Toolbar Controls */}
        <div 
          style={{
            height: '64px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(10, 10, 12, 0.6)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            zIndex: 9,
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {!showShelf && (
              <button
                onClick={() => setShowShelf(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  height: '30px',
                  padding: '0 12px',
                  borderRadius: '15px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                  marginRight: '4px'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.borderColor = 'var(--accent, #00ff88)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                }}
              >
                <ChevronRight size={12} />
                <span style={{ fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.5px' }}>TILES SHELF</span>
              </button>
            )}
            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 900, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-primary, #fff)' }}>
              Collage Canvas
            </h2>
            
            {/* Sync Controls */}
            <div style={{ display: 'flex', gap: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '18px', padding: '3px' }}>
              <button 
                onClick={() => handleSyncPlayState(true)}
                style={{ height: '26px', padding: '0 12px', border: 'none', background: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              >
                <Play size={10} fill="currentColor" /> PLAY ALL
              </button>
              <button 
                onClick={() => handleSyncPlayState(false)}
                style={{ height: '26px', padding: '0 12px', border: 'none', background: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              >
                <Pause size={10} fill="currentColor" /> PAUSE ALL
              </button>
              <button 
                onClick={() => handleSyncMuteState(false)}
                style={{ height: '26px', padding: '0 12px', border: 'none', background: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              >
                <Volume2 size={10} /> UNMUTE ALL
              </button>
              <button 
                onClick={() => handleSyncMuteState(true)}
                style={{ height: '26px', padding: '0 12px', border: 'none', background: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              >
                <VolumeX size={10} /> MUTE ALL
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Background Presets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 800 }}>BG:</span>
              <div style={{ display: 'flex', gap: '5px' }}>
                {BACKGROUND_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCollageConfig({ backgroundType: 'gradient', backgroundValue: preset.value })}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: preset.swatch,
                      border: collageConfig.backgroundValue === preset.value
                        ? '2px solid #fff'
                        : '1.5px solid rgba(255,255,255,0.25)',
                      cursor: 'pointer',
                      boxShadow: collageConfig.backgroundValue === preset.value
                        ? '0 0 10px rgba(255,255,255,0.5)'
                        : '0 2px 6px rgba(0,0,0,0.6)',
                      transition: 'transform 0.12s, box-shadow 0.12s',
                      flexShrink: 0
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.25)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(255,255,255,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = collageConfig.backgroundValue === preset.value ? '0 0 10px rgba(255,255,255,0.5)' : '0 2px 6px rgba(0,0,0,0.6)'; }}
                    title={preset.name}
                  />
                ))}
              </div>
            </div>

            {/* Export PNG */}
            <button
              onClick={handleExportPng}
              style={{
                height: '30px', padding: '0 12px', borderRadius: '15px',
                background: 'rgba(0, 200, 120, 0.12)', border: '1px solid rgba(0, 200, 120, 0.35)',
                color: '#00e88a', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,200,120,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,200,120,0.12)'}
              title="Save collage as PNG to Cosmo_Snapshots folder"
            >
              <Camera size={12} /> EXPORT PNG
            </button>

            {/* Print */}
            <button
              onClick={handlePrint}
              style={{
                height: '30px', padding: '0 12px', borderRadius: '15px',
                background: 'rgba(120, 160, 255, 0.12)', border: '1px solid rgba(120, 160, 255, 0.35)',
                color: '#8ab0ff', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(120,160,255,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(120,160,255,0.12)'}
              title="Open print dialog"
            >
              <Printer size={12} /> PRINT
            </button>

            {/* Clear All */}
            <button
              onClick={() => {
                if (window.confirm("PROTOCOL: CLEAR CANVAS\n\nRemove all media elements from the collage canvas?")) {
                  setCollageItems([]);
                  addLog("COLLAGE: Cleared workspace canvas");
                }
              }}
              style={{
                height: '30px',
                padding: '0 12px',
                borderRadius: '15px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '10px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'}
            >
              <Trash2 size={12} /> CLEAR CANVAS
            </button>
          </div>
        </div>

        {/* DRAGGABLE CANVAS CONTAINER */}
        <div 
          ref={canvasRef}
          style={{
            flex: 1,
            position: 'relative',
            background: collageConfig.backgroundValue,
            overflow: 'hidden'
          }}
        >
          {collageItems.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: 'rgba(255,255,255,0.2)' }}>
              <Sparkles size={32} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px' }}>Collage Canvas is Empty</h3>
              <p style={{ fontSize: '11px', opacity: 0.6, marginTop: '8px' }}>Open the Tiles Shelf on the left and drop files onto the board.</p>
            </div>
          )}

          {/* Canvas Items */}
          {collageItems.map(item => {
            const isSelected = activeAction?.itemId === item.id;
            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  left: `${item.x}px`,
                  top: `${item.y}px`,
                  width: `${item.width}px`,
                  height: `${item.height}px`,
                  transform: `rotate(${item.rotation}deg)`,
                  zIndex: item.zIndex,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '12px',
                  background: 'rgba(10, 10, 15, 0.85)',
                  border: isSelected ? '2px solid var(--accent, #00ff88)' : '1px solid rgba(255, 255, 255, 0.12)',
                  boxShadow: isSelected 
                    ? '0 0 30px rgba(0, 255, 136, 0.35)' 
                    : '0 8px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
                  overflow: 'visible',
                  transition: activeAction?.itemId === item.id && activeAction.type === 'rotate' ? 'none' : 'box-shadow 0.2s, border-color 0.2s',
                  touchAction: 'none'
                }}
              >
                {/* Header Actions Area (Hover to display overlays) */}
                <div 
                  className="collage-item-header"
                  style={{
                    position: 'absolute',
                    top: '-32px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    height: '26px',
                    borderRadius: '13px',
                    background: 'rgba(12, 12, 16, 0.9)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '0 10px',
                    zIndex: 10,
                    opacity: 0,
                    transition: 'opacity 0.15s ease',
                    pointerEvents: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}
                >
                  {/* Layer Z-Index controls */}
                  <button
                    onClick={() => bringToFront(item.id)}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                    title="Bring to Front"
                  >
                    <Layers size={10} style={{ transform: 'rotate(180deg)', color: 'var(--accent, #00ff88)' }} />
                  </button>
                  <button
                    onClick={() => sendToBack(item.id)}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                    title="Send to Back"
                  >
                    <Layers size={10} style={{ opacity: 0.6 }} />
                  </button>

                  <div style={{ width: '1px', height: '10px', background: 'rgba(255,255,255,0.15)' }} />

                  {/* Open Solo focused view */}
                  <button
                    onClick={() => onDeepFocus(item.mediaId)}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                    title="Enlarge Unit"
                  >
                    <Maximize2 size={10} />
                  </button>

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    style={{ background: 'none', border: 'none', color: '#ff5c5c', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                    title="Remove item"
                  >
                    <X size={11} />
                  </button>
                </div>

                {/* Inline Controls (Hover CSS Triggered) */}
                <style>{`
                  div:hover > .collage-item-header {
                    opacity: 1 !important;
                    pointer-events: auto !important;
                  }
                `}</style>

                {/* Rotation Handle (At the top center) */}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setActiveAction({
                      itemId: item.id,
                      type: 'rotate',
                      startX: e.clientX,
                      startY: e.clientY,
                      startLeft: item.x,
                      startTop: item.y,
                      startWidth: item.width,
                      startHeight: item.height,
                      startRotation: item.rotation
                    });
                  }}
                  style={{
                    position: 'absolute',
                    top: '-16px',
                    left: 'calc(50% - 6px)',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: 'var(--accent, #00ff88)',
                    border: '1px solid rgba(255,255,255,0.4)',
                    boxShadow: '0 0 6px rgba(0, 255, 136, 0.8)',
                    cursor: 'grab',
                    zIndex: 9
                  }}
                  title="Drag to Rotate (Hold Shift to snap)"
                />

                {/* Drag Handle Container (The Card Content Area) */}
                <div
                  onPointerDown={(e) => {
                    // Check if resizing/editing control to not conflict dragging
                    const target = e.target as HTMLElement;
                    if (target.closest('.collage-inner-btn') || target.closest('.resize-handle')) return;
                    
                    e.stopPropagation();
                    setActiveAction({
                      itemId: item.id,
                      type: 'drag',
                      startX: e.clientX,
                      startY: e.clientY,
                      startLeft: item.x,
                      startTop: item.y,
                      startWidth: item.width,
                      startHeight: item.height,
                      startRotation: item.rotation
                    });
                  }}
                  style={{
                    flex: 1,
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                    borderRadius: '11px',
                    overflow: 'hidden',
                    background: '#000',
                    cursor: 'move'
                  }}
                >
                  {/* Media Content Render */}
                  {item.isImage ? (
                    <img 
                      src={item.url} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', userSelect: 'none' }} 
                      alt="" 
                    />
                  ) : (
                    <video
                      src={item.url}
                      autoPlay
                      loop
                      muted={item.muted}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                      ref={(el) => {
                        if (el) {
                          if (item.playing) el.play().catch(() => {});
                          else el.pause();
                        }
                      }}
                    />
                  )}

                  {/* Individual Live Controls overlay inside Video card */}
                  {!item.isImage && (
                    <div 
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        left: '8px',
                        display: 'flex',
                        gap: '6px',
                        zIndex: 5
                      }}
                    >
                      <button
                        className="collage-inner-btn"
                        onClick={() => {
                          setCollageItems(prev => prev.map(x => x.id === item.id ? { ...x, playing: !x.playing } : x));
                        }}
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.6)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        {item.playing ? <Pause size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                      </button>
                      
                      <button
                        className="collage-inner-btn"
                        onClick={() => {
                          setCollageItems(prev => prev.map(x => x.id === item.id ? { ...x, muted: !x.muted } : x));
                        }}
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.6)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        {item.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                      </button>
                    </div>
                  )}

                  {/* Title overlay in top corner */}
                  <div 
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      background: 'rgba(0,0,0,0.5)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      color: 'rgba(255,255,255,0.8)',
                      fontSize: '9px',
                      fontWeight: 600,
                      maxW: '75%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {item.title}
                  </div>
                </div>

                {/* Resize Handle (Bottom Right corner) */}
                <div
                  className="resize-handle"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setActiveAction({
                      itemId: item.id,
                      type: 'resize',
                      startX: e.clientX,
                      startY: e.clientY,
                      startLeft: item.x,
                      startTop: item.y,
                      startWidth: item.width,
                      startHeight: item.height,
                      startRotation: item.rotation
                    });
                  }}
                  style={{
                    position: 'absolute',
                    bottom: '-4px',
                    right: '-4px',
                    width: '14px',
                    height: '14px',
                    background: 'rgba(255, 255, 255, 0.9)',
                    border: '2px solid var(--accent, #00ff88)',
                    borderRadius: '50%',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                    cursor: 'se-resize',
                    zIndex: 9
                  }}
                  title="Drag to Resize"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
