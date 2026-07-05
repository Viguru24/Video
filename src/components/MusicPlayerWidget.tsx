import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { VideoItem, RepeatMode } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Repeat,
  Repeat1,
  ListMusic,
  Disc,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  Layers
} from 'lucide-react';
import { toCosmoUrl } from '../utils/videoUtils';

// Helper to determine if a video item is an audio file
export function isAudioFile(path: string): boolean {
  if (!path) return false;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'wma', 'aac', 'alac', 'mp3a'].includes(ext);
}

// Struct to represent parsed song information
export interface SongInfo {
  band: string;
  album: string;
  title: string;
}

export function parseSongInfo(video: VideoItem): SongInfo {
  if (video.realPath) {
    const parts = video.realPath.split(/[\\/]/);
    if (parts.length >= 3) {
      const title = parts[parts.length - 1].replace(/\.[^/.]+$/, "");
      const album = parts[parts.length - 2];
      const band = parts[parts.length - 3];
      
      const genericFolders = ['music', 'download', 'downloads', 'documents', 'desktop', 'github', 'video', 'audios', 'assets', 'vocal', 'instrumental'];
      if (!genericFolders.includes(band.toLowerCase())) {
        return { band, album, title };
      }
    }
  }

  const titleParts = video.title.split(' - ');
  if (titleParts.length >= 3) {
    return {
      band: titleParts[0].trim(),
      album: titleParts[1].trim(),
      title: titleParts.slice(2).join(' - ').replace(/\.[^/.]+$/, "").trim()
    };
  } else if (titleParts.length === 2) {
    return {
      band: titleParts[0].trim(),
      album: "Single",
      title: titleParts[1].replace(/\.[^/.]+$/, "").trim()
    };
  }

  return {
    band: "Unknown Artist",
    album: "Unknown Album",
    title: video.title.replace(/\.[^/.]+$/, "")
  };
}

interface MusicPlayerWidgetProps {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
}

export function MusicPlayerWidget({ videos, setVideos }: MusicPlayerWidgetProps) {
  const {
    showQueue,
    setShowQueue,
    musicPlayerExpanded,
    setMusicPlayerExpanded,
    currentPlayingSongId,
    setCurrentPlayingSongId,
    masterPlaying,
    setMasterPlaying,
    masterMuted,
    setMasterMuted,
    globalVolume,
    setGlobalVolume,
    globalRepeat,
    setGlobalRepeat
  } = useStore();

  // Filter only audio/music items from reactive props
  const songs = useMemo(() => {
    return videos.filter(v => isAudioFile(v.realPath || v.url));
  }, [videos]);

  // Find currently active song in state
  const activeSong = useMemo(() => {
    if (currentPlayingSongId) {
      const found = songs.find(s => s.id === currentPlayingSongId);
      if (found) return found;
    }
    // Fallback to first playing song
    const playing = songs.find(s => s.playing);
    if (playing) return playing;
    return songs[0] || null;
  }, [songs, currentPlayingSongId]);

  // Sync active song ID with the store using safe useEffect (prevent render-time loop)
  useEffect(() => {
    if (!activeSong) return;
    const playing = songs.find(s => s.playing);
    if (playing && currentPlayingSongId !== playing.id) {
      setCurrentPlayingSongId(playing.id);
    }
  }, [songs, activeSong, currentPlayingSongId, setCurrentPlayingSongId]);

  // Get active song parsed info
  const songInfo = useMemo(() => {
    if (!activeSong) return { band: "No Track Loaded", album: "Queue is empty", title: "Select a song" };
    return parseSongInfo(activeSong);
  }, [activeSong]);

  // Set currently playing song playing state
  const togglePlay = () => {
    if (!activeSong) return;
    const nextPlaying = !activeSong.playing;
    
    setVideos((prev: VideoItem[]) =>
      prev.map(v => (v.id === activeSong.id ? { ...v, playing: nextPlaying } : v))
    );
    setMasterPlaying(nextPlaying);
  };

  // Navigating tracks in queue
  const playNext = () => {
    if (songs.length <= 1 || !activeSong) return;
    const currentIdx = songs.findIndex(s => s.id === activeSong.id);
    if (currentIdx === -1) return;

    const nextIdx = (currentIdx + 1) % songs.length;
    const nextSong = songs[nextIdx];
    
    if (nextSong) {
      setVideos((prev: VideoItem[]) =>
        prev.map(v => {
          if (v.id === nextSong.id) return { ...v, playing: true, currentTime: 0 };
          if (v.id === activeSong.id) return { ...v, playing: false };
          return v;
        })
      );
      setCurrentPlayingSongId(nextSong.id);
    }
  };

  const playPrev = () => {
    if (songs.length <= 1 || !activeSong) return;
    const currentIdx = songs.findIndex(s => s.id === activeSong.id);
    if (currentIdx === -1) return;

    const prevIdx = (currentIdx - 1 + songs.length) % songs.length;
    const prevSong = songs[prevIdx];
    
    if (prevSong) {
      setVideos((prev: VideoItem[]) =>
        prev.map(v => {
          if (v.id === prevSong.id) return { ...v, playing: true, currentTime: 0 };
          if (v.id === activeSong.id) return { ...v, playing: false };
          return v;
        })
      );
      setCurrentPlayingSongId(prevSong.id);
    }
  };

  // Repeat modes: none (stop at end), always (loop current song), folder (loop whole playlist)
  const cycleRepeatMode = () => {
    const modes: RepeatMode[] = ['none', 'always', 'folder'];
    const nextMode = modes[(modes.indexOf(globalRepeat) + 1) % modes.length];
    setGlobalRepeat(nextMode);
  };

  // Double click a song in queue to play it
  const playSong = (song: VideoItem) => {
    setVideos((prev: VideoItem[]) =>
      prev.map(v => {
        if (v.id === song.id) return { ...v, playing: true, currentTime: 0 };
        if (activeSong && v.id === activeSong.id) return { ...v, playing: false };
        return v;
      })
    );
    setCurrentPlayingSongId(song.id);
    setMasterPlaying(true);
  };

  // Structured Queue tree: Band -> Album -> Song
  const queueStructure = useMemo(() => {
    const tree: Record<string, Record<string, VideoItem[]>> = {};
    
    songs.forEach(song => {
      const info = parseSongInfo(song);
      if (!tree[info.band]) {
        tree[info.band] = {};
      }
      if (!tree[info.band][info.album]) {
        tree[info.band][info.album] = [];
      }
      tree[info.band][info.album].push(song);
    });

    return tree;
  }, [songs]);

  // Track expanded groups in the tree
  const [expandedBands, setExpandedBands] = useState<Record<string, boolean>>({});
  const [expandedAlbums, setExpandedAlbums] = useState<Record<string, boolean>>({});

  const toggleBand = (band: string) => {
    setExpandedBands(prev => ({ ...prev, [band]: !prev[band] }));
  };

  const toggleAlbum = (albumKey: string) => {
    setExpandedAlbums(prev => ({ ...prev, [albumKey]: !prev[albumKey] }));
  };

  // Automatically expand playing song group when queue opens
  useEffect(() => {
    if (showQueue && activeSong) {
      const info = parseSongInfo(activeSong);
      setExpandedBands(prev => ({ ...prev, [info.band]: true }));
      setExpandedAlbums(prev => ({ ...prev, [`${info.band}-${info.album}`]: true }));
    }
  }, [showQueue, activeSong]);

  // Audio elements synchronization tracking
  const [songProgress, setSongProgress] = useState(0);
  const [currentTimeStr, setCurrentTimeStr] = useState("0:00");
  const [durationStr, setDurationStr] = useState("0:00");

  useEffect(() => {
    if (!activeSong) return;

    const findAudioElement = () => {
      // Find the html5 video/audio element inside the grid matching activeSong.id
      const videoEl = document.querySelector(`[data-id="${activeSong.id}"] video`) as HTMLVideoElement;
      return videoEl;
    };

    let intervalId: any;
    const updateProgress = () => {
      const audio = findAudioElement();
      if (audio) {
        const cur = audio.currentTime || 0;
        const dur = audio.duration || 0;
        if (dur > 0) {
          setSongProgress((cur / dur) * 100);
          
          const formatTime = (time: number) => {
            const mins = Math.floor(time / 60);
            const secs = Math.floor(time % 60).toString().padStart(2, '0');
            return `${mins}:${secs}`;
          };
          
          setCurrentTimeStr(formatTime(cur));
          setDurationStr(formatTime(dur));
        }
      }
    };

    intervalId = setInterval(updateProgress, 300);
    return () => clearInterval(intervalId);
  }, [activeSong]);

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeSong) return;
    const audio = document.querySelector(`[data-id="${activeSong.id}"] video`) as HTMLVideoElement;
    if (audio && audio.duration) {
      const val = parseFloat(e.target.value);
      const targetTime = (val / 100) * audio.duration;
      audio.currentTime = targetTime;
      setSongProgress(val);
    }
  };

  if (songs.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: '85px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
      <AnimatePresence>
        {/* THE QUEUE PANEL */}
        {showQueue && musicPlayerExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="premium-glass"
            style={{
              width: '320px',
              height: '380px',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(10, 10, 15, 0.85)',
              boxShadow: '0 15px 35px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              backdropFilter: 'blur(20px)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ListMusic size={15} style={{ color: 'var(--accent, #00ff88)' }} />
                <span style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '1px', color: '#fff', textTransform: 'uppercase' }}>PLAYBACK QUEUE</span>
              </div>
              <button 
                onClick={() => setShowQueue(false)}
                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', padding: 0 }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Folder-structured tree view */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }} className="video-scroll">
              {Object.keys(queueStructure).length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', fontSize: '11px', padding: '40px 0' }}>No songs in queue</div>
              ) : (
                Object.entries(queueStructure).map(([bandName, albums]) => {
                  const isBandExpanded = !!expandedBands[bandName];
                  return (
                    <div key={bandName} style={{ marginBottom: '8px' }}>
                      {/* BAND ROW */}
                      <div 
                        onClick={() => toggleBand(bandName)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 8px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: 'rgba(255,255,255,0.02)',
                          userSelect: 'none',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      >
                        <ChevronRight 
                          size={12} 
                          style={{ 
                            transform: isBandExpanded ? 'rotate(90deg)' : 'none', 
                            transition: 'transform 0.2s',
                            color: 'var(--accent, #00ff88)' 
                          }} 
                        />
                        <Folder size={13} style={{ color: '#38bdf8' }} />
                        <span style={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}>{bandName}</span>
                        <span style={{ fontSize: '9px', color: '#666', marginLeft: 'auto' }}>
                          {Object.values(albums).reduce((acc, curr) => acc + curr.length, 0)} songs
                        </span>
                      </div>

                      {/* ALBUMS under Band */}
                      {isBandExpanded && (
                        <div style={{ paddingLeft: '14px', marginTop: '4px', borderLeft: '1px dashed rgba(255,255,255,0.08)', marginLeft: '13px' }}>
                          {Object.entries(albums).map(([albumName, songList]) => {
                            const albumKey = `${bandName}-${albumName}`;
                            const isAlbumExpanded = !!expandedAlbums[albumKey];
                            return (
                              <div key={albumName} style={{ marginBottom: '4px' }}>
                                {/* ALBUM ROW */}
                                <div 
                                  onClick={() => toggleAlbum(albumKey)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 6px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    background: 'transparent',
                                    userSelect: 'none'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <ChevronRight 
                                    size={10} 
                                    style={{ 
                                      transform: isAlbumExpanded ? 'rotate(90deg)' : 'none', 
                                      transition: 'transform 0.2s',
                                      color: 'rgba(255,255,255,0.4)' 
                                    }} 
                                  />
                                  <Disc size={11} style={{ color: '#a78bfa' }} />
                                  <span style={{ color: '#ccc', fontSize: '10px', fontWeight: 600 }}>{albumName}</span>
                                  <span style={{ fontSize: '8px', color: '#555', marginLeft: 'auto' }}>{songList.length} tracks</span>
                                </div>

                                {/* SONGS under Album */}
                                {isAlbumExpanded && (
                                  <div style={{ paddingLeft: '12px', marginTop: '2px', borderLeft: '1px dashed rgba(255,255,255,0.05)', marginLeft: '11px' }}>
                                    {songList.map(song => {
                                      const isPlaying = activeSong?.id === song.id;
                                      const parsed = parseSongInfo(song);
                                      return (
                                        <div
                                          key={song.id}
                                          onClick={() => playSong(song)}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '10px',
                                            color: isPlaying ? 'var(--accent, #00ff88)' : '#aaa',
                                            background: isPlaying ? 'rgba(0, 255, 136, 0.08)' : 'transparent',
                                            fontWeight: isPlaying ? 'bold' : 'normal',
                                            transition: 'all 0.15s'
                                          }}
                                          onMouseEnter={e => {
                                            if (!isPlaying) e.currentTarget.style.color = '#fff';
                                            e.currentTarget.style.background = isPlaying ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255,255,255,0.03)';
                                          }}
                                          onMouseLeave={e => {
                                            if (!isPlaying) e.currentTarget.style.color = '#aaa';
                                            e.currentTarget.style.background = isPlaying ? 'rgba(0, 255, 136, 0.08)' : 'transparent';
                                          }}
                                        >
                                          {isPlaying && song.playing ? (
                                            <span style={{ display: 'inline-flex', gap: '1px', marginRight: '6px', alignItems: 'flex-end', height: '8px' }}>
                                              <span className="visualizer-bar" style={{ width: '2px', height: '8px', background: 'var(--accent, #00ff88)', animation: 'bounce-bar 0.6s infinite alternate' }} />
                                              <span className="visualizer-bar" style={{ width: '2px', height: '5px', background: 'var(--accent, #00ff88)', animation: 'bounce-bar 0.6s infinite alternate 0.2s' }} />
                                              <span className="visualizer-bar" style={{ width: '2px', height: '7px', background: 'var(--accent, #00ff88)', animation: 'bounce-bar 0.6s infinite alternate 0.4s' }} />
                                            </span>
                                          ) : (
                                            <Music size={9} style={{ marginRight: '6px', opacity: 0.5 }} />
                                          )}
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parsed.title}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COLLAPSIBLE PLAYER PANEL */}
      <motion.div
        layout
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="premium-glass"
        style={{
          height: '64px',
          borderRadius: '32px',
          background: 'rgba(10, 10, 15, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          padding: musicPlayerExpanded ? '0 18px' : '0 6px',
          overflow: 'hidden',
          width: musicPlayerExpanded ? '460px' : '52px',
          maxWidth: '90vw',
          backdropFilter: 'blur(20px)',
          cursor: 'pointer'
        }}
        onClick={(e) => {
          if (!musicPlayerExpanded) {
            setMusicPlayerExpanded(true);
          }
        }}
      >
        {/* COLLAPSED LOGIC (Music Symbol Button) */}
        {!musicPlayerExpanded ? (
          <div 
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: activeSong?.playing ? 'linear-gradient(135deg, var(--accent, #00ff88), #00d2ff)' : 'rgba(255,255,255,0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: activeSong?.playing ? '0 0 15px rgba(0, 255, 136, 0.4)' : 'none',
              animation: activeSong?.playing ? 'pulse-slow 2s infinite' : 'none'
            }}
          >
            {activeSong?.playing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                style={{ display: 'flex' }}
              >
                <Disc size={20} color="#000" />
              </motion.div>
            ) : (
              <Music size={18} color="#aaa" />
            )}
          </div>
        ) : (
          /* EXPANDED PLAYER CONTROLS */
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '14px' }} onClick={e => e.stopPropagation()}>
            {/* Collapse Trigger Button (Vinyl Thumb) */}
            <div 
              onClick={() => setMusicPlayerExpanded(false)}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer',
                flexShrink: 0
              }}
              data-tooltip="Collapse Player"
            >
              <motion.div
                animate={activeSong?.playing ? { rotate: 360 } : {}}
                transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                style={{ display: 'flex' }}
              >
                <Disc size={18} style={{ color: activeSong?.playing ? 'var(--accent, #00ff88)' : '#888' }} />
              </motion.div>
            </div>

            {/* Song Metadata */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '110px', flexShrink: 0 }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {songInfo.title}
              </span>
              <span style={{ fontSize: '9px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {songInfo.band} • {songInfo.album}
              </span>
            </div>

            {/* Controls Center (SkipBack, Play/Pause, SkipForward) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button 
                onClick={playPrev}
                style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', transition: 'all 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = '#aaa'}
              >
                <SkipBack size={13} />
              </button>
              
              <button 
                onClick={togglePlay}
                style={{ 
                  background: 'var(--accent, #00ff88)', 
                  border: 'none', 
                  color: '#000', 
                  cursor: 'pointer', 
                  padding: '8px', 
                  borderRadius: '50%', 
                  display: 'flex',
                  boxShadow: activeSong?.playing ? '0 0 10px rgba(0, 255, 136, 0.3)' : 'none'
                }}
              >
                {activeSong?.playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              </button>

              <button 
                onClick={playNext}
                style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', transition: 'all 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = '#aaa'}
              >
                <SkipForward size={13} />
              </button>
            </div>

            {/* Progress Slider (Scrubber) */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '2px' }}>
              <input
                type="range"
                min="0"
                max="100"
                value={songProgress}
                onChange={handleScrub}
                style={{
                  width: '100%',
                  height: '3px',
                  borderRadius: '2px',
                  background: `linear-gradient(to right, var(--accent, #00ff88) 0%, var(--accent, #00ff88) ${songProgress}%, rgba(255,255,255,0.1) ${songProgress}%, rgba(255,255,255,0.1) 100%)`,
                  cursor: 'pointer',
                  appearance: 'none',
                  outline: 'none'
                }}
                className="music-range-slider"
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#666', fontFamily: 'monospace' }}>
                <span>{currentTimeStr}</span>
                <span>{durationStr}</span>
              </div>
            </div>

            {/* Repeat, Volume, Queue Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              {/* Repeat Toggle */}
              <button 
                onClick={cycleRepeatMode}
                className={globalRepeat !== 'none' ? 'active-accent' : ''}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: globalRepeat !== 'none' ? 'var(--accent, #00ff88)' : '#888', 
                  cursor: 'pointer', 
                  padding: '6px', 
                  borderRadius: '50%', 
                  display: 'flex' 
                }}
                title={`Repeat: ${globalRepeat.toUpperCase()}`}
              >
                {globalRepeat === 'always' ? <Repeat1 size={13} /> : <Repeat size={13} />}
              </button>

              {/* Volume Controller */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', position: 'relative' }}>
                <button
                  onClick={() => setMasterMuted(!masterMuted)}
                  style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', padding: '6px', display: 'flex' }}
                >
                  {masterMuted || globalVolume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={globalVolume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setGlobalVolume(val);
                    if (val > 0 && masterMuted) setMasterMuted(false);
                  }}
                  style={{
                    width: '45px',
                    height: '3px',
                    borderRadius: '2px',
                    background: `linear-gradient(to right, var(--accent, #00ff88) 0%, var(--accent, #00ff88) ${(masterMuted ? 0 : globalVolume) * 100}%, rgba(255,255,255,0.1) ${(masterMuted ? 0 : globalVolume) * 100}%, rgba(255,255,255,0.1) 100%)`,
                    cursor: 'pointer',
                    appearance: 'none',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Queue Trigger */}
              <button 
                onClick={() => setShowQueue(!showQueue)}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: showQueue ? 'var(--accent, #00ff88)' : '#aaa', 
                  cursor: 'pointer', 
                  padding: '6px', 
                  borderRadius: '50%', 
                  display: 'flex' 
                }}
                title="Toggle Queue"
              >
                <ListMusic size={13} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
