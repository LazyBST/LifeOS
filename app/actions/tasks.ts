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
  subtaskCounts,
  updateTask,
} from '@/lib/domain/tasks';
import { listAreas, areaColor } from '@/lib/domain/areas';
import { listGoals } from '@/lib/domain/goals';
import { listProjects } from '@/lib/domain/projects';
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

export async function listTasksAction(filters: TaskFilters): Promise<ActionResult<TaskListItem[]>> {
  return run(async () => {
    await requireUser();
    const [tasks, areas, goals, projects] = await Promise.all([
      listTasks(filters),
      listAreas(),
      listGoals(),
      listProjects(),
    ]);
    const areaMap = new Map(areas.map((a) => [a.id, a]));
    const goalMap = new Map(goals.map((g) => [g.id, g.title]));
    const projectMap = new Map(projects.map((p) => [p.id, p.title]));
    const counts = await subtaskCounts(tasks.map((t) => t.id));
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
