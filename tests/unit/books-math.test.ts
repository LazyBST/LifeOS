import { describe, expect, it } from 'vitest';
import { clampPage, estimatedFinish, pagesNeededPerDay, pagesPerDay, progressPct, verdict } from '@/lib/domain/books-math';

const TODAY = '2026-10-25';
describe('reading maths', () => {
  it('progress by pages', () => {
    expect(progressPct(150, 300)).toBe(50);
    expect(progressPct(400, 300)).toBe(100);
    expect(progressPct(10, null)).toBeNull();
  });
  it('pace counts idle days as zero and only the window', () => {
    const s = [{ read_on: '2026-10-25', pages: 28 }, { read_on: '2026-10-20', pages: 14 }, { read_on: '2026-09-01', pages: 500 }];
    expect(pagesPerDay(s, TODAY, 14)).toBe(3); // (28 + 14) / 14
  });
  it('estimates the finish date from the pace', () => {
    expect(estimatedFinish(100, 300, 20, TODAY)).toBe('2026-11-04'); // 200 pages / 20 = 10 days
    expect(estimatedFinish(100, 300, 0, TODAY)).toBeNull();
    expect(estimatedFinish(300, 300, 20, TODAY)).toBeNull();
  });
  it('pages needed per day to hit a target (today counts)', () => {
    expect(pagesNeededPerDay(100, 300, '2026-11-03', TODAY)).toBe(20); // 200 pages over 10 days
    expect(pagesNeededPerDay(100, 300, '2026-10-20', TODAY)).toBe(200); // past target: all of it today
    expect(pagesNeededPerDay(300, 300, '2026-11-03', TODAY)).toBeNull();
  });
  it('on track or behind against the target', () => {
    expect(verdict({ current: 100, total: 300, target: '2026-11-10', pace: 20, today: TODAY })).toBe('on_track');
    expect(verdict({ current: 100, total: 300, target: '2026-10-30', pace: 20, today: TODAY })).toBe('behind');
    expect(verdict({ current: 100, total: 300, target: null, pace: 20, today: TODAY })).toBe('no_target');
    expect(verdict({ current: 100, total: 300, target: '2026-11-10', pace: 0, today: TODAY })).toBe('no_pace');
    expect(verdict({ current: 300, total: 300, target: '2026-11-10', pace: 0, today: TODAY })).toBe('finished');
  });
  it('clamps pages', () => {
    expect(clampPage(-5, 300)).toBe(0);
    expect(clampPage(999, 300)).toBe(300);
    expect(clampPage(12.9, null)).toBe(12);
  });
});
