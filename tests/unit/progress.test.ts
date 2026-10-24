import { describe, it, expect } from 'vitest';
import { progressPct, remainingHours, velocityFor, forecast, habitStreak } from '@/lib/domain/progress';

describe('progressPct', () => {
  it('is effort-weighted, not task-count-weighted', () => {
    expect(progressPct({ done_min: 600, total_min: 1000 })).toBe(60);
  });

  it('is 0 when total is 0 (no division by zero)', () => {
    expect(progressPct({ done_min: 0, total_min: 0 })).toBe(0);
  });
});

describe('remainingHours', () => {
  it('converts minutes to hours rounded to one decimal', () => {
    expect(remainingHours(400)).toBe(6.7);
    expect(remainingHours(60)).toBe(1);
    expect(remainingHours(0)).toBe(0);
  });
});

describe('velocityFor', () => {
  it('uses the goal velocity when it has completions', () => {
    expect(velocityFor(50, 200)).toEqual({ velocity: 50, rough: false });
  });

  it('falls back to 0.25 x global velocity, marked rough, when the goal has none', () => {
    expect(velocityFor(null, 200)).toEqual({ velocity: 50, rough: true });
    expect(velocityFor(0, 200)).toEqual({ velocity: 50, rough: true });
    expect(velocityFor(undefined, 200)).toEqual({ velocity: 50, rough: true });
  });
});

describe('forecast', () => {
  // Hand-computed worked example:
  // done 600, total 1000 -> remaining 400, progress 60%.
  // velocity 50 min/day -> projected days = ceil(400/50) = 8.
  // today + 8 days is the projected date; on track against a target 10 days
  // out, not on track against one 3 days out.
  const today = '2026-10-24';
  const input = { done_min: 600, total_min: 1000, remaining_min: 400, unestimated: 2 };

  it('computes progress, remaining hours, velocity and projected days/date', () => {
    const f = forecast(input, { goalVelocity: 50, globalVelocity: 200, today });
    expect(f.progressPct).toBe(60);
    expect(f.remainingHours).toBe(6.7);
    expect(f.velocity).toBe(50);
    expect(f.rough).toBe(false);
    expect(f.projectedDays).toBe(8);
    expect(f.projectedDate).toBe('2026-11-01');
    expect(f.unestimated).toBe(2);
  });

  it('is on track when the target date is on or after the projected date', () => {
    const f = forecast(input, {
      goalVelocity: 50,
      globalVelocity: 200,
      today,
      targetDate: '2026-11-03', // today + 10
    });
    expect(f.onTrack).toBe(true);
  });

  it('is not on track when the target date is before the projected date', () => {
    const f = forecast(input, {
      goalVelocity: 50,
      globalVelocity: 200,
      today,
      targetDate: '2026-10-27', // today + 3
    });
    expect(f.onTrack).toBe(false);
  });

  it('onTrack is null when there is no target date', () => {
    const f = forecast(input, { goalVelocity: 50, globalVelocity: 200, today });
    expect(f.onTrack).toBeNull();
  });

  it('falls back to rough velocity when the goal has no completions', () => {
    const f = forecast(input, { goalVelocity: null, globalVelocity: 200, today });
    expect(f.velocity).toBe(50); // 0.25 * 200
    expect(f.rough).toBe(true);
    expect(f.projectedDays).toBe(8);
  });

  it('projectedDays/Date are null when velocity is 0', () => {
    const f = forecast(input, { goalVelocity: null, globalVelocity: 0, today });
    expect(f.velocity).toBe(0);
    expect(f.projectedDays).toBeNull();
    expect(f.projectedDate).toBeNull();
    expect(f.onTrack).toBeNull();
  });
});

describe('habitStreak', () => {
  const target = 1;

  it('a day the habit was not due neither extends nor breaks the streak', () => {
    // Due Mon-Fri (isoDow 1-5). today = Mon 2026-10-26.
    // Checked in Fri 10-23, Thu 10-22; weekend 10-24/25 not due and skipped.
    const streak = habitStreak({
      today: '2026-10-26',
      daysOfWeek: [1, 2, 3, 4, 5],
      target,
      checkins: {
        '2026-10-26': 1, // Mon, today
        '2026-10-23': 1, // Fri
        '2026-10-22': 1, // Thu
      },
    });
    expect(streak.current).toBe(3);
  });

  it('a missed due day breaks the streak', () => {
    const streak = habitStreak({
      today: '2026-10-26',
      daysOfWeek: [1, 2, 3, 4, 5],
      target,
      checkins: {
        '2026-10-26': 1, // Mon, today: met
        // Fri 10-23 due but missing -> breaks before it is counted
        '2026-10-22': 1, // Thu
      },
    });
    expect(streak.current).toBe(1);
  });

  it('today not yet checked in does not break the current streak', () => {
    const streak = habitStreak({
      today: '2026-10-26',
      daysOfWeek: [1, 2, 3, 4, 5],
      target,
      checkins: {
        // today (Mon 10-26) absent
        '2026-10-23': 1, // Fri
        '2026-10-22': 1, // Thu
      },
    });
    expect(streak.current).toBe(2);
  });

  it('longest is at least current', () => {
    const streak = habitStreak({
      today: '2026-10-26',
      daysOfWeek: null, // due every day
      target,
      checkins: {
        '2026-10-26': 1,
        '2026-10-25': 1,
        '2026-10-24': 1,
        '2026-10-20': 1,
        '2026-10-19': 1,
        '2026-10-18': 1,
        '2026-10-17': 1,
        '2026-10-16': 0,
      },
    });
    expect(streak.current).toBe(3);
    expect(streak.longest).toBeGreaterThanOrEqual(streak.current);
    expect(streak.longest).toBe(4);
  });
});
