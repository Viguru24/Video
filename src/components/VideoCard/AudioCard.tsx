import React from 'react';
import { motion } from 'framer-motion';
import { Disc } from 'lucide-react';
import type { VideoItem, RepeatMode } from '../../types';
import { useStore } from '../../store/useStore';

interface AudioCardProps {
  video: VideoItem;
  displayUrl: string;
  effectiveMuted: boolean;
  globalRepeat: RepeatMode;
  songInfo: { band: string; album: string; title: string } | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  lastTime: React.MutableRefObject<number>;
  onEnded: () => void;
  handleTimeUpdate: () => void;
  setDuration: (d: number) => void;
  setError: (e: string | null) => void;
  zoomScale: number;
  panOffset: { x: number; y: number };
  onUpdateVideo: (id: any, updates: any) => void;
  onLog: (msg: string) => void;
}

export function AudioCard({
  video, displayUrl, effectiveMuted, globalRepeat, songInfo,
  videoRef, lastTime, onEnded, handleTimeUpdate,
  setDuration, setError, zoomScale, panOffset, onUpdateVideo, onLog
}: AudioCardProps) {
  return (
    <>
      <video
        key={displayUrl}
        ref={videoRef}
        src={displayUrl}
        preload="metadata"
        draggable="false"
        crossOrigin="anonymous"
        playsInline
        loop={((video.repeatMode && video.repeatMode !== 'none') ? video.repeatMode : globalRepeat) === 'always'}
        muted={effectiveMuted}
        onEnded={(e) => {
          const baseMode = video.repeatMode && video.repeatMode !== 'none'
            ? video.repeatMode
            : globalRepeat;
          let currentMode = baseMode;
          if (currentMode as any === 'all') currentMode = 'folder';

          if (currentMode === 'once') {
            const vid = e.currentTarget;
            const count = video.repeatCount || 0;
            if (count < 1) {
              vid.currentTime = 0;
              vid.play().catch(() => {});
              if (onUpdateVideo) {
                onUpdateVideo(video.id, { repeatCount: count + 1 });
              }
            } else {
              onEnded();
            }
          } else {
            onEnded();
          }
        }}
        onTimeUpdate={handleTimeUpdate}
        data-zoom={zoomScale}
        data-pan-x={panOffset.x}
        data-pan-y={panOffset.y}
        data-rotation={video.rotation || 0}
        onLoadedMetadata={() => {
          setDuration(videoRef.current?.duration || 0);
          if (lastTime.current > 0 && videoRef.current) {
            videoRef.current.currentTime = lastTime.current;
          }
          setError(null);
          if (video.playing && videoRef.current) {
            videoRef.current.play().catch(e => console.warn("Autoplay failed:", e));
          }
          setTimeout(handleTimeUpdate, 50);
        }}
        onError={() => {
          const friendlyError = "LOAD ERROR";
          setError(friendlyError);
          onLog(`Unit [${video.title}] Error: ${friendlyError}`);
        }}
        style={{ 
          position: 'absolute',
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: 'none'
        }}
      />
      <div 
        className="audio-card-container"
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #09090e 0%, #11111d 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          padding: '16px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: 'inherit',
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)'
        }}
      >
        <div 
          style={{ 
            position: 'relative', 
            width: '90px', 
            height: '90px', 
            marginBottom: '12px',
            perspective: '600px'
          }}
        >
          <motion.div
            animate={video.playing ? { rotate: 360 } : {}}
            transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, #222 10%, #111 25%, #050505 40%, #151515 65%, #000 80%)',
              border: '3px solid #2a2a2a',
              boxShadow: video.playing 
                ? '0 8px 24px rgba(0, 255, 136, 0.25), 0 0 0 1px rgba(0, 255, 136, 0.1)' 
                : '0 8px 20px rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            <div style={{ position: 'absolute', width: '74px', height: '74px', borderRadius: '50%', border: '1px solid rgba(255, 255, 255, 0.05)' }} />
            <div style={{ position: 'absolute', width: '58px', height: '58px', borderRadius: '50%', border: '1px solid rgba(255, 255, 255, 0.04)' }} />
            <div style={{ position: 'absolute', width: '42px', height: '42px', borderRadius: '50%', border: '1px solid rgba(255, 255, 255, 0.03)' }} />
            <div 
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--accent, #00ff88)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4)'
              }}
            >
              <Disc size={12} color="#000" />
            </div>
          </motion.div>
          {video.playing && (
            <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '2px', alignItems: 'flex-end', height: '14px', zIndex: 2 }}>
              <span style={{ width: '2px', height: '12px', background: 'var(--accent, #00ff88)', borderRadius: '1px', animation: 'bounce-bar 0.5s infinite alternate' }} />
              <span style={{ width: '2px', height: '7px', background: 'var(--accent, #00ff88)', borderRadius: '1px', animation: 'bounce-bar 0.5s infinite alternate 0.1s' }} />
              <span style={{ width: '2px', height: '14px', background: 'var(--accent, #00ff88)', borderRadius: '1px', animation: 'bounce-bar 0.5s infinite alternate 0.2s' }} />
              <span style={{ width: '2px', height: '9px', background: 'var(--accent, #00ff88)', borderRadius: '1px', animation: 'bounce-bar 0.5s infinite alternate 0.3s' }} />
              <span style={{ width: '2px', height: '11px', background: 'var(--accent, #00ff88)', borderRadius: '1px', animation: 'bounce-bar 0.5s infinite alternate 0.4s' }} />
            </div>
          )}
        </div>
        <div 
          style={{ 
            textAlign: 'center', 
            width: '100%', 
            zIndex: 2, 
            cursor: 'pointer' 
          }}
          onClick={(e) => {
            e.stopPropagation();
            onUpdateVideo(video.id, { playing: true });
            useStore.getState().setCurrentPlayingSongId(video.id);
            useStore.getState().setMusicPlayerExpanded(true);
            useStore.getState().setShowQueue(true);
            useStore.getState().setMasterPlaying(true);
          }}
        >
          <div 
            className="song-title-hoverable"
            style={{
              fontSize: '13px',
              fontWeight: 900,
              color: video.playing ? 'var(--accent, #00ff88)' : '#fff',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textShadow: video.playing ? '0 0 10px rgba(0, 255, 136, 0.3)' : 'none',
              transition: 'color 0.2s'
            }}
          >
            {songInfo?.title}
          </div>
          <div style={{ fontSize: '10px', color: '#aaa', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {songInfo?.band}
          </div>
          <div style={{ fontSize: '9px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
            {songInfo?.album}
          </div>
        </div>
      </div>
    </>
  );
}
