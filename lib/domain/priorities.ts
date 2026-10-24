import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { completeTask, reopenTask } from './tasks';
import { istDate } from '@/lib/time';

export type Priority3 = { position: 1 | 2 | 3; text: string; task_id: string | null; done: boolean } | null;

export async function getPriorities(date = istDate()): Promise<Priority3[]> {
  const { data } = await admin().from('daily_priorities').select('*').eq('plan_date', date);
  const rows = (data ?? []) as { position: 1 | 2 | 3; text: string; task_id: string | null; done_at: string | null }[];
  return ([1, 2, 3] as const).map((p) => {
    const r = rows.find((x) => x.position === p);
    return r ? { position: p, text: r.text, task_id: r.task_id, done: !!r.done_at } : null;
  });
}

export async function setPriority(date: string, position: 1 | 2 | 3, text: string, taskId?: string | null): Promise<void> {
  const clean = text.trim();
  if (!clean) {
    const { error } = await admin().from('daily_priorities').delete().eq('plan_date', date).eq('position', position);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await admin().from('daily_priorities').upsert({ plan_date: date, position, text: clean, task_id: taskId ?? null, done_at: null });
  if (error) throw new Error(error.message);
}

/** Ticking a priority that is linked to a task completes (or reopens) that task too. */
export async function togglePriority(date: string, position: 1 | 2 | 3): Promise<void> {
  const { data } = await admin().from('daily_priorities').select('*').eq('plan_date', date).eq('position', position).maybeSingle();
  if (!data) return;
  const done = !data.done_at;
  const { error } = await admin().from('daily_priorities').update({ done_at: done ? new Date().toISOString() : null }).eq('plan_date', date).eq('position', position);
  if (error) throw new Error(error.message);
  if (data.task_id) await (done ? completeTask(data.task_id) : reopenTask(data.task_id));
}
