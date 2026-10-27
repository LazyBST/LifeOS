import { describe, expect, it } from 'vitest';
import { applyShow } from '@/lib/domain/calendar-view';
import type { WeekData } from '@/lib/domain/calweek';

const blk = (id: string, kind: 'event' | 'task' | 'habit', end: string, extra: Record<string, unknown> = {}) => ({ id, title: id, start: end, end, kind, ...extra });
const data = {
  weekStart: '2026-10-26',
  blocks: [
    blk('ev', 'event', '2026-10-27T05:00:00Z'),
    blk('doneTask', 'task', '2026-10-27T05:00:00Z', { done: true }),
    blk('pastTask', 'task', '2026-10-27T05:00:00Z'),
    blk('laterTask', 'task', '2026-10-27T15:00:00Z'),
    blk('missedHabit', 'habit', '2026-10-27T15:00:00Z', { habit: { id: 'h', date: '2026-10-27', emoji: null, missed: true, skipped: false } }),
  ],
  allDay: [], bars: [], sync: null,
  untimed: [
    { kind: 'task', id: 'a', title: 'a', date: '2026-10-27', done: true },
    { kind: 'task', id: 'b', title: 'b', date: '2026-10-20', done: false },
    { kind: 'habit', id: 'c', title: 'c', date: '2026-10-28', done: false },
  ],
} as unknown as WeekData;
const ids = (d: WeekData) => d.blocks.map((b) => b.id);

describe('applyShow', () => {
  const now = '2026-10-27T10:00:00Z';
  it('everything is untouched', () => expect(applyShow(data, 'all', '2026-10-27', now)).toBe(data));
  it('only completed keeps events and finished items', () => {
    const d = applyShow(data, 'done', '2026-10-27', now);
    expect(ids(d)).toEqual(['ev', 'doneTask']);
    expect(d.untimed.map((u) => u.id)).toEqual(['a']);
  });
  it('hide not done / missed drops what slipped and keeps what is still ahead', () => {
    const d = applyShow(data, 'hide-missed', '2026-10-27', now);
    expect(ids(d)).toEqual(['ev', 'doneTask', 'laterTask']);
    expect(d.untimed.map((u) => u.id)).toEqual(['a', 'c']);
  });
});
