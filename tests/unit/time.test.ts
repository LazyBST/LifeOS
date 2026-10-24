// lib/time.ts is timezone-independent: istParts/istInstant do their
// arithmetic in UTC with a fixed +05:30 offset, and parseDateIST passes an
// explicit IST reference to chrono. These tests therefore pass under any
// host timezone; CI runs them under several.

import { describe, it, expect } from 'vitest';
import {
  istDate,
  istParts,
  istInstant,
  addDays,
  daysBetween,
  parseDateIST,
  formatDate,
  dueLabel,
  isOverdue,
} from '@/lib/time';

describe('istParts / istDate', () => {
  it('rolls over to the next calendar day in IST when UTC is still on the previous day', () => {
    // 2026-10-24T19:30:00Z is 2026-10-25 01:00 IST (+05:30).
    const at = new Date('2026-10-24T19:30:00Z');
    const parts = istParts(at);
    expect(parts.date).toBe('2026-10-25');
    expect(parts.time).toBe('01:00');
    expect(parts.hour).toBe(1);
    expect(parts.minute).toBe(0);
    expect(istDate(at)).toBe('2026-10-25');
    // 2026-10-25 is a Sunday -> isoDow 7.
    expect(parts.isoDow).toBe(7);
  });

  it('matches the UTC day when there is no rollover', () => {
    const at = new Date('2026-10-24T03:00:00Z'); // 08:30 IST, still the 24th
    const parts = istParts(at);
    expect(parts.date).toBe('2026-10-24');
    expect(parts.time).toBe('08:30');
  });
});

describe('istInstant', () => {
  it('round-trips an IST wall-clock date and time to the right UTC instant (+05:30)', () => {
    const at = istInstant('2026-10-25', '16:00');
    expect(at.toISOString()).toBe('2026-10-25T10:30:00.000Z');
    // And it round-trips back through istParts.
    expect(istParts(at)).toMatchObject({ date: '2026-10-25', time: '16:00' });
  });

  it('defaults the time to midnight IST', () => {
    const at = istInstant('2026-01-01');
    expect(at.toISOString()).toBe('2025-12-31T18:30:00.000Z');
  });
});

describe('addDays / daysBetween across a month boundary', () => {
  it('addDays rolls January into February', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('daysBetween counts across the boundary both ways', () => {
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
    expect(daysBetween('2026-02-02', '2026-01-30')).toBe(-3);
  });

  it('daysBetween is zero for the same date', () => {
    expect(daysBetween('2026-10-24', '2026-10-24')).toBe(0);
  });
});

describe('parseDateIST', () => {
  // Pinned "now": 2026-10-24T10:00:00Z == 2026-10-24 15:30 IST.
  const now = new Date('2026-10-24T10:00:00Z');

  it('"tomorrow 4pm" resolves to the right IST date, hasTime, and instant', () => {
    const parsed = parseDateIST('tomorrow 4pm', now);
    expect(parsed).not.toBeNull();
    expect(parsed!.date).toBe('2026-10-25');
    expect(parsed!.hasTime).toBe(true);
    expect(parsed!.at).toBe(istInstant('2026-10-25', '16:00').toISOString());
    expect(parsed!.at).toBe('2026-10-25T10:30:00.000Z');
  });

  it('"next Friday" has no time and a null instant', () => {
    const parsed = parseDateIST('next Friday', now);
    expect(parsed).not.toBeNull();
    expect(parsed!.hasTime).toBe(false);
    expect(parsed!.at).toBeNull();
    // 24 Oct 2026 is a Saturday, so the next Friday is 30 Oct 2026.
    expect(parsed!.date).toBe('2026-10-30');
  });

  it('returns null when there is nothing date-like', () => {
    expect(parseDateIST('no date here', now)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseDateIST('', now)).toBeNull();
    expect(parseDateIST('   ', now)).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats as "D Mon YYYY"', () => {
    expect(formatDate('2026-10-25')).toBe('25 Oct 2026');
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
  });
});

describe('dueLabel / isOverdue', () => {
  const today = '2026-10-24';

  it('labels today, tomorrow and yesterday', () => {
    expect(dueLabel('2026-10-24', today)).toBe('Today');
    expect(dueLabel('2026-10-25', today)).toBe('Tomorrow');
    expect(dueLabel('2026-10-23', today)).toBe('Yesterday');
  });

  it('falls back to a short date within the same year', () => {
    expect(dueLabel('2026-12-05', today)).toBe('5 Dec');
  });

  it('includes the year when it differs from today', () => {
    expect(dueLabel('2027-01-05', today)).toBe('5 Jan 2027');
  });

  it('returns null for a null date', () => {
    expect(dueLabel(null, today)).toBeNull();
  });

  it('isOverdue is true only for dates strictly before today', () => {
    expect(isOverdue('2026-10-23', today)).toBe(true);
    expect(isOverdue('2026-10-24', today)).toBe(false);
    expect(isOverdue('2026-10-25', today)).toBe(false);
    expect(isOverdue(null, today)).toBe(false);
  });
});
