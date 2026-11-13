export type AspectRatio = 'free' | '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '21:9';

export const ASPECT_RATIOS: { id: AspectRatio; label: string; ratio: number | null; desc: string }[] = [
  { id: 'free', label: 'Free', ratio: null, desc: 'Custom unconstrained' },
  { id: '16:9', label: '16:9', ratio: 16 / 9, desc: 'YouTube / Widescreen' },
  { id: '9:16', label: '9:16', ratio: 9 / 16, desc: 'TikTok / Reels / Shorts' },
  { id: '1:1', label: '1:1', ratio: 1, desc: 'Square / Feed' },
  { id: '4:5', label: '4:5', ratio: 4 / 5, desc: 'Instagram Portrait' },
  { id: '4:3', label: '4:3', ratio: 4 / 3, desc: 'Standard Video' },
  { id: '21:9', label: '21:9', ratio: 21 / 9, desc: 'Cinematic Ultrawide' },
];

export function formatTime(sec: number): string {
  if (isNaN(sec) || sec < 0) sec = 0;
  const mins = Math.floor(sec / 60);
  const remainingSecs = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
