import 'server-only';
import type { calendar_v3 } from 'googleapis';
import { admin } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { notify } from '@/lib/notify';
import { getTask, createTask, updateTask } from '@/lib/domain/tasks';
import type { Task } from '@/lib/types/db';
import { isConfigured, authedClient } from './auth';
import {
  ensureLifeosCalendar,
  ensurePrimaryCached,
  insertEvent,
  patchEvent,
  deleteEvent,
  listEvents,
  httpStatus,
} from './calendar';
import { eventToCacheRow, type CacheRow } from './events-math';
import { addDays, istDate, istInstant } from '@/lib/time';

const MAX_ATTEMPTS = 6;
const DONE_COLOR_ID = '8'; // grey, for a completed task's event (spec section 9)
const OUTBOX_BATCH = 20;
const PRIMARY_CALENDAR_ID = 'primary';
const FULL_RESYNC_PAST_DAYS = 30;
const FULL_RESYNC_FUTURE_DAYS = 31; // a month back and a month ahead is all the app shows

type OutboxRow = {
  id: number;
  task_id: string;
  op: 'upsert' | 'delete';
  attempts: number;
  last_error: string | null;
  enqueued_at: string;
  done_at: string | null;
};

type LinkRow = {
  task_id: string;
  google_calendar_id: string;
  google_event_id: string;
  etag: string | null;
  google_updated_at: string | null;
  local_updated_at: string | null;
  last_synced_at: string | null;
};

/** Google is optional at runtime: callers (the cron tick) must never break
 * because it is unconfigured or the owner hasn't connected an account. */
async function connected(): Promise<boolean> {
  return (await connectionProblem()) === null;
}

/** Why Google cannot be used right now, in words the owner can act on; null when it can. */
export async function connectionProblem(): Promise<string | null> {
  if (!isConfigured()) return 'Google is not set up: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing on the server.';
  try {
    await authedClient();
    return null;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/not connected/i.test(m)) return 'Google is not connected. Open Settings and connect Google Calendar.';
    if (/invalid_grant|revoked|expired/i.test(m)) return 'Google refused the saved access (it was revoked or expired). Open Settings, disconnect and connect again.';
    return `Google sign-in failed: ${m}`;
  }
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
}

function stripDoneMark(summary: string): string {
  return summary.startsWith('✓ ') ? summary.slice(2) : summary;
}

function eventBodyForTask(task: Task): calendar_v3.Schema$Event {
  const start = task.due_at!;
  const durationMin = task.duration_min ?? 30;
  const end = new Date(new Date(start).getTime() + durationMin * 60_000).toISOString();
  const done = task.status === 'done';
  return {
    summary: `${done ? '✓ ' : ''}${task.title}`,
    description: `${env.appUrl}/tasks/${task.id}`,
    start: { dateTime: start },
    end: { dateTime: end },
    colorId: done ? DONE_COLOR_ID : null,
    extendedProperties: { private: { lifeos_task_id: task.id } },
  };
}

/** Exponential backoff gate: attempt N waits roughly 2^N minutes since the
 * row was first enqueued. gcal_outbox has no "next attempt" column, so this
 * is an approximation against `enqueued_at`, good enough against a 10
 * minute cron cadence. */
function backoffReady(row: OutboxRow): boolean {
  if (row.attempts <= 0) return true;
  const waitMs = Math.min(2 ** row.attempts, 24 * 60) * 60_000;
  return Date.now() - new Date(row.enqueued_at).getTime() >= waitMs;
}

async function getLink(taskId: string): Promise<LinkRow | null> {
  const { data } = await admin().from('gcal_links').select('*').eq('task_id', taskId).maybeSingle();
  return (data as LinkRow) ?? null;
}

async function deleteLink(taskId: string): Promise<void> {
  await admin().from('gcal_links').delete().eq('task_id', taskId);
}

/**
 * The write we are about to make (or just made) to a task from a remote
 * Google change will, via the `tasks_gcal_ai` trigger, enqueue a fresh
 * `gcal_outbox` row. Mark it done immediately so `drainOutbox` doesn't push
 * our own remote-origin edit straight back to Google — that is the simplest
 * echo suppression available without a "source" column on tasks.
 */
async function suppressEcho(taskId: string): Promise<void> {
  await admin().from('gcal_outbox').update({ done_at: new Date().toISOString() }).eq('task_id', taskId).is('done_at', null);
}

async function processOutboxRow(row: OutboxRow): Promise<void> {
  const calendarId = await ensureLifeosCalendar();
  const link = await getLink(row.task_id);

  if (row.op === 'delete') {
    if (link) {
      await deleteEvent(calendarId, link.google_event_id);
      await deleteLink(row.task_id);
    }
    return;
  }

  const task = await getTask(row.task_id);
  if (!task || !task.due_at) {
    // the task was hard-deleted, or due_at was cleared again after this row
    // was enqueued: nothing to push, and any stale event should go away.
    if (link) {
      await deleteEvent(calendarId, link.google_event_id).catch(() => undefined);
      await deleteLink(row.task_id);
    }
    return;
  }

  const body = eventBodyForTask(task);
  const now = new Date().toISOString();

  if (!link) {
    const event = await insertEvent(calendarId, body);
    if (!event.id) throw new Error('Google did not return an event id');
    const { error } = await admin().from('gcal_links').insert({
      task_id: task.id,
      google_calendar_id: calendarId,
      google_event_id: event.id,
      etag: event.etag ?? null,
      google_updated_at: event.updated ?? null,
      local_updated_at: now,
      last_synced_at: now,
    });
    if (error) throw new Error(`gcal_links: ${error.message}`);
  } else {
    const event = await patchEvent(calendarId, link.google_event_id, body);
    const { error } = await admin()
      .from('gcal_links')
      .update({
        etag: event.etag ?? null,
        google_updated_at: event.updated ?? null,
        local_updated_at: now,
        last_synced_at: now,
      })
      .eq('task_id', task.id);
    if (error) throw new Error(`gcal_links: ${error.message}`);
  }
}

/** App -> Google. Drains up to 20 un-done outbox rows, oldest first. */
export async function drainOutbox(opts: { onlyDate?: string } = {}): Promise<{ pushed: number; failed: number }> {
  if (!(await connected())) return { pushed: 0, failed: 0 };
  try {
    return await drainOutboxInner(opts);
  } catch (err) {
    // The cron tick must never break because Google (or Supabase) had a bad moment.
    console.error('drainOutbox failed', err instanceof Error ? err.message : err);
    return { pushed: 0, failed: 0 };
  }
}

async function drainOutboxInner(opts: { onlyDate?: string } = {}): Promise<{ pushed: number; failed: number }> {
  const { data, error } = await admin()
    .from('gcal_outbox')
    .select('*')
    .is('done_at', null)
    .order('enqueued_at', { ascending: true })
    .limit(OUTBOX_BATCH);
  if (error) return { pushed: 0, failed: 0 };

  let rows = (data ?? []) as OutboxRow[];
  if (opts.onlyDate && rows.length) {
    // only the tasks that sit on that day
    const from = istInstant(opts.onlyDate, '00:00').toISOString(), to = istInstant(addDays(opts.onlyDate, 1), '00:00').toISOString();
    const { data: ts } = await admin().from('tasks').select('id').in('id', rows.map((r) => r.task_id)).gte('due_at', from).lt('due_at', to);
    const today = new Set(((ts ?? []) as { id: string }[]).map((t) => t.id));
    rows = rows.filter((r) => today.has(r.task_id));
  }
  let pushed = 0;
  let failed = 0;

  for (const row of rows) {
    if (!backoffReady(row)) continue;
    try {
      await processOutboxRow(row);
      await admin().from('gcal_outbox').update({ done_at: new Date().toISOString() }).eq('id', row.id);
      pushed += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      const message = err instanceof Error ? err.message : String(err);
      failed += 1;
      if (attempts >= MAX_ATTEMPTS) {
        await admin()
          .from('gcal_outbox')
          .update({ attempts, last_error: message, done_at: new Date().toISOString() })
          .eq('id', row.id);
        await notify({
          title: 'Google Calendar sync is failing',
          body: `A task could not be synced after ${attempts} attempts: ${message}`,
          tag: 'gcal-sync-failed',
        });
      } else {
        await admin().from('gcal_outbox').update({ attempts, last_error: message }).eq('id', row.id);
      }
    }
  }

  return { pushed, failed };
}

async function getSyncToken(calendarId: string): Promise<string | null> {
  const { data } = await admin().from('gcal_calendars').select('sync_token').eq('google_calendar_id', calendarId).maybeSingle();
  return (data as { sync_token: string | null } | null)?.sync_token ?? null;
}

async function setSyncToken(calendarId: string, token: string | null): Promise<void> {
  await admin().from('gcal_calendars').update({ sync_token: token }).eq('google_calendar_id', calendarId);
}

function fullResyncWindow(): { timeMin: string; timeMax: string } {
  const now = Date.now();
  return {
    timeMin: new Date(now - FULL_RESYNC_PAST_DAYS * 86_400_000).toISOString(),
    timeMax: new Date(now + FULL_RESYNC_FUTURE_DAYS * 86_400_000).toISOString(),
  };
}

/** Lists events for a calendar, transparently doing a full resync on a
 * stale/expired sync token (HTTP 410), as spec section 9 requires. */
async function listEventsResilient(calendarId: string): Promise<{ events: calendar_v3.Schema$Event[]; nextSyncToken: string | null }> {
  const syncToken = await getSyncToken(calendarId);
  try {
    if (syncToken) return await listEvents({ calendarId, syncToken });
    return await listEvents({ calendarId, ...fullResyncWindow() });
  } catch (err) {
    if (httpStatus(err) === 410) {
      await setSyncToken(calendarId, null);
      return await listEvents({ calendarId, ...fullResyncWindow() });
    }
    throw err;
  }
}

async function findLinkByEventId(eventId: string): Promise<LinkRow | null> {
  const { data } = await admin().from('gcal_links').select('*').eq('google_event_id', eventId).maybeSingle();
  return (data as LinkRow) ?? null;
}

async function logSkippedRecurrence(eventId: string): Promise<void> {
  await admin().from('sync_conflicts').insert({
    task_id: null,
    field: 'recurrence',
    local_value: null,
    remote_value: eventId,
    resolution: 'skipped: recurring events are not supported in v1',
  });
}

/** A moved/renamed linked event: resolve per-field conflicts and update the
 * task. Returns true if anything changed. */
async function applyLinkedEventUpdate(link: LinkRow, event: calendar_v3.Schema$Event): Promise<boolean> {
  const task = await getTask(link.task_id);
  if (!task) return false;

  const remoteStart = event.start?.dateTime ?? event.start?.date ?? null;
  if (!remoteStart) return false;
  const remoteEnd = event.end?.dateTime ?? event.end?.date ?? null;
  const remoteDurationMin = remoteEnd ? minutesBetween(remoteStart, remoteEnd) : task.duration_min ?? 30;
  // event text is untrusted input: treated strictly as a plain title, never
  // as instructions (spec "Security").
  const remoteTitle = stripDoneMark(event.summary ?? task.title).slice(0, 300);

  const lastSynced = link.last_synced_at ? new Date(link.last_synced_at).getTime() : 0;
  const localChangedSince = new Date(task.updated_at).getTime() > lastSynced;
  const remoteChangedSince = event.updated ? new Date(event.updated).getTime() > lastSynced : false;

  const patch: Record<string, unknown> = {};

  // Time fields: later change wins (dragging in Calendar is the usual reschedule).
  if (remoteStart !== task.due_at || remoteDurationMin !== (task.duration_min ?? 30)) {
    if (localChangedSince && remoteChangedSince) {
      const remoteWins = !event.updated || new Date(event.updated).getTime() >= new Date(task.updated_at).getTime();
      await admin().from('sync_conflicts').insert({
        task_id: task.id,
        field: 'due_at',
        local_value: task.due_at,
        remote_value: remoteStart,
        resolution: remoteWins ? 'remote wins (later change)' : 'local wins (later change)',
      });
      if (remoteWins) {
        patch.due_at = remoteStart;
        patch.duration_min = remoteDurationMin;
      }
    } else {
      patch.due_at = remoteStart;
      patch.duration_min = remoteDurationMin;
    }
  }

  // Title: the app wins on conflict.
  if (remoteTitle !== task.title) {
    if (localChangedSince && remoteChangedSince) {
      await admin().from('sync_conflicts').insert({
        task_id: task.id,
        field: 'title',
        local_value: task.title,
        remote_value: remoteTitle,
        resolution: 'local wins (app wins on title/status)',
      });
    } else if (!localChangedSince) {
      patch.title = remoteTitle;
    }
  }

  let changed = false;
  if (Object.keys(patch).length > 0) {
    await updateTask(task.id, patch);
    await suppressEcho(task.id);
    changed = true;
  }

  await admin()
    .from('gcal_links')
    .update({
      etag: event.etag ?? null,
      google_updated_at: event.updated ?? null,
      last_synced_at: new Date().toISOString(),
    })
    .eq('task_id', task.id);

  return changed;
}

/** A deleted linked event: clear due_at, keep the task, notify. */
async function applyLinkedEventDeletion(link: LinkRow): Promise<boolean> {
  const task = await getTask(link.task_id);
  await deleteLink(link.task_id);
  if (!task) return false;
  await updateTask(task.id, { due_at: null });
  await suppressEcho(task.id);
  await notify({
    title: 'Calendar event removed',
    body: `"${task.title}" was removed from Google Calendar. The task is unscheduled but still open.`,
    tag: `gcal-deleted-${task.id}`,
    url: `/tasks/${task.id}`,
  });
  return true;
}

/** A hand-made event on the LifeOS calendar with no link becomes an
 * unsorted task (spec section 9, default answer to open question 2). */
async function createTaskFromEvent(calendarId: string, event: calendar_v3.Schema$Event): Promise<boolean> {
  if (!event.id) return false;
  const start = event.start?.dateTime ?? event.start?.date;
  if (!start) return false;
  const end = event.end?.dateTime ?? event.end?.date ?? null;
  const durationMin = end ? minutesBetween(start, end) : 30;

  // Event text is untrusted input: store as a plain title/notes value only,
  // never passed to the LLM as instructions.
  const title = (event.summary ?? '(untitled calendar event)').slice(0, 300);
  const notes = event.description ? `Imported from Google Calendar:\n\n${String(event.description).slice(0, 4000)}` : '';

  const task = await createTask({
    title,
    due_at: start,
    duration_min: durationMin > 0 ? durationMin : 30,
    notes_md: notes,
  });
  await suppressEcho(task.id); // the INSERT trigger just enqueued an upsert for this task

  const { error } = await admin().from('gcal_links').insert({
    task_id: task.id,
    google_calendar_id: calendarId,
    google_event_id: event.id,
    etag: event.etag ?? null,
    google_updated_at: event.updated ?? null,
    local_updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
  });
  if (error) throw new Error(`gcal_links: ${error.message}`);

  await notify({
    title: 'New task from Google Calendar',
    body: `"${title}" was added as an unsorted task from a calendar event.`,
    tag: `gcal-new-${task.id}`,
    url: `/tasks/${task.id}`,
  });
  return true;
}

async function applyRemoteEvent(calendarId: string, event: calendar_v3.Schema$Event): Promise<boolean> {
  if (!event.id) return false;

  if (event.recurrence && event.recurrence.length > 0) {
    await logSkippedRecurrence(event.id);
    return false;
  }

  const link = await findLinkByEventId(event.id);

  // Echo suppression: an unchanged etag means this is our own write coming
  // back from the poll, not a real remote change.
  if (link && link.etag && event.etag && link.etag === event.etag) return false;

  if (event.status === 'cancelled') {
    if (!link) return false; // an event we never tracked; ignore
    return applyLinkedEventDeletion(link);
  }

  if (link) return applyLinkedEventUpdate(link, event);

  const lifeosTaskId = event.extendedProperties?.private?.lifeos_task_id;
  if (lifeosTaskId) {
    // Our own event whose link row is missing (e.g. lost in a previous
    // partial run): relink instead of creating a duplicate task.
    const task = await getTask(lifeosTaskId);
    if (task) {
      await admin().from('gcal_links').insert({
        task_id: task.id,
        google_calendar_id: calendarId,
        google_event_id: event.id,
        etag: event.etag ?? null,
        google_updated_at: event.updated ?? null,
        local_updated_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      });
      return false;
    }
  }

  return createTaskFromEvent(calendarId, event);
}

async function pollLifeosCalendar(): Promise<number> {
  const calendarId = await ensureLifeosCalendar();
  const { events, nextSyncToken } = await listEventsResilient(calendarId);

  let changed = 0;
  for (const event of events) {
    if (await applyRemoteEvent(calendarId, event)) changed += 1;
  }

  await setSyncToken(calendarId, nextSyncToken);
  return changed;
}

/** Upserts many events at once; falls back to the original columns if migration 0011 has not run. */
export async function upsertCacheRows(rows: CacheRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const { error } = await admin().from('calendar_events').upsert(rows, { onConflict: 'google_event_id' });
  if (!error) return true;
  const slim = rows.map(({ google_event_id, summary, starts_at, ends_at, all_day, updated_at }) => ({ google_event_id, summary, starts_at, ends_at, all_day, updated_at }));
  const { error: e2 } = await admin().from('calendar_events').upsert(slim, { onConflict: 'google_event_id' });
  return !e2;
}

/** Upserts a primary-calendar event into the cache. Falls back to the original columns if migration 0011 has not run. */
export async function upsertCacheRow(row: CacheRow): Promise<boolean> {
  const { error } = await admin().from('calendar_events').upsert(row, { onConflict: 'google_event_id' });
  if (!error) return true;
  const { google_event_id, summary, starts_at, ends_at, all_day, updated_at } = row;
  const { error: e2 } = await admin().from('calendar_events').upsert({ google_event_id, summary, starts_at, ends_at, all_day, updated_at }, { onConflict: 'google_event_id' });
  return !e2;
}

/** Cache of the primary calendar for the agenda/morning plan;
 * these events never become tasks. */
async function pollPrimaryCalendar(): Promise<number> {
  await ensurePrimaryCached();
  const { events, nextSyncToken } = await listEventsResilient(PRIMARY_CALENDAR_ID);

  // one round trip for the deletions and one per 200 events, instead of one per event
  const cancelled: string[] = [];
  const rows: CacheRow[] = [];
  for (const event of events) {
    if (!event.id) continue;
    if (event.status === 'cancelled') { cancelled.push(event.id); continue; }
    const row = eventToCacheRow(event);
    if (row) rows.push(row);
  }
  let changed = 0;
  let failed = 0;
  for (let k = 0; k < cancelled.length; k += 200) {
    await admin().from('calendar_events').delete().in('google_event_id', cancelled.slice(k, k + 200));
    changed += Math.min(200, cancelled.length - k);
  }
  for (let k = 0; k < rows.length; k += 200) {
    const chunk = rows.slice(k, k + 200);
    if (await upsertCacheRows(chunk)) changed += chunk.length;
    else failed += chunk.length;
  }

  // keep the old token if anything could not be saved, so the next poll sends those events again
  if (failed > 0) throw new Error(`${failed} event${failed === 1 ? '' : 's'} could not be saved (is migration 0011 applied?)`);
  await setSyncToken(PRIMARY_CALENDAR_ID, nextSyncToken);
  return changed;
}

export type PollResult = { changed: number; errors: string[]; cached: number };

async function recordCalendarState(r: PollResult): Promise<void> {
  const now = new Date().toISOString();
  await admin().from('calendar_sync_state').upsert({
    id: true, last_polled_at: now, ...(r.errors.length === 0 ? { last_ok_at: now } : {}),
    last_error: r.errors.length ? r.errors.join(' · ').slice(0, 500) : null, last_changed: r.changed, cached_events: r.cached,
  }, { onConflict: 'id' });
}

/**
 * Google -> app. Both calendars are synced independently, so a problem with the LifeOS calendar can no longer
 * stop your main calendar from loading. Failures are recorded for /settings and the calendar widget instead of
 * disappearing. `full` throws away the saved sync position and re-reads the whole window.
 */
export async function pollCalendar(opts: { full?: boolean } = {}): Promise<PollResult> {
  const result: PollResult = { changed: 0, errors: [], cached: 0 };
  const problem = await connectionProblem();
  if (problem) {
    result.errors.push(problem);
    if (isConfigured()) await recordCalendarState(result).catch(() => undefined);
    return result;
  }
  if (opts.full) await setSyncToken(PRIMARY_CALENDAR_ID, null);
  try { result.changed += await pollLifeosCalendar(); }
  catch (e) { result.errors.push(`LifeOS calendar: ${e instanceof Error ? e.message : String(e)}`); }
  try { result.changed += await pollPrimaryCalendar(); }
  catch (e) { result.errors.push(`Main calendar: ${e instanceof Error ? e.message : String(e)}`); }
  const { count } = await admin().from('calendar_events').select('*', { count: 'exact', head: true });
  result.cached = count ?? 0;
  if (result.errors.length) console.error('pollCalendar', result.errors.join(' | '));
  await recordCalendarState(result).catch(() => undefined);
  return result;
}


export type TodayResult = { date: string; pulled: number; removed: number; pushed: number; failed: number; errors: string[] };

/**
 * Both ways, for one day only (today by default): read that day's events from Google (LifeOS calendar and main
 * calendar, including changes and deletions), then send the pending changes of that day's tasks to Google.
 * It never touches the incremental sync position, so the normal sync is unaffected.
 */
export async function syncToday(date: string = istDate()): Promise<TodayResult> {
  const result: TodayResult = { date, pulled: 0, removed: 0, pushed: 0, failed: 0, errors: [] };
  const problem = await connectionProblem();
  if (problem) { result.errors.push(problem); return result; }
  const timeMin = istInstant(date, '00:00').toISOString(), timeMax = istInstant(addDays(date, 1), '00:00').toISOString();

  // Google -> app, the LifeOS calendar (the events behind your timed tasks)
  try {
    const calendarId = await ensureLifeosCalendar();
    const { events } = await listEvents({ calendarId, timeMin, timeMax });
    for (const event of events) if (await applyRemoteEvent(calendarId, event)) result.pulled += 1;
  } catch (e) { result.errors.push(`LifeOS calendar: ${e instanceof Error ? e.message : String(e)}`); }

  // Google -> app, the main calendar: what Google returns replaces what was stored for that day
  try {
    await ensurePrimaryCached();
    const { events } = await listEvents({ calendarId: PRIMARY_CALENDAR_ID, timeMin, timeMax });
    const rows: CacheRow[] = [];
    const live = new Set<string>();
    const gone: string[] = [];
    for (const event of events) {
      if (!event.id) continue;
      if (event.status === 'cancelled') { gone.push(event.id); continue; }
      const row = eventToCacheRow(event);
      if (row) { rows.push(row); live.add(row.google_event_id); }
    }
    const { data: stored } = await admin().from('calendar_events').select('google_event_id').lt('starts_at', timeMax).gte('ends_at', timeMin);
    for (const r of (stored ?? []) as { google_event_id: string }[]) if (!live.has(r.google_event_id) && !gone.includes(r.google_event_id)) gone.push(r.google_event_id);
    if (rows.length && !(await upsertCacheRows(rows))) throw new Error('events could not be saved (is migration 0011 applied?)');
    for (let k = 0; k < gone.length; k += 200) await admin().from('calendar_events').delete().in('google_event_id', gone.slice(k, k + 200));
    result.pulled += rows.length;
    result.removed = gone.length;
  } catch (e) { result.errors.push(`Main calendar: ${e instanceof Error ? e.message : String(e)}`); }

  // app -> Google, that day's tasks
  const out = await drainOutbox({ onlyDate: date });
  result.pushed = out.pushed;
  result.failed = out.failed;
  return result;
}
