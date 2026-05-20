import { useState, useEffect } from 'react';
import { 
  ROW_THRESHOLD_PX, 
  ROW_MATCH_THRESHOLD, 
  LAYOUT_CALC_DELAY 
} from '../constants';
import type { VideoItem } from '../types';

interface LayoutOrchestrationProps {
  videos: VideoItem[];
  zoom: number;
  immersive: boolean;
  filteredCount: number;
  isPopout?: boolean;
}

/**
 * Custom hook to manage grid layout awareness and row calculations.
 */
export function useLayoutOrchestration({
  videos,
  zoom,
  immersive,
  filteredCount,
  isPopout = false
}: LayoutOrchestrationProps) {
  const [rowOffsets, setRowOffsets] = useState<number[]>([]);
  const [idToRow, setIdToRow] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isPopout) return;
    
    const calculateRows = () => {
      try {
        const items = document.querySelectorAll('.grid-item-wrap');
        if (items.length === 0) {
          setRowOffsets([]);
          return;
        }

        const rawOffsets: number[] = [];
        items.forEach(el => rawOffsets.push((el as HTMLElement).offsetTop));
        
        const sortedRaw = [...rawOffsets].sort((a, b) => a - b);
        const distinctRows: number[] = [];
        sortedRaw.forEach(top => {
          if (distinctRows.length === 0 || Math.abs(top - distinctRows[distinctRows.length - 1]) > ROW_THRESHOLD_PX) {
            distinctRows.push(top);
          }
        });

        const tempIdToRow: Record<string, number> = {};
        items.forEach(el => {
          const id = (el as HTMLElement).getAttribute('data-id');
          const top = (el as HTMLElement).offsetTop;
          if (id) {
            const rowIdx = distinctRows.findIndex(r => Math.abs(r - top) < ROW_MATCH_THRESHOLD);
            tempIdToRow[id] = rowIdx;
          }
        });

        setIdToRow(tempIdToRow);
        setRowOffsets(distinctRows);
      } catch (err) { 
        console.error("[Layout] Calculation Error:", err); 
      }
    };

    // Calculate after a short delay to allow DOM to settle
    const timer = setTimeout(calculateRows, LAYOUT_CALC_DELAY);
    
    // Watch for window/container resizing
    const observer = new ResizeObserver(() => calculateRows());
    const grid = document.querySelector('.video-grid');
    if (grid) observer.observe(grid);
    
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [videos.length, zoom, immersive, filteredCount, isPopout]);

  return {
    rowOffsets,
    idToRow,
    setRowOffsets,
    setIdToRow
  };
}
