import { useEffect } from 'react';
import { MIN_ZOOM, MAX_ZOOM } from '../constants';

interface UseGridZoomWheelParams {
  setZoom: (val: number | ((prev: number) => number)) => void;
  addLog: (msg: string) => void;
}

export function useGridZoomWheel({ setZoom, addLog }: UseGridZoomWheelParams) {
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      const scrollArea = target.closest('.video-scroll');
      if (!scrollArea) return;

      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1 : -1;
        setZoom((prev) => {
          const next = prev + delta;
          if (next >= MIN_ZOOM && next <= MAX_ZOOM) {
            addLog(`Grid Density: ${next} mode`);
            return next;
          }
          return prev;
        });
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [addLog, setZoom]);
}
