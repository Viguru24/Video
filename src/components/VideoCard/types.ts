import type { UseVideoCardProps } from './useVideoCard';

export interface VideoCardProps extends Omit<UseVideoCardProps, 'quality'> {
  quality?: 'low' | 'high';
  fitMode?: 'cover' | 'contain';
}
