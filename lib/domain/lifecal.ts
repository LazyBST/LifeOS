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

export type Item = { date: string; area_id: string | null; done: boolean };

/**
 * Every scheduled unit across all areas of life, one item each. Units follow the progress rule: a task
 * with subtasks counts as its subtasks, a task without counts as one. Habits due that day count as one
 * each.
 */
export async function dayItems(from: string, to: string): Promise<Item[]> {
  const today = istDate();
  const items: Item[] = [];

  const [tasks, parents] = await Promise.all([
    paged<{ id: string; due_date: string; status: string; area_id: string | null }>((a, b) =>
      admin().from('tasks').select('id,due_date,status,area_id').is('deleted_at', null).gte('due_date', from).lte('due_date', to).order('id').range(a, b)),
    paged<{ parent_task_id: string }>((a, b) =>
      admin().from('tasks').select('parent_task_id').is('deleted_at', null).not('parent_task_id', 'is', null).order('id').range(a, b)),
  ]);
  const hasChildren = new Set(parents.map((p) => p.parent_task_id));
  for (const t of tasks) if (!hasChildren.has(t.id)) items.push({ date: t.due_date, area_id: t.area_id, done: t.status === 'done' });

  const habits = await listHabits(true);
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
        items.push({ date: d, area_id: h.area_id, done: (met.get(`${h.id}|${d}`) ?? 0) >= Number(h.target_value) });
      }
    }
  }
  return items;
}

/** Per-day stats, optionally for a single Area. Days with nothing scheduled are omitted. */
export function summarise(items: Item[], areaId?: string | null): Record<string, DayStat> {
  const days: Record<string, DayStat> = {};
  for (const it of items) {
    if (areaId && it.area_id !== areaId) continue;
    const s = (days[it.date] ??= { total: 0, done: 0 });
    s.total += 1;
    if (it.done) s.done += 1;
  }
  return days;
}

/** done/total per area over the loaded span (the per-area analytics). Key 'none' = no area. */
export function areaTotals(items: Item[], today: string): Record<string, DayStat> {
  const out: Record<string, DayStat> = {};
  for (const it of items) {
    if (it.date > today) continue;
    const s = (out[it.area_id ?? 'none'] ??= { total: 0, done: 0 });
    s.total += 1;
    if (it.done) s.done += 1;
  }
  return out;
}

export async function lifeCalendarSettings(): Promise<{ birth_date: string | null; lifespan_years: number }> {
  const cfg = await getConfig(true);
  return { birth_date: cfg.birth_date ?? null, lifespan_years: cfg.lifespan_years ?? 80 };
}

export type DetailItem = { kind: 'task' | 'habit'; id: string; title: string; done: boolean; area_id: string | null; date: string; href: string | null };

/** The individual tasks and habits behind a day, week or month dot, for the analytics panel. */
export async function detailItems(from: string, to: string): Promise<DetailItem[]> {
  const today = istDate();
  const out: DetailItem[] = [];
  const [tasks, parents] = await Promise.all([
    paged<{ id: string; title: string; due_date: string; status: string; area_id: string | null }>((a, b) =>
      admin().from('tasks').select('id,title,due_date,status,area_id').is('deleted_at', null).gte('due_date', from).lte('due_date', to).order('due_date').range(a, b)),
    paged<{ parent_task_id: string }>((a, b) =>
      admin().from('tasks').select('parent_task_id').is('deleted_at', null).not('parent_task_id', 'is', null).order('id').range(a, b)),
  ]);
  const hasChildren = new Set(parents.map((p) => p.parent_task_id));
  for (const t of tasks) if (!hasChildren.has(t.id)) out.push({ kind: 'task', id: t.id, title: t.title, done: t.status === 'done', area_id: t.area_id, date: t.due_date, href: `/tasks/${t.id}` });

  const habits = await listHabits(true);
  const last = to < today ? to : today;
  if (habits.length && from <= last) {
    const checkins = await paged<{ habit_id: string; checkin_date: string; value: number }>((a, b) =>
      admin().from('habit_checkins').select('habit_id,checkin_date,value').gte('checkin_date', from).lte('checkin_date', last).order('checkin_date').range(a, b));
    const met = new Map(checkins.map((c) => [`${c.habit_id}|${c.checkin_date}`, Number(c.value)]));
    for (let d = from; d <= last; d = addDays(d, 1)) {
      for (const h of habits) {
        if (h.created_at.slice(0, 10) > d || (h.archived_at && h.archived_at.slice(0, 10) <= d) || !habitDueOn(h, d)) continue;
        out.push({ kind: 'habit', id: h.id, title: h.name, done: (met.get(`${h.id}|${d}`) ?? 0) >= Number(h.target_value), area_id: h.area_id, date: d, href: null });
      }
    }
  }
  return out;
}
