import { describe, expect, it } from 'vitest';
import { moodStats, moodTrend } from '@/lib/domain/journal-math';

describe('journal mood math', () => {
  const e = [
    { entry_date: '2026-01-02', mood: 2 },
    { entry_date: '2026-01-01', mood: 4 },
    { entry_date: '2026-02-01', mood: 5 },
    { entry_date: '2026-02-02', mood: null },
  ];
  it('orders by date and averages the trailing window', () => {
    const t = moodTrend(e);
    expect(t.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-02', '2026-02-01']);
    expect(t[1].avg7).toBe(3);
  });
  it('summarises months, extremes and distribution', () => {
    const s = moodStats(e);
    expect(s.count).toBe(3);
    expect(s.monthly).toEqual([{ month: '2026-01', average: 3, count: 2 }, { month: '2026-02', average: 5, count: 1 }]);
    expect(s.best?.date).toBe('2026-02-01');
    expect(s.worst?.date).toBe('2026-01-02');
    expect(s.distribution).toEqual([0, 1, 0, 1, 1]);
  });
});
