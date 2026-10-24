// Pure conversions between our event shape and Google's, so edits are unit-tested before they touch a real calendar.
import type { calendar_v3 } from 'googleapis';
import { addDays } from '@/lib/time';

export const CAL_TZ = 'Asia/Kolkata';

export type EventInput = {
  summary: string;
  /** timed: ISO instants. all-day: 'YYYY-MM-DD' dates, with `end` the LAST day (inclusive) */
  start: string;
  end: string;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
};

export function validateEvent(i: EventInput): string | null {
  if (!i.summary.trim()) return 'Give the event a title.';
  if (i.allDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.start) || !/^\d{4}-\d{2}-\d{2}$/.test(i.end)) return 'Pick valid dates.';
    if (i.end < i.start) return 'The end date is before the start date.';
    return null;
  }
  const s = Date.parse(i.start), e = Date.parse(i.end);
  if (Number.isNaN(s) || Number.isNaN(e)) return 'Pick valid times.';
  if (e <= s) return 'The event must end after it starts.';
  return null;
}

/** Google all-day events end on the day AFTER the last day. */
export function toGoogleBody(i: EventInput): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = { summary: i.summary.trim() };
  if (i.allDay) {
    body.start = { date: i.start };
    body.end = { date: addDays(i.end, 1) };
  } else {
    body.start = { dateTime: new Date(i.start).toISOString(), timeZone: CAL_TZ };
    body.end = { dateTime: new Date(i.end).toISOString(), timeZone: CAL_TZ };
  }
  if (i.description !== undefined) body.description = i.description ?? '';
  if (i.location !== undefined) body.location = i.location ?? '';
  return body;
}

export type CacheRow = {
  google_event_id: string;
  summary: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  updated_at: string | null;
  etag: string | null;
  description: string | null;
  location: string | null;
  recurring: boolean;
  can_edit: boolean;
  html_link: string | null;
};

/** The calendar_events row for a Google event; null for cancelled or start-less events. */
export function eventToCacheRow(e: calendar_v3.Schema$Event): CacheRow | null {
  if (!e.id || e.status === 'cancelled') return null;
  const starts = e.start?.dateTime ?? e.start?.date ?? null;
  if (!starts) return null;
  return {
    google_event_id: e.id,
    summary: e.summary ?? null,
    starts_at: starts,
    ends_at: e.end?.dateTime ?? e.end?.date ?? null,
    all_day: !e.start?.dateTime,
    updated_at: e.updated ?? null,
    etag: e.etag ?? null,
    description: e.description ?? null,
    location: e.location ?? null,
    recurring: !!e.recurringEventId,
    // attendees can only edit events the organiser lets them modify
    can_edit: !!(e.organizer?.self || e.creator?.self || e.guestsCanModify) && e.eventType !== 'birthday',
    html_link: e.htmlLink ?? null,
  };
}

/** The editable fields of a cached row, as an EventInput (all-day end made inclusive). */
export function rowToInput(r: Pick<CacheRow, 'summary' | 'starts_at' | 'ends_at' | 'all_day' | 'description' | 'location'>): EventInput {
  if (r.all_day) {
    const start = r.starts_at.slice(0, 10);
    const endExcl = (r.ends_at ?? r.starts_at).slice(0, 10);
    return { summary: r.summary ?? '', start, end: endExcl > start ? addDays(endExcl, -1) : start, allDay: true, description: r.description, location: r.location };
  }
  return { summary: r.summary ?? '', start: r.starts_at, end: r.ends_at ?? r.starts_at, allDay: false, description: r.description, location: r.location };
}
