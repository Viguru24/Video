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
  onUpdateVideo: (id: any, updates: any) => void;
  onRemove: (id: string) => void;
  onAnnihilate: (id: string) => void;
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
  toggleMasterMute: (soloId?: string) => void;
  toggleMasterPlay: () => void;
  onEnded: () => void;
  onEndedProp?: () => void;
  onContextMenu: (x: number, y: number) => void;
  onDeepFocus: (time?: number) => void;
  onUpscale?: (video: VideoItem) => void;
  isSelected?: boolean;
  onToggleSelect?: (shiftKey?: boolean, ctrlKey?: boolean) => void;
  selectionMode?: boolean;
  onNavigateSibling?: (direction: 1 | -1) => void;
  isAiEnhancing?: boolean;
  onSelectAll?: () => void;
  quality?: 'low' | 'high';
  isSlideshowActive?: boolean;
  setIsSlideshowActive?: (active: boolean) => void;
  onColorAdjust?: (id: string) => void;
  onStartCrop?: (id: string) => void;
  onAddVideo?: (newVideo: VideoItem) => void;
}

import { useStore } from '../store/useStore';

function SortableVideoCardInternal(props: SortableVideoCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.video.id });

  const smartCulling = useStore(state => state.smartCulling);
  const [isVisible, setIsVisible] = React.useState(true);
  const observerRef = React.useRef<IntersectionObserver | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const handleRef = React.useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    containerRef.current = node;

    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!smartCulling) {
      setIsVisible(true);
      return;
    }

    if (node) {
      observerRef.current = new IntersectionObserver(([entry]) => {
        // SMART CULLING: Only active decoders for visible units
        // FORCE VISIBLE if focused to avoid hibernation during expansion
        if (props.isFocused) {
          setIsVisible(true);
        } else {
          setIsVisible(entry.isIntersecting);
        }
      }, { 
        root: null, // Check intersection relative to the viewport (window) for bulletproof reliability
        threshold: 0.01,
        rootMargin: '300px' // Tighter pre-render buffer to aggressively cull off-screen videos and conserve GPU VRAM
      });
      observerRef.current.observe(node);
    }
  }, [props.isFocused, smartCulling, setNodeRef]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? transition : undefined,
    gridColumn: `span ${props.video.cols || 1}`,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.8 : 1,
    willChange: 'transform, opacity',
    touchAction: 'none',
  };

  return (
    <div 
      ref={handleRef} 
      style={style} 
      className={`grid-item-wrap ${props.isFocused ? 'focused' : ''} ${isDragging ? 'dragging' : ''} ${props.focusedId && props.focusedId !== props.video.id ? 'dimmed' : ''} ${props.isSelected ? 'selected-card' : ''}`}
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

