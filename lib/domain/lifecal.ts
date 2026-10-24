import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { getConfig } from './config';
import { listHabits, habitDueOn } from './habits';
import { addDays, istDate } from '@/lib/time';
import type { DayStat } from './lifecal-math';

const PAGE = 1000;

async function paged<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Per day: how many things were scheduled across every area of life, and how many got done.
 * Units follow the progress rule: a task with subtasks counts as its subtasks, a task without
 * counts as one. Habits due that day count as one unit each. Days with nothing scheduled are omitted.
 */
export async function daySummaries(from: string, to: string): Promise<Record<string, DayStat>> {
  const today = istDate();
  const days: Record<string, DayStat> = {};
  const bump = (d: string, done: boolean) => {
    const s = (days[d] ??= { total: 0, done: 0 });
    s.total += 1;
    if (done) s.done += 1;
  };

  const [tasks, parents] = await Promise.all([
    paged<{ id: string; due_date: string; status: string }>((a, b) =>
      admin().from('tasks').select('id,due_date,status').is('deleted_at', null).gte('due_date', from).lte('due_date', to).order('id').range(a, b)),
    paged<{ parent_task_id: string }>((a, b) =>
      admin().from('tasks').select('parent_task_id').is('deleted_at', null).not('parent_task_id', 'is', null).order('id').range(a, b)),
  ]);
  const hasChildren = new Set(parents.map((p) => p.parent_task_id));
  for (const t of tasks) if (!hasChildren.has(t.id)) bump(t.due_date, t.status === 'done');

  const habits = (await listHabits(true)).filter((h) => h.kind === 'boolean' || h.kind === 'count');
  if (habits.length) {
    const last = to < today ? to : today;
    const checkins = await paged<{ habit_id: string; checkin_date: string; value: number }>((a, b) =>
      admin().from('habit_checkins').select('habit_id,checkin_date,value').gte('checkin_date', from).lte('checkin_date', last).order('checkin_date').range(a, b));
    const met = new Map(checkins.map((c) => [`${c.habit_id}|${c.checkin_date}`, Number(c.value)]));
    for (let d = from; d <= last; d = addDays(d, 1)) {
      for (const h of habits) {
        if (h.created_at.slice(0, 10) > d) continue;
        if (h.archived_at && h.archived_at.slice(0, 10) <= d) continue;
        if (!habitDueOn(h, d)) continue;
        bump(d, (met.get(`${h.id}|${d}`) ?? 0) >= Number(h.target_value));
      }
    }
  }
  return days;
}

export async function lifeCalendarSettings(): Promise<{ birth_date: string | null; lifespan_years: number }> {
  const cfg = await getConfig(true);
  return { birth_date: cfg.birth_date ?? null, lifespan_years: cfg.lifespan_years ?? 80 };
}
