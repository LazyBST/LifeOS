import { describe, expect, it } from 'vitest';
import { markOf, nextMark } from '@/lib/domain/habit-state';
import { habitOutcome } from '@/lib/domain/schedule-math';

describe('the one circle', () => {
  it('cycles none, done, missed, skipped and back to none', () => {
    let m = markOf(undefined, 1);
    const seen = [m];
    for (let i = 0; i < 4; i++) { m = nextMark(m); seen.push(m); }
    expect(seen).toEqual(['none', 'done', 'missed', 'skipped', 'none']);
  });
  it('reads a stored value', () => {
    expect(markOf(1, 1)).toBe('done');
    expect(markOf(-1, 1)).toBe('missed');
    expect(markOf(-2, 1)).toBe('skipped');
    expect(markOf(0, 1)).toBe('none');
    expect(markOf(3, 5)).toBe('none'); // a count that has not reached its target yet
  });
  it('a skipped day has no outcome, so it does not move the day score', () => {
    expect(habitOutcome(-2, 1, '2026-10-20', '2026-10-28')).toBeNull();
    expect(habitOutcome(-1, 1, '2026-10-20', '2026-10-28')).toBe('pushed');
  });
});
