// Pure scheduling logic from Part 2 (spec section 8).
import { describe, expect, it } from 'vitest';
import { nextOccurrence } from '@/lib/domain/reminders';
import { habitDueOn } from '@/lib/domain/habits';
import { inQuietHours } from '@/lib/notify';
import { istInstant } from '@/lib/time';

describe('nextOccurrence', () => {
  const at = '2026-10-24T10:00:00.000Z'; // a Saturday in IST (15:30 IST)

  it('returns null for a one-off reminder', () => {
    expect(nextOccurrence(at, null)).toBeNull();
  });

  it('daily adds one day', () => {
    expect(nextOccurrence(at, 'daily')).toBe('2026-10-25T10:00:00.000Z');
  });

  it('weekly adds seven days', () => {
    expect(nextOccurrence(at, 'weekly')).toBe('2026-10-31T10:00:00.000Z');
  });

  it('weekdays skips the weekend in IST', () => {
    // 2026-10-23 is a Friday in IST; the next weekday occurrence is Monday
    const friday = '2026-10-23T10:00:00.000Z';
    expect(nextOccurrence(friday, 'weekdays')).toBe('2026-10-26T10:00:00.000Z');
  });
});

describe('habitDueOn', () => {
  it('a habit with no days is due every day', () => {
    expect(habitDueOn({ days_of_week: null }, '2026-10-25')).toBe(true);
    expect(habitDueOn({ days_of_week: [] }, '2026-10-25')).toBe(true);
  });

  it('matches ISO weekdays, 1 = Monday .. 7 = Sunday', () => {
    // 2026-10-26 is a Monday, 2026-10-25 a Sunday
    expect(habitDueOn({ days_of_week: [1] }, '2026-10-26')).toBe(true);
    expect(habitDueOn({ days_of_week: [1] }, '2026-10-25')).toBe(false);
    expect(habitDueOn({ days_of_week: [7] }, '2026-10-25')).toBe(true);
  });
});

describe('inQuietHours (22:30-07:00 IST)', () => {
  const at = (date: string, time: string) => istInstant(date, time);

  it('is quiet at 23:00 and 06:00 IST', () => {
    expect(inQuietHours(at('2026-10-24', '23:00'))).toBe(true);
    expect(inQuietHours(at('2026-10-24', '06:00'))).toBe(true);
    expect(inQuietHours(at('2026-10-24', '22:30'))).toBe(true);
  });

  it('is not quiet at 07:00, 12:00 or 22:29 IST', () => {
    expect(inQuietHours(at('2026-10-24', '07:00'))).toBe(false);
    expect(inQuietHours(at('2026-10-24', '12:00'))).toBe(false);
    expect(inQuietHours(at('2026-10-24', '22:29'))).toBe(false);
  });
});
