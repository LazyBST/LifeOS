import { describe, expect, it } from 'vitest';
import { draggedRange, snapMinutes } from '@/lib/domain/calendar-drag';

describe('calendar drag', () => {
  it('snaps to 5 minutes', () => { expect(snapMinutes(7)).toBe(5); expect(snapMinutes(8)).toBe(10); expect(snapMinutes(-12)).toBe(-10); });
  it('moves keeping the length and staying inside the day', () => {
    expect(draggedRange(600, 660, 31, 'move')).toEqual({ start: 630, end: 690 });
    expect(draggedRange(30, 90, -120, 'move')).toEqual({ start: 0, end: 60 });
    expect(draggedRange(1380, 1430, 300, 'move')).toEqual({ start: 1389, end: 1439 });
  });
  it('resizes only the end, with a minimum length', () => {
    expect(draggedRange(600, 660, 30, 'resize')).toEqual({ start: 600, end: 690 });
    expect(draggedRange(600, 660, -600, 'resize')).toEqual({ start: 600, end: 605 });
  });
});
