import React from 'react';

interface PopoutScrubBarProps {
  isImage: boolean;
  activeVideo: any;
  showUI: boolean;
  scrubTrackRef: React.RefObject<HTMLDivElement | null>;
  handleScrubMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  duration: number;
  currentTime: number;
  formatTime: (time: number) => string;
}

export const PopoutScrubBar: React.FC<PopoutScrubBarProps> = ({
  isImage,
  activeVideo,
  showUI,
  scrubTrackRef,
  handleScrubMouseDown,
  duration,
  currentTime,
  formatTime,
}) => {
  if (isImage || !activeVideo) return null;

  return (
    <div 
      style={{
        position: 'absolute',
        bottom: '96px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: '1200px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        zIndex: 100000,
        cursor: 'pointer',
        opacity: showUI ? 1 : 0,
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        padding: '0 10px',
        userSelect: 'none',
        pointerEvents: showUI ? 'auto' : 'none'
      }}
    >
      <div 
        ref={scrubTrackRef}
        onMouseDown={handleScrubMouseDown}
        style={{
          position: 'relative',
          flex: 1,
          height: '6px',
          background: 'rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '4px'
        }}
      >
        <div 
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent, #00ff88), #0096ff)',
            borderRadius: '4px',
            boxShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
            width: `${duration ? (currentTime / duration) * 100 : 0}%`
          }}
        />
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: '#fff',
            border: '2px solid var(--accent, #00ff88)',
            boxShadow: '0 0 8px rgba(0, 255, 136, 0.8), 0 2px 4px rgba(0,0,0,0.5)',
            left: `${duration ? (currentTime / duration) * 100 : 0}%`,
            transition: 'transform 0.1s ease',
            pointerEvents: 'none'
          }}
        />
      </div>
      <div 
        style={{
          color: '#fff',
          fontSize: '12px',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          letterSpacing: '0.5px',
          background: 'rgba(10, 10, 12, 0.75)',
          backdropFilter: 'blur(12px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '4px 10px',
          borderRadius: '12px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
          minWidth: '95px',
          textAlign: 'center'
        }}
      >
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>
    </div>
  );
};
