'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { type ActionResult, run } from './_result';
import {
  type TaskInput,
  type TaskPatch,
  completeTask,
  createTask,
  deleteTask,
  restoreTask,
  listTasks,
  moveTask,
  reopenTask,
  updateTask,
} from '@/lib/domain/tasks';
import { listAreas, areaColor } from '@/lib/domain/areas';
import { admin } from '@/lib/supabase/admin';
import { setNotes, type NoteEntity } from '@/lib/domain/notes';
import type { Task, TaskStatus } from '@/lib/types/db';
import type { TaskFilters } from '@/lib/types/filters';

export type TaskListItem = Task & {
  area_name: string | null;
  area_color: string;
  goal_title: string | null;
  project_title: string | null;
  subtask_total: number;
  subtask_done: number;
};

/** Open subtask counts per parent, in one query that does not depend on the task list. */
async function allSubtaskCounts(): Promise<Record<string, { total: number; done: number }>> {
  const out: Record<string, { total: number; done: number }> = {};
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await admin()
      .from('tasks')
      .select('parent_task_id,status')
      .not('parent_task_id', 'is', null)
      .is('deleted_at', null)
      .range(from, from + 999);
    for (const r of (data ?? []) as { parent_task_id: string; status: string }[]) {
      const e = (out[r.parent_task_id] ??= { total: 0, done: 0 });
      e.total += 1;
      if (r.status === 'done') e.done += 1;
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

export async function listTasksAction(filters: TaskFilters): Promise<ActionResult<TaskListItem[]>> {
  return run(async () => {
    await requireUser();
    // every query runs at once; the names only need id + title/colour, not whole rows
    const [tasks, areas, goals, projects, counts] = await Promise.all([
      listTasks(filters),
      listAreas(),
      admin().from('goals').select('id,title').is('deleted_at', null),
      admin().from('projects').select('id,title').is('deleted_at', null),
      allSubtaskCounts(),
    ]);
    const areaMap = new Map(areas.map((a) => [a.id, a]));
    const goalMap = new Map(((goals.data ?? []) as { id: string; title: string }[]).map((g) => [g.id, g.title]));
    const projectMap = new Map(((projects.data ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title]));
    return tasks.map((t) => {
      const area = t.area_id ? areaMap.get(t.area_id) ?? null : null;
      const c = counts[t.id];
      return {
        ...t,
        area_name: area?.name ?? null,
        area_color: areaColor(area),
        goal_title: t.goal_id ? goalMap.get(t.goal_id) ?? null : null,
        project_title: t.project_id ? projectMap.get(t.project_id) ?? null : null,
        subtask_total: c?.total ?? 0,
        subtask_done: c?.done ?? 0,
      };
    });
  });
}

export async function createTaskAction(input: TaskInput): Promise<ActionResult<Task>> {
  return run(async () => {
    await requireUser();
    const task = await createTask(input);
    revalidatePath('/', 'layout');
    return task;
  });
}

export async function updateTaskAction(id: string, patch: TaskPatch): Promise<ActionResult<Task>> {
  return run(async () => {
    await requireUser();
    const task = await updateTask(id, patch);
    revalidatePath('/', 'layout');
    return task;
  });
}

export async function completeTaskAction(id: string): Promise<ActionResult<Task>> {
  return run(async () => {
    await requireUser();
    const task = await completeTask(id);
    revalidatePath('/', 'layout');
    return task;
  });
}

export async function reopenTaskAction(id: string): Promise<ActionResult<Task>> {
  return run(async () => {
    await requireUser();
    const task = await reopenTask(id);
    revalidatePath('/', 'layout');
    return task;
  });
}

export async function deleteTaskAction(id: string): Promise<ActionResult<Task>> {
  return run(async () => {
    await requireUser();
    const task = await deleteTask(id);
    revalidatePath('/', 'layout');
    return task;
  });
}

export async function restoreTaskAction(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await restoreTask(id);
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function moveTaskAction(
  id: string,
  status: TaskStatus,
  sortOrder?: number,
): Promise<ActionResult<Task>> {
  return run(async () => {
    await requireUser();
    const task = await moveTask(id, status, sortOrder);
    revalidatePath('/', 'layout');
    return task;
  });
}

export async function saveNotesAction(
  type: NoteEntity,
  id: string,
  markdown: string,
): Promise<ActionResult<string>> {
  return run(async () => {
    await requireUser();
    const notes = await setNotes(type, id, markdown);
    revalidatePath('/', 'layout');
    return notes;
  });
}
