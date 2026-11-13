import { describe, it, expect } from 'vitest';
import { ASPECT_RATIOS, formatTime } from '../trimCropUtils';

describe('trimCropUtils', () => {
  it('formats seconds into MM:SS.cs with non-negative clamping', () => {
    expect(formatTime(0)).toBe('00:00.00');
    expect(formatTime(-4.2)).toBe('00:00.00');
    expect(formatTime(Number.NaN)).toBe('00:00.00');
    expect(formatTime(65.5)).toBe('01:05.50');
    expect(formatTime(125.09)).toBe('02:05.09');
  });

  it('provides expected aspect ratio presets with accurate ratios', () => {
    const byId = new Map(ASPECT_RATIOS.map((preset) => [preset.id, preset]));

    expect(byId.get('free')?.ratio).toBeNull();
    expect(byId.get('16:9')?.ratio).toBeCloseTo(16 / 9, 6);
    expect(byId.get('9:16')?.ratio).toBeCloseTo(9 / 16, 6);
    expect(byId.get('1:1')?.ratio).toBe(1);
    expect(byId.get('4:5')?.ratio).toBeCloseTo(4 / 5, 6);
    expect(byId.get('21:9')?.ratio).toBeCloseTo(21 / 9, 6);
  });
});
