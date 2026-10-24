import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { areaByName } from './areas';
import { getProject } from './projects';
import { getGoal } from './goals';
import { addDays, istDate } from '@/lib/time';
import type { TaskFilters } from '@/lib/types/filters';
import type { DateStr, Priority, Task, TaskStatus, UUID } from '@/lib/types/db';

export const MAX_SUBTASK_DEPTH = 3; // spec section 4

export type TaskInput = {
  title: string;
  project_id?: UUID | null;
  goal_id?: UUID | null;
  parent_task_id?: UUID | null;
  area?: string | null;
  area_id?: UUID | null;
  status?: TaskStatus;
  priority?: Priority;
  due_date?: DateStr | null;
  due_at?: string | null;
  duration_min?: number | null;
  estimate_min?: number | null;
  notes_md?: string;
  tags?: string[];
  sort_order?: number;
};

export type TaskPatch = Partial<TaskInput> & { completed_at?: string | null };

export type Breadcrumb = {
  area?: { id: UUID; name: string } | null;
  goal?: { id: UUID; title: string; emoji: string | null } | null;
  project?: { id: UUID; title: string; emoji: string | null } | null;
  parents: { id: UUID; title: string }[];
  /** 'Website > Launch MVP' style path used in chat echoes */
  path: string;
};

export async function getTask(id: UUID): Promise<Task | null> {
  const { data } = await admin().from('tasks').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  return (data as Task) ?? null;
}

export async function getTaskOrThrow(id: UUID): Promise<Task> {
  const t = await getTask(id);
  if (!t) throw new Error(`No task ${id}`);
  return t;
}

/** Depth of a task: 0 for a top-level task, 1 for its child, and so on. */
export async function taskDepth(parentId: UUID | null | undefined): Promise<number> {
  let depth = 0;
  let cur = parentId ?? null;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) throw new Error('Subtask cycle detected');
    seen.add(cur);
    depth += 1;
    if (depth > MAX_SUBTASK_DEPTH + 2) throw new Error('Subtask nesting too deep');
    const { data } = await admin().from('tasks').select('parent_task_id').eq('id', cur).maybeSingle();
    cur = (data?.parent_task_id as UUID | null) ?? null;
  }
  return depth;
}

export async function listTasks(f: TaskFilters = {}): Promise<Task[]> {
  const today = istDate();
  let q = admin().from('tasks').select('*').is('deleted_at', null);
  if (f.area_id) q = q.eq('area_id', f.area_id);
  if (f.goal_id) q = q.eq('goal_id', f.goal_id);
  if (f.project_id) q = q.eq('project_id', f.project_id);
  if (f.parent_task_id !== undefined) {
    q = f.parent_task_id === null ? q.is('parent_task_id', null) : q.eq('parent_task_id', f.parent_task_id);
  } else if (f.top_level_only) {
    q = q.is('parent_task_id', null);
  }
  if (f.priority?.length) q = q.in('priority', f.priority);
  if (f.status?.length) q = q.in('status', f.status);
  else if (f.include_done === false) q = q.neq('status', 'done');
  switch (f.due) {
    case 'today':
      q = q.eq('due_date', today);
      break;
    case 'week':
      q = q.gte('due_date', today).lte('due_date', addDays(today, 7));
      break;
    case 'overdue':
      q = q.lt('due_date', today).neq('status', 'done');
      break;
    case 'none':
      q = q.is('due_date', null);
      break;
    case 'custom':
      if (f.due_from) q = q.gte('due_date', f.due_from);
      if (f.due_to) q = q.lte('due_date', f.due_to);
      break;
  }
  if (f.tag) q = q.contains('tags', [f.tag]);
  if (f.q) q = q.ilike('title', `%${f.q}%`);
  const { data, error } = await q
    .order('sort_order')
    .order('priority')
    .order('created_at')
    .limit(f.limit ?? 500);
  if (error) throw new Error(`tasks: ${error.message}`);
  return data as Task[];
}

export async function createTask(input: TaskInput): Promise<Task> {
  if (input.parent_task_id) {
    const depth = await taskDepth(input.parent_task_id);
    if (depth >= MAX_SUBTASK_DEPTH) {
      throw new Error(`Subtasks only nest ${MAX_SUBTASK_DEPTH} levels deep`);
    }
  }
  const area_id = input.area_id ?? (input.area ? (await areaByName(input.area))?.id ?? null : null);
  const row = {
    title: input.title,
    project_id: input.project_id ?? null,
    goal_id: input.goal_id ?? null,
    parent_task_id: input.parent_task_id ?? null,
    area_id,
    status: input.status ?? 'todo',
    priority: input.priority ?? 'P2',
    due_date: input.due_date ?? (input.due_at ? input.due_at.slice(0, 10) : null),
    due_at: input.due_at ?? null,
    duration_min: input.duration_min ?? null,
    estimate_min: input.estimate_min ?? null,
    notes_md: input.notes_md ?? '',
    tags: input.tags ?? [],
    sort_order: input.sort_order ?? Date.now() / 1000,
  };
  // the DB triggers fix up goal_id / area_id from the parent (spec section 4)
  const { data, error } = await admin().from('tasks').insert(row).select('*').single();
  if (error) throw new Error(`task_create: ${error.message}`);
  return data as Task;
}

export async function updateTask(id: UUID, patch: TaskPatch): Promise<Task> {
  if (patch.parent_task_id) {
    if (patch.parent_task_id === id) throw new Error('A task cannot be its own parent');
    const depth = await taskDepth(patch.parent_task_id);
    if (depth >= MAX_SUBTASK_DEPTH) throw new Error(`Subtasks only nest ${MAX_SUBTASK_DEPTH} levels deep`);
  }
  const row: Record<string, unknown> = {};
  for (const k of [
    'title', 'project_id', 'goal_id', 'parent_task_id', 'status', 'priority',
    'due_date', 'due_at', 'duration_min', 'estimate_min', 'notes_md', 'tags',
    'sort_order', 'completed_at',
  ] as const) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  if (patch.area_id !== undefined) row.area_id = patch.area_id;
  else if (patch.area !== undefined) row.area_id = patch.area ? (await areaByName(patch.area))?.id ?? null : null;
  if (patch.due_at !== undefined && patch.due_date === undefined) {
    row.due_date = patch.due_at ? String(patch.due_at).slice(0, 10) : null;
  }
  const { data, error } = await admin().from('tasks').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(`task_update: ${error.message}`);
  return data as Task;
}

export async function completeTask(id: UUID, completedAt?: string | null): Promise<Task> {
  const t = await updateTask(id, { status: 'done' });
  if (completedAt) {
    const { data } = await admin()
      .from('tasks')
      .update({ completed_at: completedAt })
      .eq('id', id)
      .select('*')
      .single();
    return (data as Task) ?? t;
  }
  return t;
}

export async function reopenTask(id: UUID): Promise<Task> {
  return updateTask(id, { status: 'todo' });
}

export async function deleteTask(id: UUID): Promise<Task> {
  const now = new Date().toISOString();
  const { data, error } = await admin()
    .from('tasks')
    .update({ deleted_at: now })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`task_delete: ${error.message}`);
  await admin().from('task_events').insert({
    task_id: id,
    goal_id: (data as Task).goal_id,
    project_id: (data as Task).project_id,
    area_id: (data as Task).area_id,
    event: 'deleted',
    estimate_min: (data as Task).estimate_min,
  });
  await admin().from('tasks').update({ deleted_at: now }).eq('parent_task_id', id).is('deleted_at', null);
  return data as Task;
}

export async function restoreTask(id: UUID): Promise<void> {
  await admin().from('tasks').update({ deleted_at: null }).eq('id', id);
}

/** Board drag-and-drop: move a card to a column and position. */
export async function moveTask(id: UUID, status: TaskStatus, sortOrder?: number): Promise<Task> {
  return updateTask(id, { status, ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}) });
}

export async function listSubtasks(parentId: UUID): Promise<Task[]> {
  return listTasks({ parent_task_id: parentId, include_done: true });
}

export async function breadcrumbFor(task: Task): Promise<Breadcrumb> {
  const [project, goal] = await Promise.all([
    task.project_id ? getProject(task.project_id) : Promise.resolve(null),
    task.goal_id ? getGoal(task.goal_id) : Promise.resolve(null),
  ]);
  const parents: { id: UUID; title: string }[] = [];
  let cur = task.parent_task_id;
  while (cur && parents.length < MAX_SUBTASK_DEPTH + 1) {
    const p = await getTask(cur);
    if (!p) break;
    parents.unshift({ id: p.id, title: p.title });
    cur = p.parent_task_id;
  }
  let area: { id: UUID; name: string } | null = null;
  if (task.area_id) {
    const { data } = await admin().from('areas').select('id,name').eq('id', task.area_id).maybeSingle();
    area = (data as { id: UUID; name: string }) ?? null;
  }
  const parts = [goal?.title, project?.title, ...parents.map((p) => p.title)].filter(Boolean) as string[];
  return { area, goal, project, parents, path: parts.join(' > ') };
}

/** Counts used on board cards. */
export async function subtaskCounts(ids: UUID[]): Promise<Record<string, { total: number; done: number }>> {
  if (ids.length === 0) return {};
  const { data } = await admin()
    .from('tasks')
    .select('parent_task_id,status')
    .in('parent_task_id', ids)
    .is('deleted_at', null);
  const out: Record<string, { total: number; done: number }> = {};
  for (const r of (data ?? []) as { parent_task_id: string; status: TaskStatus }[]) {
    const e = (out[r.parent_task_id] ??= { total: 0, done: 0 });
    e.total += 1;
    if (r.status === 'done') e.done += 1;
  }
  return out;
}
