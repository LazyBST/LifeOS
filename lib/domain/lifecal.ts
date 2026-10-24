import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { getConfig } from './config';
import { listHabits, habitDueOn } from './habits';
import { addDays, istDate } from '@/lib/time';
import type { DayStat } from './lifecal-math';
import { habitOutcome, taskOutcomes, type Outcome } from './schedule-math';
import { istDay } from './ledger-math';

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

export type DetailItem = {
  kind: 'task' | 'habit'; id: string; title: string; area_id: string | null; date: string; href: string | null;
  /** done: finished that day; pushed: not finished that day; pending: today and still open */
  outcome: Outcome;
  /** kept so older UI that only asks "done?" keeps working */
  done: boolean;
};
export type Item = Pick<DetailItem, 'date' | 'area_id' | 'outcome'>;

type TaskRow = { id: string; title: string; status: string; due_date: string | null; original_due_date?: string | null; completed_at: string | null; area_id: string | null };
type ChangeRow = { entity_id: string; old_date: string | null; new_date: string | null; id: number };

async function loadTasks(from: string, to: string): Promise<{ tasks: TaskRow[]; changes: Map<string, ChangeRow[]> }> {
  const cols = 'id,title,status,due_date,original_due_date,completed_at,area_id';
  const oldCols = 'id,title,status,due_date,completed_at,area_id';
  const byId = new Map<string, TaskRow>();
  const add = (rows: TaskRow[]) => { for (const r of rows) byId.set(r.id, r); };
  let c = cols;
  try {
    add(await paged<TaskRow>((a, b) => admin().from('tasks').select(c as '*').is('deleted_at', null).gte('due_date', from).lte('due_date', to).order('id').range(a, b)));
  } catch {
    c = oldCols; // migration 0008 not applied: no original deadline or move history
    add(await paged<TaskRow>((a, b) => admin().from('tasks').select(c as '*').is('deleted_at', null).gte('due_date', from).lte('due_date', to).order('id').range(a, b)));
  }
  const changes = new Map<string, ChangeRow[]>();
  if (c === cols) {
    // tasks that were scheduled in the range at some point, even if they have since moved elsewhere
    add(await paged<TaskRow>((a, b) => admin().from('tasks').select(c as '*').is('deleted_at', null).gte('original_due_date', from).lte('original_due_date', to).order('id').range(a, b)).catch(() => []));
    const moved = await paged<ChangeRow>((a, b) => admin().from('deadline_changes').select('id,entity_id,old_date,new_date').eq('entity', 'task').or(`and(old_date.gte.${from},old_date.lte.${to}),and(new_date.gte.${from},new_date.lte.${to})`).order('id').range(a, b)).catch(() => []);
    const missing = [...new Set(moved.map((m) => m.entity_id))].filter((id) => !byId.has(id));
    for (let i = 0; i < missing.length; i += 150) add(await paged<TaskRow>((a, b) => admin().from('tasks').select(c as '*').is('deleted_at', null).in('id', missing.slice(i, i + 150)).order('id').range(a, b)).catch(() => []));
    const ids = [...byId.keys()];
    for (let i = 0; i < ids.length; i += 150) {
      const rows = await paged<ChangeRow>((a, b) => admin().from('deadline_changes').select('id,entity_id,old_date,new_date').eq('entity', 'task').in('entity_id', ids.slice(i, i + 150)).order('id').range(a, b)).catch(() => []);
      for (const r of rows) changes.set(r.entity_id, [...(changes.get(r.entity_id) ?? []), r]);
    }
  }
  return { tasks: [...byId.values()], changes };
}

/**
 * Everything that was scheduled in [from, to], one entry per task-or-habit per day, with what happened to it that day.
 * Units follow the progress rule: a task with subtasks counts as its subtasks, a task without counts as one.
 */
export async function detailItems(from: string, to: string): Promise<DetailItem[]> {
  const today = istDate();
  const out: DetailItem[] = [];
  const make = (d: Omit<DetailItem, 'done'>): DetailItem => ({ ...d, done: d.outcome === 'done' });

  const [{ tasks, changes }, parents] = await Promise.all([
    loadTasks(from, to),
    paged<{ parent_task_id: string }>((a, b) =>
      admin().from('tasks').select('parent_task_id').is('deleted_at', null).not('parent_task_id', 'is', null).order('id').range(a, b)),
  ]);
  const hasChildren = new Set(parents.map((p) => p.parent_task_id));
  for (const t of tasks) {
    if (hasChildren.has(t.id)) continue;
    const timeline = {
      status: t.status, due_date: t.due_date, original_due_date: t.original_due_date ?? null,
      completed_day: t.completed_at ? istDay(t.completed_at) : null,
      changes: (changes.get(t.id) ?? []).sort((a, b) => a.id - b.id),
    };
    for (const o of taskOutcomes(timeline, today)) {
      if (o.date < from || o.date > to) continue;
      out.push(make({ kind: 'task', id: t.id, title: t.title, area_id: t.area_id, date: o.date, href: `/tasks/${t.id}`, outcome: o.outcome }));
    }
  }

  const habits = await listHabits(true);
  const last = to < today ? to : today;
  if (habits.length && from <= last) {
    const checkins = await paged<{ habit_id: string; checkin_date: string; value: number }>((a, b) =>
      admin().from('habit_checkins').select('habit_id,checkin_date,value').gte('checkin_date', from).lte('checkin_date', last).order('checkin_date').range(a, b));
    const value = new Map(checkins.map((c) => [`${c.habit_id}|${c.checkin_date}`, Number(c.value)]));
    for (let d = from; d <= last; d = addDays(d, 1)) {
      for (const h of habits) {
        if (h.created_at.slice(0, 10) > d || (h.archived_at && h.archived_at.slice(0, 10) <= d) || !habitDueOn(h, d)) continue;
        const outcome = habitOutcome(value.get(`${h.id}|${d}`), Number(h.target_value), d, today);
        if (outcome) out.push(make({ kind: 'habit', id: h.id, title: h.name, area_id: h.area_id, date: d, href: null, outcome }));
      }
    }
  }
  return out;
}

export async function dayItems(from: string, to: string): Promise<Item[]> {
  return detailItems(from, to);
}

/** Per-day stats, optionally for a single Area. Days with nothing scheduled are omitted. */
export function summarise(items: Item[], areaId?: string | null): Record<string, DayStat> {
  const days: Record<string, DayStat> = {};
  for (const it of items) {
    if (areaId && it.area_id !== areaId) continue;
    const s = (days[it.date] ??= { total: 0, done: 0, pushed: 0 });
    s.total += 1;
    if (it.outcome === 'done') s.done += 1;
    else if (it.outcome === 'pushed') s.pushed = (s.pushed ?? 0) + 1;
  }
  return days;
}

/** done/pushed/total per area over the loaded span, up to today (the per-area analytics). Key 'none' = no area. */
export function areaTotals(items: Item[], today: string): Record<string, DayStat> {
  const out: Record<string, DayStat> = {};
  for (const it of items) {
    if (it.date > today) continue;
    const s = (out[it.area_id ?? 'none'] ??= { total: 0, done: 0, pushed: 0 });
    s.total += 1;
    if (it.outcome === 'done') s.done += 1;
    else if (it.outcome === 'pushed') s.pushed = (s.pushed ?? 0) + 1;
  }
  return out;
}

export async function lifeCalendarSettings(): Promise<{ birth_date: string | null; lifespan_years: number }> {
  const cfg = await getConfig(true);
  return { birth_date: cfg.birth_date ?? null, lifespan_years: cfg.lifespan_years ?? 80 };
}

