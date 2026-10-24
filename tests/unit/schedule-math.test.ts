import { describe, expect, it } from 'vitest';
import { dayScore, habitOutcome, scheduledDays, taskOutcomes } from '@/lib/domain/schedule-math';

const TODAY = '2026-10-25';
const base = { status: 'todo', due_date: '2026-10-22', completed_day: null, changes: [] as { old_date: string | null; new_date: string | null }[] };

describe('task outcomes per scheduled day', () => {
  it('finished on or before its day is done on that day', () => {
    expect(taskOutcomes({ ...base, status: 'done', completed_day: '2026-10-22' }, TODAY)).toEqual([{ date: '2026-10-22', outcome: 'done' }]);
    expect(taskOutcomes({ ...base, status: 'done', completed_day: '2026-10-20' }, TODAY)).toEqual([{ date: '2026-10-22', outcome: 'done' }]);
  });
  it('left open or finished late counts as pushed on its day', () => {
    expect(taskOutcomes(base, TODAY)).toEqual([{ date: '2026-10-22', outcome: 'pushed' }]);
    expect(taskOutcomes({ ...base, status: 'done', completed_day: '2026-10-24' }, TODAY)).toEqual([{ date: '2026-10-22', outcome: 'pushed' }]);
  });
  it('a task moved to another day is pushed on the day it left, and judged on the new day', () => {
    const t = { ...base, due_date: '2026-10-24', changes: [{ old_date: '2026-10-22', new_date: '2026-10-24' }], status: 'done', completed_day: '2026-10-24' };
    expect(scheduledDays(t)).toEqual(['2026-10-22', '2026-10-24']);
    expect(taskOutcomes(t, TODAY)).toEqual([{ date: '2026-10-22', outcome: 'pushed' }, { date: '2026-10-24', outcome: 'done' }]);
  });
  it('pushed twice leaves two pushed days', () => {
    const t = { ...base, due_date: '2026-10-25', changes: [{ old_date: '2026-10-22', new_date: '2026-10-23' }, { old_date: '2026-10-23', new_date: '2026-10-25' }] };
    expect(taskOutcomes(t, TODAY).map((o) => o.outcome)).toEqual(['pushed', 'pushed', 'pending']);
  });
  it('today open is pending, future days are not counted', () => {
    expect(taskOutcomes({ ...base, due_date: TODAY }, TODAY)).toEqual([{ date: TODAY, outcome: 'pending' }]);
    expect(taskOutcomes({ ...base, due_date: '2026-10-30' }, TODAY)).toEqual([]);
  });
  it('a task with no history uses its original deadline', () => {
    expect(scheduledDays({ due_date: '2026-10-24', original_due_date: '2026-10-22', changes: [] })).toEqual(['2026-10-22', '2026-10-24']);
  });
});

describe('habit outcomes', () => {
  it('done, explicitly missed, missed by omission, pending today, future', () => {
    expect(habitOutcome(1, 1, '2026-10-24', TODAY)).toBe('done');
    expect(habitOutcome(-1, 1, TODAY, TODAY)).toBe('pushed'); // marked missed early in the day
    expect(habitOutcome(undefined, 1, '2026-10-24', TODAY)).toBe('pushed');
    expect(habitOutcome(undefined, 1, TODAY, TODAY)).toBe('pending');
    expect(habitOutcome(0, 3, '2026-10-24', TODAY)).toBe('pushed');
    expect(habitOutcome(undefined, 1, '2026-10-26', TODAY)).toBeNull();
  });
});

describe('day score: (done − pushed) / scheduled', () => {
  it('weighs a push as −1', () => {
    expect(dayScore({ total: 4, done: 4, pushed: 0 })).toBe(1);
    expect(dayScore({ total: 4, done: 3, pushed: 1 })).toBe(0.5);
    expect(dayScore({ total: 4, done: 1, pushed: 3 })).toBe(0); // never below zero
    expect(dayScore({ total: 0, done: 0, pushed: 0 })).toBeNull();
    expect(dayScore(undefined)).toBeNull();
  });
});
