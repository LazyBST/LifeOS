import 'server-only';
import { google, calendar_v3 } from 'googleapis';
import { admin } from '@/lib/supabase/admin';
import { authedClient } from './auth';

const LIFEOS_CALENDAR_SUMMARY = 'LifeOS';
const PRIMARY_CALENDAR_ID = 'primary';

type CalendarRole = 'lifeos_rw' | 'primary_ro';
type CalendarRow = {
  google_calendar_id: string;
  role: CalendarRole;
  sync_token: string | null;
};

async function client(): Promise<calendar_v3.Calendar> {
  const auth = await authedClient();
  return google.calendar({ version: 'v3', auth });
}

async function getCalendarRow(role: CalendarRole): Promise<CalendarRow | null> {
  const { data } = await admin().from('gcal_calendars').select('*').eq('role', role).maybeSingle();
  return (data as CalendarRow) ?? null;
}

/** Finds the stored `lifeos_rw` calendar, or creates the "LifeOS" calendar
 * on first connect and stores its id (spec section 9 setup step 5). */
export async function ensureLifeosCalendar(): Promise<string> {
  const existing = await getCalendarRow('lifeos_rw');
  if (existing) return existing.google_calendar_id;

  const cal = await client();
  const { data } = await cal.calendars.insert({
    requestBody: { summary: LIFEOS_CALENDAR_SUMMARY, timeZone: 'Asia/Kolkata' },
  });
  const id = data.id;
  if (!id) throw new Error('Google did not return an id for the new LifeOS calendar');

  const { error } = await admin().from('gcal_calendars').insert({ google_calendar_id: id, role: 'lifeos_rw' });
  if (error) throw new Error(`gcal_calendars: ${error.message}`);
  return id;
}

/** Stores a `primary_ro` row pointing at the special "primary" calendar id. */
export async function ensurePrimaryCached(): Promise<string> {
  const existing = await getCalendarRow('primary_ro');
  if (existing) return existing.google_calendar_id;

  const { error } = await admin()
    .from('gcal_calendars')
    .insert({ google_calendar_id: PRIMARY_CALENDAR_ID, role: 'primary_ro' });
  if (error) throw new Error(`gcal_calendars: ${error.message}`);
  return PRIMARY_CALENDAR_ID;
}

export async function insertEvent(
  calendarId: string,
  body: calendar_v3.Schema$Event,
): Promise<calendar_v3.Schema$Event> {
  const cal = await client();
  const { data } = await cal.events.insert({ calendarId, requestBody: body });
  return data;
}

export async function patchEvent(
  calendarId: string,
  eventId: string,
  body: calendar_v3.Schema$Event,
): Promise<calendar_v3.Schema$Event> {
  const cal = await client();
  const { data } = await cal.events.patch({ calendarId, eventId, requestBody: body });
  return data;
}

/** Idempotent: a 404/410 (already gone) is treated as success. */
export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  const cal = await client();
  try {
    await cal.events.delete({ calendarId, eventId });
  } catch (err) {
    const status = httpStatus(err);
    if (status === 404 || status === 410) return;
    throw err;
  }
}

export type ListEventsResult = {
  events: calendar_v3.Schema$Event[];
  nextSyncToken: string | null;
};

/**
 * Lists events, following pagination to the end. Pass `syncToken` for an
 * incremental sync (Google rejects combining it with `timeMin`/`timeMax`,
 * so those are only sent when there is no token). Throws the underlying
 * Google API error on HTTP 410 (expired sync token) so the caller can do a
 * full resync.
 */
export async function listEvents(opts: {
  calendarId: string;
  syncToken?: string | null;
  timeMin?: string;
  timeMax?: string;
}): Promise<ListEventsResult> {
  const cal = await client();
  const events: calendar_v3.Schema$Event[] = [];
  let nextSyncToken: string | null = null;
  let pageToken: string | undefined;

  do {
    const { data } = await cal.events.list({
      calendarId: opts.calendarId,
      showDeleted: true,
      singleEvents: true,
      ...(opts.syncToken
        ? { syncToken: opts.syncToken }
        : { timeMin: opts.timeMin, timeMax: opts.timeMax }),
      pageToken,
    });
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? undefined;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

export function httpStatus(err: unknown): number | undefined {
  const e = err as { status?: number; code?: number | string; response?: { status?: number } };
  if (typeof e?.status === 'number') return e.status;
  if (typeof e?.response?.status === 'number') return e.response.status;
  if (typeof e?.code === 'number') return e.code;
  return undefined;
}
