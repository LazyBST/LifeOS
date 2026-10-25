// Pure maths for dragging and resizing calendar blocks (Google-Calendar style).
export const SNAP_MIN = 5;
export const snapMinutes = (min: number, step = SNAP_MIN) => Math.round(min / step) * step;

/**
 * Where a block ends up after dragging by `dyMin` minutes. Moving keeps the length and stays within the day;
 * resizing moves only the end and never makes the block shorter than one snap step.
 */
export function draggedRange(start: number, end: number, dyMin: number, mode: 'move' | 'resize'): { start: number; end: number } {
  const d = snapMinutes(dyMin);
  if (mode === 'resize') return { start, end: Math.min(24 * 60 - 1, Math.max(start + SNAP_MIN, end + d)) };
  const len = end - start;
  const s = Math.min(24 * 60 - 1 - len, Math.max(0, start + d));
  return { start: s, end: s + len };
}
