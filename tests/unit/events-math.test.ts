import { describe, expect, it } from 'vitest';
import { eventToCacheRow, rowToInput, toGoogleBody, validateEvent } from '@/lib/google/events-math';

describe('calendar event conversion', () => {
  it('validates before anything reaches Google', () => {
    expect(validateEvent({ summary: ' ', start: '2026-10-25T10:00:00Z', end: '2026-10-25T11:00:00Z' })).toMatch(/title/);
    expect(validateEvent({ summary: 'x', start: '2026-10-25T11:00:00Z', end: '2026-10-25T10:00:00Z' })).toMatch(/end after/);
    expect(validateEvent({ summary: 'x', start: '2026-10-26', end: '2026-10-25', allDay: true })).toMatch(/before/);
    expect(validateEvent({ summary: 'x', start: '2026-10-25T10:00:00Z', end: '2026-10-25T11:00:00Z' })).toBeNull();
  });
  it('timed events use instants with the IST zone', () => {
    const b = toGoogleBody({ summary: ' Standup ', start: '2026-10-25T04:00:00.000Z', end: '2026-10-25T04:30:00.000Z' });
    expect(b.summary).toBe('Standup');
    expect(b.start).toEqual({ dateTime: '2026-10-25T04:00:00.000Z', timeZone: 'Asia/Kolkata' });
  });
  it('all-day events end the day after their last day', () => {
    const b = toGoogleBody({ summary: 'Trip', start: '2026-10-25', end: '2026-10-27', allDay: true });
    expect(b.start).toEqual({ date: '2026-10-25' });
    expect(b.end).toEqual({ date: '2026-10-28' });
  });
  it('round-trips an all-day event through the cache row', () => {
    const row = eventToCacheRow({ id: 'e', etag: '"1"', summary: 'Trip', start: { date: '2026-10-25' }, end: { date: '2026-10-28' }, organizer: { self: true } })!;
    expect(row.all_day).toBe(true);
    expect(rowToInput(row)).toMatchObject({ start: '2026-10-25', end: '2026-10-27', allDay: true });
  });
  it('skips cancelled events and marks other people\'s events read-only', () => {
    expect(eventToCacheRow({ id: 'x', status: 'cancelled' })).toBeNull();
    const r = eventToCacheRow({ id: 'y', start: { dateTime: '2026-10-25T10:00:00Z' }, end: { dateTime: '2026-10-25T11:00:00Z' }, organizer: { self: false }, creator: { self: false } })!;
    expect(r.can_edit).toBe(false);
    expect(r.recurring).toBe(false);
  });
});
