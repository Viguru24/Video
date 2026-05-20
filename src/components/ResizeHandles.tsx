import React, { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

type ResizeDirection = 'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West';

export const ResizeHandles = React.memo(() => {
  useEffect(() => {
    console.log('ResizeHandles component truly mounted');
  }, []);
  
  const handleResize = (e: React.MouseEvent, direction: ResizeDirection) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.button !== 0) return; // Only left click
    
    try {
      const window = getCurrentWindow();
      window.startResizeDragging(direction).catch((error) => {
        console.error('Start resize dragging failed:', error);
      });
    } catch (err) {
      console.error('Exception in resize handle:', err);
    }
  };

  return (
    <>
      <div className="resize-handle handle-t" onMouseDown={(e) => handleResize(e, 'North')} />
      <div className="resize-handle handle-b" onMouseDown={(e) => handleResize(e, 'South')} />
      <div className="resize-handle handle-l" onMouseDown={(e) => handleResize(e, 'West')} />
      <div className="resize-handle handle-r" onMouseDown={(e) => handleResize(e, 'East')} />
      <div className="resize-handle handle-tl" onMouseDown={(e) => handleResize(e, 'NorthWest')} />
      <div className="resize-handle handle-tr" onMouseDown={(e) => handleResize(e, 'NorthEast')} />
      <div className="resize-handle handle-bl" onMouseDown={(e) => handleResize(e, 'SouthWest')} />
      <div className="resize-handle handle-br" onMouseDown={(e) => handleResize(e, 'SouthEast')} />
    </>
  );
});

ResizeHandles.displayName = 'ResizeHandles';
