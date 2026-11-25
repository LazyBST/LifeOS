import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { addDays, istDate, istInstant } from '@/lib/time';
import { summariseDay, type DaySummary, type Segment } from './pomodoro-math';

export type StoredSegment = Segment & { id: string; day: string };

export async function logSegment(seg: Segment): Promise<void> {
  const ok = (n: unknown) => Number.isFinite(Number(n)) && Number(n) >= 0;
  if (!/^[0-9a-f-]{36}$/i.test(seg.run_id) || (seg.kind !== 'work' && seg.kind !== 'break') || !ok(seg.planned_sec) || !ok(seg.actual_sec)) throw new Error('Bad segment.');
  const row = {
    run_id: seg.run_id, day: istDate(new Date(seg.started_at)), kind: seg.kind, label: seg.label?.slice(0, 200) || null,
    planned_sec: Math.round(seg.planned_sec), actual_sec: Math.round(seg.actual_sec), paused_sec: Math.round(seg.paused_sec || 0), pauses: Math.round(seg.pauses || 0),
    completed: !!seg.completed, started_at: seg.started_at, ended_at: seg.ended_at,
  };
  // two devices may close the same phase: the unique index (migration 0020) keeps one copy
  let { error } = await admin().from('pomodoro_segments').upsert(row, { onConflict: 'run_id,started_at,kind', ignoreDuplicates: true });
  if (error && /constraint|conflict|unique/i.test(error.message)) ({ error } = await admin().from('pomodoro_segments').insert(row));
  if (error) throw new Error(error.message.includes('pomodoro_segments') ? 'Run supabase/migrations/0019_pomodoro.sql to keep Pomodoro history.' : error.message);
}

export async function segmentsOn(day: string): Promise<{ segments: StoredSegment[]; ready: boolean }> {
  const { data, error } = await admin().from('pomodoro_segments').select('*').eq('day', day).order('started_at');
  return error ? { segments: [], ready: false } : { segments: data as StoredSegment[], ready: true };
}

/** Work the calendar asked for that day: timed tasks by their length, untimed tasks by their estimate (30 min if none). */
export async function plannedWorkMinutes(day: string): Promise<number> {
  const from = istInstant(day, '00:00').toISOString(), to = istInstant(addDays(day, 1), '00:00').toISOString();
  const [timed, untimed] = await Promise.all([
    admin().from('tasks').select('duration_min').is('deleted_at', null).gte('due_at', from).lt('due_at', to),
    admin().from('tasks').select('estimate_min').is('deleted_at', null).is('due_at', null).eq('due_date', day),
  ]);
  const a = ((timed.data ?? []) as { duration_min: number | null }[]).reduce((s, t) => s + (t.duration_min ?? 30), 0);
  const b = ((untimed.data ?? []) as { estimate_min: number | null }[]).reduce((s, t) => s + (t.estimate_min ?? 30), 0);
  return a + b;
}

export type FocusDay = { date: string; ready: boolean; segments: StoredSegment[]; plannedWorkMin: number; summary: DaySummary };

export async function focusDay(day: string): Promise<FocusDay> {
  const [{ segments, ready }, plannedWorkMin] = await Promise.all([segmentsOn(day), plannedWorkMinutes(day).catch(() => 0)]);
  return { date: day, ready, segments, plannedWorkMin, summary: summariseDay(segments, plannedWorkMin) };
}

/** Focused minutes and finished sessions for each of the last `days` days, oldest first. */
export async function focusWeek(today: string, days = 7): Promise<{ date: string; workMin: number; sessions: number }[]> {
  const from = addDays(today, -(days - 1));
  const { data } = await admin().from('pomodoro_segments').select('day,kind,actual_sec,completed').gte('day', from).lte('day', today);
  const rows = (data ?? []) as { day: string; kind: string; actual_sec: number; completed: boolean }[];
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const w = rows.filter((r) => r.day === date && r.kind === 'work');
    return { date, workMin: Math.round(w.reduce((s, r) => s + r.actual_sec, 0) / 60), sessions: w.filter((r) => r.completed).length };
  });
}


// ---- the running timer, shared by every device -----------------------------------------------------------

/** `ver` goes up by one with every save; `op` names the save that wrote it. */
export type RunDoc = { timer: Record<string, unknown> | null; ver: number; op?: string | null };
export type SaveResult = { ok: true; ver: number } | { ok: false; doc: RunDoc };
const KEY = 'pomodoro-run';

async function readRun(): Promise<{ doc: RunDoc; stamp: string | null; exists: boolean }> {
  const { data } = await admin().from('ui_state').select('value,updated_at').eq('key', KEY).maybeSingle();
  if (!data) return { doc: { timer: null, ver: 0 }, stamp: null, exists: false };
  const v = (data.value ?? {}) as { timer?: Record<string, unknown> | null; ver?: number; op?: string | null };
  return { doc: { timer: v.timer ?? null, ver: typeof v.ver === 'number' ? v.ver : 0, op: v.op ?? null }, stamp: (data.updated_at as string | null) ?? null, exists: true };
}

export async function getRun(): Promise<RunDoc> { return (await readRun()).doc; }

/** Whether a save that started from `baseVer` may go ahead. */
export const canSave = (cur: RunDoc, baseVer: number): boolean => cur.ver === baseVer;

function checkTimer(timer: Record<string, unknown> | null): void {
  if (timer === null) return;
  const cfg = timer.cfg as { workMin?: unknown; breakMin?: unknown } | undefined;
  const plan = (timer.cfg as { plan?: unknown } | undefined)?.plan;
  if (plan !== undefined && (!Array.isArray(plan) || plan.length < 1 || plan.length > 20 || plan.some((x) => typeof x?.workMin !== 'number' || typeof x?.breakMin !== 'number'))) throw new Error('Bad timer.');
  if (typeof timer.runId !== 'string' || typeof timer.phaseStartedAt !== 'number' || !cfg || typeof cfg.workMin !== 'number' || typeof cfg.breakMin !== 'number') throw new Error('Bad timer.');
}

/**
 * Save the timer if nobody has saved since `baseVer` (the version this device last saw). Otherwise nothing is written
 * and the newer timer comes back, so the device can replay what it wanted on top of it. The write itself only goes
 * through if the row is still the one that was just read.
 */
export async function saveRun(timer: Record<string, unknown> | null, baseVer: number, op: string): Promise<SaveResult> {
  checkTimer(timer);
  if (!Number.isInteger(baseVer) || typeof op !== 'string' || op.length < 1 || op.length > 64) throw new Error('Bad request.');
  const cur = await readRun();
  if (!canSave(cur.doc, baseVer)) return { ok: false, doc: cur.doc };
  const ver = cur.doc.ver + 1;
  const value = { timer, ver, op };
  const updated_at = new Date().toISOString();
  if (!cur.exists) {
    const { error } = await admin().from('ui_state').insert({ key: KEY, value, updated_at });
    if (error) return { ok: false, doc: (await readRun()).doc }; // someone created it first
  } else {
    let q = admin().from('ui_state').update({ value, updated_at }).eq('key', KEY);
    q = cur.stamp === null ? q.is('updated_at', null) : q.eq('updated_at', cur.stamp);
    const { data, error } = await q.select('key');
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, doc: (await readRun()).doc }; // changed between the read and the write
  }
  return { ok: true, ver };
}
