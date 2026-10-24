import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { istDate } from '@/lib/time';
import { buildLedger, type Ledger, type LedgerTask } from './ledger-math';
import type { UUID } from '@/lib/types/db';

type Row = { id: string; title: string; status: string; original_due_date: string | null; due_date: string | null; completed_at: string | null; parent_task_id: string | null };
const COLS = 'id,title,status,original_due_date,due_date,completed_at,parent_task_id';

async function fetchAll(scope: { goal_id?: UUID; project_id?: UUID }): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin().from('tasks').select(COLS).is('deleted_at', null);
    if (scope.goal_id) q = q.eq('goal_id', scope.goal_id);
    if (scope.project_id) q = q.eq('project_id', scope.project_id);
    const { data, error } = await q.order('id').range(from, from + 999);
    if (error) return []; // migration 0008 not applied yet: no ledger
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Leaf units only: a task that has subtasks is represented by its subtasks. */
function leaves(rows: Row[]): LedgerTask[] {
  const parents = new Set(rows.map((r) => r.parent_task_id).filter(Boolean) as string[]);
  return rows.filter((r) => !parents.has(r.id)).map((r) => ({ ...r, done: r.status === 'done' }));
}

export async function ledgerForGoal(goalId: UUID, today = istDate()): Promise<Ledger> {
  return buildLedger(leaves(await fetchAll({ goal_id: goalId })), today);
}

export async function ledgerForProject(projectId: UUID, today = istDate()): Promise<Ledger> {
  return buildLedger(leaves(await fetchAll({ project_id: projectId })), today);
}

/** Subtasks (any depth) of a task. */
export async function ledgerForTask(task: { id: UUID; goal_id: UUID | null; project_id: UUID | null }, today = istDate()): Promise<Ledger> {
  const rows = await fetchAll(task.project_id ? { project_id: task.project_id } : task.goal_id ? { goal_id: task.goal_id } : {});
  const byParent = new Map<string, Row[]>();
  for (const r of rows) if (r.parent_task_id) byParent.set(r.parent_task_id, [...(byParent.get(r.parent_task_id) ?? []), r]);
  const desc: Row[] = [];
  const walk = (id: string) => { for (const c of byParent.get(id) ?? []) { desc.push(c); walk(c.id); } };
  walk(task.id);
  const self = rows.find((r) => r.id === task.id);
  return buildLedger(desc.length ? leaves(desc) : self ? leaves([{ ...self, parent_task_id: null }]) : [], today);
}

/** How many times an agreed deadline was pushed later. */
export async function slipCount(entity: 'task' | 'project' | 'goal', id: UUID): Promise<number> {
  const { data, error } = await admin().from('deadline_changes').select('old_date,new_date').eq('entity', entity).eq('entity_id', id);
  if (error || !data) return 0;
  return data.filter((d: { old_date: string | null; new_date: string | null }) => d.old_date && d.new_date && d.new_date > d.old_date).length;
}
