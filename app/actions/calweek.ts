'use server';

import { requireUser } from '@/lib/auth';
import { weekData, type WeekData } from '@/lib/domain/calweek';
import { weekStart } from '@/lib/domain/lifecal-math';
import { istParts } from '@/lib/time';
import { admin } from '@/lib/supabase/admin';
import { type ActionResult, run } from './_result';

export async function getCalendarWeekAction(weekStart: string): Promise<ActionResult<WeekData>> {
  return run(async () => {
    await requireUser();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new Error('Bad week');
    return weekData(weekStart);
  });
}

export type DayBlock = { id: string; title: string; kind: 'event' | 'task' | 'habit'; color: string; area: string | null; start: number; end: number; done: boolean; /** Area > Goal > Project > Task, for the roll-up */ path: string[] };

/** Everything with a time on one day (minutes from midnight, IST): events, tasks and habits, for the "how I spent my day" widget. */
export async function timeUseDayAction(date: string): Promise<ActionResult<{ date: string; blocks: DayBlock[] }>> {
  return run(async () => {
    await requireUser();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bad date');
    const week = await weekData(weekStart(date));
    const mins = (iso: string) => { const p = istParts(new Date(iso)); return p.hour * 60 + p.minute; };
    const FALLBACK = { event: '#10b981', task: '#6366f1', habit: '#f59e0b' } as const;
    // where each task sits in your goals and projects
    const taskIds = week.blocks.filter((b) => b.kind === 'task' && istParts(new Date(b.start)).date === date).map((b) => b.id);
    const { data: trows } = taskIds.length ? await admin().from('tasks').select('id,goal_id,project_id,parent_task_id').in('id', taskIds) : { data: [] };
    const meta = new Map(((trows ?? []) as { id: string; goal_id: string | null; project_id: string | null; parent_task_id: string | null }[]).map((t) => [t.id, t]));
    const goalIds = [...new Set([...meta.values()].map((t) => t.goal_id).filter(Boolean))] as string[];
    const projectIds = [...new Set([...meta.values()].map((t) => t.project_id).filter(Boolean))] as string[];
    const parentIds = [...new Set([...meta.values()].map((t) => t.parent_task_id).filter(Boolean))] as string[];
    const [g, p, par] = await Promise.all([
      goalIds.length ? admin().from('goals').select('id,title').in('id', goalIds) : { data: [] },
      projectIds.length ? admin().from('projects').select('id,title,goal_id').in('id', projectIds) : { data: [] },
      parentIds.length ? admin().from('tasks').select('id,title').in('id', parentIds) : { data: [] },
    ]);
    const goalTitle = new Map(((g.data ?? []) as { id: string; title: string }[]).map((x) => [x.id, x.title]));
    const projects = new Map(((p.data ?? []) as { id: string; title: string; goal_id: string | null }[]).map((x) => [x.id, x]));
    const parentTitle = new Map(((par.data ?? []) as { id: string; title: string }[]).map((x) => [x.id, x.title]));

    const blocks = week.blocks
      .filter((b) => istParts(new Date(b.start)).date === date)
      .map((b): DayBlock => {
        const start = mins(b.start);
        const endDay = istParts(new Date(b.end)).date;
        const t = meta.get(b.id);
        const proj = t?.project_id ? projects.get(t.project_id) : undefined;
        const goal = t?.goal_id ?? proj?.goal_id ?? null;
        const path = b.kind === 'event' ? ['Calendar events', b.title]
          : b.kind === 'habit' ? [b.area ?? 'No area', 'Habits', b.title]
          : [b.area ?? 'No area', ...(goal && goalTitle.get(goal) ? [goalTitle.get(goal)!] : []), ...(proj ? [proj.title] : []), ...(t?.parent_task_id && parentTitle.get(t.parent_task_id) ? [parentTitle.get(t.parent_task_id)!] : []), b.title];
        return { id: b.id, title: b.title, kind: b.kind, color: b.color ?? FALLBACK[b.kind], area: b.area ?? null, start, end: endDay > date ? 1440 : Math.max(mins(b.end), start), done: !!b.done, path };
      });
    return { date, blocks };
  });
}
