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
    }
    
    addLog(`System Volume: ${newState ? 'OFF' : 'ON'}${soloId ? ' (Individual)' : ''}`);
  }, [masterMuted, globalVolume, preMuteVolume, setMasterMuted, setMasterMutedOverride, setGlobalVolume, addLog]);

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
