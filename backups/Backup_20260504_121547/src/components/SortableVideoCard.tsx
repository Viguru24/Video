import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { VideoCard } from './VideoCard';
import type { VideoItem, RepeatMode } from '../types';

interface SortableVideoCardProps {
  video: VideoItem;
  globalRepeat: RepeatMode;
  globalSpeed: number;
  fitMode: 'cover' | 'contain';
  onUpdateVideo: (id: string, updates: Partial<VideoItem>) => void;
  onRemove: () => void;
  onLog: (msg: string) => void;
  onFocus: () => void;
  focusedId: string | null;
  isFocused: boolean;
  onCloseFocus: () => void;
  snapshotDir?: string;
  setSnapshotDir?: (dir: string) => void;
  globalControl: string | null;
  masterPlaying: boolean;
  masterMuted: boolean;
  globalVolume: number;
  masterShowUI: boolean;
  toggleMasterMute: () => void;
  toggleMasterPlay: () => void;
  onEnded: () => void;
  onEndedProp?: () => void;
  onContextMenu: (x: number, y: number) => void;
  onDeepFocus: () => void;
}

function SortableVideoCardInternal(props: SortableVideoCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.video.id });

  const [isVisible, setIsVisible] = React.useState(true);
  const observerRef = React.useRef<IntersectionObserver | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    observerRef.current = new IntersectionObserver(([entry]) => {
      // SMART CULLING: Only active decoders for visible units
      // FORCE VISIBLE if focused to avoid hibernation during expansion
      if (props.isFocused) {
        setIsVisible(true);
      } else {
        setIsVisible(entry.isIntersecting);
      }
    }, { 
      threshold: 0.01,
      rootMargin: '300px' // Increased margin for smoother transitions
    });

    if (containerRef.current) observerRef.current.observe(containerRef.current);
    
    // WAKE UP PULSE: When focus state changes, ensure units are marked visible to trigger hydration
    if (!props.focusedId) {
       setIsVisible(true);
    }

    return () => observerRef.current?.disconnect();
  }, [props.isFocused, props.focusedId]);


  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? transition : undefined,
    gridColumn: `span ${props.video.cols || 1}`,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.8 : 1,
    willChange: 'transform, opacity',
  };

  const handleRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    containerRef.current = node;
  };

  return (
    <div 
      ref={handleRef} 
      style={style} 
      className={`grid-item-wrap ${props.isFocused ? 'focused' : ''} ${isDragging ? 'dragging' : ''} ${props.focusedId && props.focusedId !== props.video.id ? 'dimmed' : ''}`}
      data-id={props.video.id}
    >
      <VideoCard 
        {...props} 
        isVisible={isVisible}
        dragListeners={listeners} 
        dragAttributes={attributes} 
      />
    </div>
  );
}

export const SortableVideoCard = React.memo(SortableVideoCardInternal);

