import { useCallback } from 'react';
import type { VideoItem } from '../types';

interface UseDemoLoaderProps {
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  addLog: (m: string) => void;
}

export function useDemoLoader({
  setVideos,
  addLog
}: UseDemoLoaderProps) {
  const onAddVideo = useCallback((newVideo: VideoItem) => {
    setVideos(prev => {
      if (prev.some(v => v.realPath && newVideo.realPath && v.realPath.toLowerCase() === newVideo.realPath.toLowerCase())) {
        return prev;
      }
      return [...prev, newVideo];
    });
  }, [setVideos]);

  const handleLoadDemos = useCallback(() => {
    const DEMO_ITEMS: VideoItem[] = [
      {
        id: 'demo-1',
        title: 'Work Colleagues',
        url: '/demos/promo_001.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-2',
        title: 'Space Command',
        url: '/demos/promo_002.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-3',
        title: 'Girl Listening to Music',
        url: '/demos/promo_003.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-4',
        title: 'Glowing Flower',
        url: '/demos/promo_004.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-5',
        title: 'Sixties Cinematic',
        url: '/demos/promo_005.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-6',
        title: 'Rainy City',
        url: '/demos/promo_006.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-7',
        title: 'Chameleon in Forest',
        url: '/demos/chameleon.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-8',
        title: 'Helicopter Waterfall',
        url: '/demos/promo_008.mp4',
        repeatMode: 'all',
        repeatCount: 0,
        playing: true,
        muted: true
      },
      {
        id: 'demo-9',
        title: 'Man with Cat',
        url: '/demos/man_cat.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-10',
        title: 'Chameleon in Forest (Alt)',
        url: '/demos/chameleon.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-11',
        title: 'Chinese Lady Drinking Tea',
        url: '/demos/chinese_lady_tea.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-12',
        title: 'Native American Elder',
        url: '/demos/abstract_art_1.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-13',
        title: 'Monitor Setup',
        url: '/demos/abstract_art_2.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      },
      {
        id: 'demo-14',
        title: 'Friends Walking',
        url: '/demos/friends_town.webp',
        repeatMode: 'none',
        repeatCount: 0,
        playing: false,
        muted: true
      }
    ];
    setVideos(DEMO_ITEMS);
    addLog("Onboarding: Loaded Cosmo Symphony Demo Workspace");
  }, [setVideos, addLog]);

  return {
    onAddVideo,
    handleLoadDemos
  };
}
