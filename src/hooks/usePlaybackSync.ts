import { useState, useCallback } from 'react';
import type { VideoItem } from '../types';

interface PlaybackSyncProps {
  masterPlaying: boolean;
  setMasterPlaying: (val: boolean) => void;
  masterMuted: boolean;
  setMasterMuted: (val: boolean) => void;
  setMasterMutedOverride: (val: boolean) => void;
  globalVolume: number;
  setGlobalVolume: (val: number) => void;
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addLog: (msg: string) => void;
}

/**
 * Custom hook to manage global playback synchronization and volume control.
 */
export function usePlaybackSync({
  masterPlaying,
  setMasterPlaying,
  masterMuted,
  setMasterMuted,
  setMasterMutedOverride,
  globalVolume,
  setGlobalVolume,
  setVideos,
  addLog
}: PlaybackSyncProps) {
  const [preMuteVolume, setPreMuteVolume] = useState(1);

  const toggleMasterMute = useCallback((soloId?: string) => {
    const newState = !masterMuted;
    setMasterMuted(newState);
    setMasterMutedOverride(true);
    
    if (newState) {
      setPreMuteVolume(globalVolume);
      setGlobalVolume(0);
    } else {
      setGlobalVolume(preMuteVolume > 0 ? preMuteVolume : 1);
      // If unmuting via a specific video card (string ID passed), only unmute that card and keep others muted
      if (soloId && typeof soloId === 'string') {
        setVideos(p => p.map(v => ({ ...v, muted: v.id !== soloId })));
      } else {
        // Unmute all individual videos on the grid so they actually play sound
        setVideos(p => p.map(v => ({ ...v, muted: false })));
      }
    }
    
    addLog(`System Volume: ${newState ? 'OFF' : 'ON'}${soloId && typeof soloId === 'string' ? ` (Solo: ${soloId})` : ''}`);
  }, [masterMuted, globalVolume, preMuteVolume, setMasterMuted, setMasterMutedOverride, setGlobalVolume, setVideos, addLog]);

  const toggleMasterPlay = useCallback(() => {
    const newState = !masterPlaying;
    setMasterPlaying(newState);
    setVideos(p => p.map(v => ({ ...v, playing: newState })));
    addLog(`System Playback: ${newState ? 'RESUMED' : 'PAUSED'}`);
  }, [masterPlaying, setMasterPlaying, setVideos, addLog]);

  return {
    toggleMasterMute,
    toggleMasterPlay,
    preMuteVolume,
    setPreMuteVolume
  };
}
