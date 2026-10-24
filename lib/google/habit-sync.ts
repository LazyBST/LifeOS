import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { isConfigured, hasTasksScope } from './auth';
import { completeGoogleTask, listGoogleTasks } from './tasks';
import { matchHabit } from './habit-match';
import { istDay } from '@/lib/domain/ledger-math';
import { istDate } from '@/lib/time';
import type { Habit } from '@/lib/types/db';

type HabitRow = Pick<Habit, 'id' | 'name' | 'target_value' | 'archived_at'> & { gtask_title?: string | null };

async function record(patch: { last_error?: string | null; last_pulled?: number; last_pushed?: number }): Promise<void> {
  await admin().from('gtasks_sync_state').upsert({ id: true, last_polled_at: new Date().toISOString(), ...patch }, { onConflict: 'id' });
}

async function ready(): Promise<{ ok: true } | { ok: false; reason: string | null }> {
  if (!isConfigured()) return { ok: false, reason: null };
  try {
    if (!(await hasTasksScope())) return { ok: false, reason: 'Google is connected without Tasks access. Open Settings → Google, disconnect and connect again to grant it.' };
  } catch {
    return { ok: false, reason: null };
  }
  return { ok: true };
}

async function activeHabits(): Promise<HabitRow[]> {
  const { data } = await admin().from('habits').select('id,name,target_value,archived_at,gtask_title').is('archived_at', null);
  return (data ?? []) as HabitRow[];
}

export type PullReport = {
  pulled: number;
  /** Google tasks completed in the last 3 days */
  found: number;
  /** of those, how many matched a habit by title */
  matched: number;
  /** completed Google task titles that matched no habit (rename the task or set the habit's "Google Task title") */
  unmatched: string[];
  /** habits that have no Google Task with the same title (open or completed) */
  unlinkedHabits: string[];
  error: string | null;
};

/**
 * Google Tasks → habits: a task you completed (in Google Tasks or on your calendar) checks in the habit
 * with the same title, on the day you completed it. Never throws: the outcome is returned and stored for /settings.
 */
export async function pullHabitCheckins(now = new Date()): Promise<PullReport> {
  const empty: PullReport = { pulled: 0, found: 0, matched: 0, unmatched: [], unlinkedHabits: [], error: null };
  const r = await ready();
  if (!r.ok) {
    const error = r.reason ?? 'Google is not connected.';
    await record({ last_error: error }).catch(() => undefined);
    return { ...empty, error };
  }
  try {
    const habits = await activeHabits();
    if (habits.length === 0) { await record({ last_error: null, last_pulled: 0 }); return empty; }
    const since = new Date(now.getTime() - 3 * 86_400_000).toISOString();
    const all = await listGoogleTasks({ completedMin: since });
    const done = all.filter((t) => t.status === 'completed' && t.completed);
    const report: PullReport = { ...empty, found: done.length };
    const { checkinHabit } = await import('@/lib/domain/habits'); // lazy: habits.ts imports this module
    for (const t of done) {
      const h = matchHabit(t.title, habits);
      if (!h) { report.unmatched.push(t.title); continue; }
      report.matched += 1;
      const date = istDay(t.completed!);
      const { data: existing } = await admin().from('habit_checkins').select('value').eq('habit_id', h.id).eq('checkin_date', date).maybeSingle();
      if (existing && Number(existing.value) >= Number((h as HabitRow).target_value)) continue;
      await checkinHabit(h.id, { date, note: 'from Google Tasks', source: 'gtasks' });
      report.pulled += 1;
    }
    report.unlinkedHabits = habits.filter((h) => !all.some((t) => matchHabit(t.title, [h]))).map((h) => h.name);
    report.unmatched = [...new Set(report.unmatched)].slice(0, 20);
    await record({ last_error: null, last_pulled: report.pulled });
    return report;
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 300) : String(e);
    await record({ last_error: error }).catch(() => undefined);
    return { ...empty, error };
  }
}

/**
 * Habits → Google Tasks: checking a habit in LifeOS completes the open Google Task with the same title
 * (the most recent one due on or before that day). Best effort; never throws.
 */
export async function pushHabitCheckin(habit: HabitRow, date = istDate()): Promise<boolean> {
  const r = await ready();
  if (!r.ok) return false;
  try {
    const open = (await listGoogleTasks()).filter((t) => t.status === 'needsAction' && matchHabit(t.title, [habit]));
    const eligible = open
      .filter((t) => !t.due || t.due.slice(0, 10) <= date)
      .sort((a, b) => (b.due ?? '').localeCompare(a.due ?? ''));
    const target = eligible[0];
    if (!target) return false;
    await completeGoogleTask(target.listId, target.id);
    await admin().from('gtasks_sync_state').upsert({ id: true, last_pushed: 1, last_polled_at: new Date().toISOString() }, { onConflict: 'id' });
    return true;
  } catch (e) {
    await record({ last_error: e instanceof Error ? e.message.slice(0, 300) : String(e) }).catch(() => undefined);
    return false;
  }
}
