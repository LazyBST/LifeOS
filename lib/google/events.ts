import 'server-only';
import type { calendar_v3 } from 'googleapis';
import { admin } from '@/lib/supabase/admin';
import { calendarApi, httpStatus } from './calendar';
import { hasCalendarWriteScope } from './auth';
import { eventToCacheRow, rowToInput, toGoogleBody, validateEvent, type CacheRow, type EventInput } from './events-math';
import { upsertCacheRow, pollCalendar } from './sync';

const PRIMARY = 'primary';

async function requireWrite(): Promise<void> {
  if (!(await hasCalendarWriteScope())) {
    throw new Error('Editing your calendar needs full Google Calendar access. In Settings, disconnect Google and connect again.');
  }
}

async function cached(id: string): Promise<CacheRow> {
  const { data, error } = await admin().from('calendar_events').select('*').eq('google_event_id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That event is not in the synced calendar any more. Refresh and try again.');
  return data as CacheRow;
}

async function log(op: 'create' | 'update' | 'delete', id: string, before: unknown, after: unknown): Promise<number | null> {
  const { data } = await admin().from('calendar_edit_log').insert({ op, google_event_id: id, before: before ?? null, after: after ?? null }).select('id').single();
  return (data?.id as number | undefined) ?? null;
}

const friendly = (e: unknown): Error => {
  const st = httpStatus(e);
  if (st === 412) return new Error('This event changed on Google Calendar since you opened it. It has been refreshed; try again.');
  if (st === 403) return new Error('Google would not let LifeOS change this event (you may not be its organiser).');
  if (st === 404 || st === 410) return new Error('That event no longer exists on Google Calendar.');
  return e instanceof Error ? e : new Error(String(e));
};

export type EditResult = { id: string; logId: number | null };

export async function createPrimaryEvent(input: EventInput): Promise<EditResult> {
  const bad = validateEvent(input);
  if (bad) throw new Error(bad);
  await requireWrite();
  try {
    const { data } = await (await calendarApi()).events.insert({ calendarId: PRIMARY, requestBody: toGoogleBody(input) });
    const row = eventToCacheRow(data);
    if (!row) throw new Error('Google returned an unusable event.');
    await upsertCacheRow(row);
    return { id: row.google_event_id, logId: await log('create', row.google_event_id, null, rowToInput(row)) };
  } catch (e) { throw friendly(e); }
}

/** Updates only if the event is unchanged on Google since the cached copy (If-Match on the etag). */
export async function updatePrimaryEvent(id: string, input: EventInput): Promise<EditResult> {
  const bad = validateEvent(input);
  if (bad) throw new Error(bad);
  await requireWrite();
  const before = await cached(id);
  if (!before.can_edit) throw new Error('You are not the organiser of this event, so it cannot be edited here.');
  try {
    const opts = before.etag ? { headers: { 'If-Match': before.etag } } : undefined;
    const { data } = await (await calendarApi()).events.patch({ calendarId: PRIMARY, eventId: id, requestBody: toGoogleBody(input) }, opts);
    const row = eventToCacheRow(data);
    if (row) await upsertCacheRow(row);
    return { id, logId: await log('update', id, rowToInput(before), row ? rowToInput(row) : input) };
  } catch (e) {
    if (httpStatus(e) === 412) await pollCalendar().catch(() => undefined); // pull the newer version before reporting
    throw friendly(e);
  }
}

export async function deletePrimaryEvent(id: string): Promise<EditResult> {
  await requireWrite();
  const before = await cached(id);
  if (!before.can_edit) throw new Error('You are not the organiser of this event, so it cannot be deleted here.');
  try {
    const opts = before.etag ? { headers: { 'If-Match': before.etag } } : undefined;
    await (await calendarApi()).events.delete({ calendarId: PRIMARY, eventId: id }, opts);
  } catch (e) {
    if (httpStatus(e) === 412) await pollCalendar().catch(() => undefined);
    const st = httpStatus(e);
    if (st !== 404 && st !== 410) throw friendly(e);
  }
  await admin().from('calendar_events').delete().eq('google_event_id', id);
  return { id, logId: await log('delete', id, rowToInput(before), null) };
}

/** Reverses one logged edit: a create is deleted, an update restored, a delete re-created. */
export async function undoEdit(logId: number): Promise<string> {
  await requireWrite();
  const { data } = await admin().from('calendar_edit_log').select('*').eq('id', logId).maybeSingle();
  if (!data || data.undone_at) throw new Error('Nothing to undo.');
  const api = await calendarApi();
  let msg = '';
  if (data.op === 'create') {
    await api.events.delete({ calendarId: PRIMARY, eventId: data.google_event_id }).catch((e) => { if (![404, 410].includes(httpStatus(e) ?? 0)) throw friendly(e); });
    await admin().from('calendar_events').delete().eq('google_event_id', data.google_event_id);
    msg = 'Removed the event you created.';
  } else if (data.op === 'update') {
    const { data: ev } = await api.events.patch({ calendarId: PRIMARY, eventId: data.google_event_id, requestBody: toGoogleBody(data.before as EventInput) });
    const row = eventToCacheRow(ev as calendar_v3.Schema$Event);
    if (row) await upsertCacheRow(row);
    msg = 'Restored the event to how it was.';
  } else {
    const { data: ev } = await api.events.insert({ calendarId: PRIMARY, requestBody: toGoogleBody(data.before as EventInput) });
    const row = eventToCacheRow(ev as calendar_v3.Schema$Event);
    if (row) await upsertCacheRow(row);
    msg = 'Brought the deleted event back.';
  }
  await admin().from('calendar_edit_log').update({ undone_at: new Date().toISOString() }).eq('id', logId);
  return msg;
}
