import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { addDays, istDate, istInstant } from '@/lib/time';
import { summariseDay, type DaySummary, type Segment } from './pomodoro-math';

export type StoredSegment = Segment & { id: string; day: string };

export async function logSegment(seg: Segment): Promise<void> {
  const ok = (n: unknown) => Number.isFinite(Number(n)) && Number(n) >= 0;
  if (!/^[0-9a-f-]{36}$/i.test(seg.run_id) || (seg.kind !== 'work' && seg.kind !== 'break') || !ok(seg.planned_sec) || !ok(seg.actual_sec)) throw new Error('Bad segment.');
  const { error } = await admin().from('pomodoro_segments').insert({
    run_id: seg.run_id, day: istDate(new Date(seg.started_at)), kind: seg.kind, label: seg.label?.slice(0, 200) || null,
    planned_sec: Math.round(seg.planned_sec), actual_sec: Math.round(seg.actual_sec), paused_sec: Math.round(seg.paused_sec || 0), pauses: Math.round(seg.pauses || 0),
    completed: !!seg.completed, started_at: seg.started_at, ended_at: seg.ended_at,
  });
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
