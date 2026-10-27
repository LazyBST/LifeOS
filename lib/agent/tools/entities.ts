// goal_*, project_* and task_* tools (spec section 7 tool table). Every tool
// here that mutates returns `data: { before, after }` — the shape
// lib/agent/registry.ts reads to write the agent_actions audit row; see the
// comment at the top of registry.ts for the convention.
import 'server-only';
import { z } from 'zod';
import type { ToolDef, ToolOutcome } from '../types';
import { ToolError } from '../types';
import { resolveRef, toPendingChoice, askMessage, type RefType } from '../resolver';
import { parseDateIST } from '@/lib/time';
import { areaByName } from '@/lib/domain/areas';
import {
  createGoal, deleteGoal, getGoal, updateGoal, type GoalPatch,
} from '@/lib/domain/goals';
import {
  createProject, deleteProject, getProject, updateProject, type ProjectPatch,
} from '@/lib/domain/projects';
import {
  breadcrumbFor, completeTask, createTask, deleteTask, getTaskOrThrow, reopenTask, updateTask, type TaskPatch,
} from '@/lib/domain/tasks';
import type { UUID } from '@/lib/types/db';

const PRIORITY = z.enum(['P0', 'P1', 'P2', 'P3']);
const ENTITY_STATUS = z.enum(['active', 'review', 'paused', 'done', 'dropped']);
const TASK_STATUS = z.enum(['todo', 'doing', 'review', 'done']);

/** A tool ref resolution that isn't 'auto' turns into a terminal ToolOutcome
 * (an ask-pending or a plain refusal); 'auto' returns the resolved id. */
async function resolveOrStop(
  ref: string,
  types: RefType[],
  ctx: Parameters<ToolDef['handler']>[1],
  tool: string,
  input: Record<string, unknown>,
  field: string,
  label: string,
): Promise<{ id: UUID; path?: string } | { stop: ToolOutcome }> {
  const res = await resolveRef(ref, { types, ctx });
  if (res.kind === 'auto') return { id: res.pick.id as UUID, path: res.pick.path };
  if (res.kind === 'ask') {
    return { stop: { message: askMessage(label, res.options), pending: toPendingChoice(tool, input, field, res.options) } };
  }
  return { stop: { message: `No ${label} matching "${ref}". I won't create one automatically — tell me which one, or ask me to create it.` } };
}

function dateFields(startText?: string, targetText?: string, now?: Date): { start_date?: string | null; target_date?: string | null; echo: string[] } | { error: string } {
  const echo: string[] = [];
  let start_date: string | null | undefined;
  let target_date: string | null | undefined;
  if (startText !== undefined) {
    const parsed = parseDateIST(startText, now);
    if (!parsed) return { error: `Could not understand the start date "${startText}".` };
    start_date = parsed.date;
    echo.push(`starts ${parsed.text}`);
  }
  if (targetText !== undefined) {
    const parsed = parseDateIST(targetText, now);
    if (!parsed) return { error: `Could not understand the target date "${targetText}".` };
    target_date = parsed.date;
    echo.push(`due ${parsed.text}`);
  }
  return { start_date, target_date, echo };
}

// ---------------------------------------------------------------------------
// goal_create / goal_update / goal_delete
// ---------------------------------------------------------------------------

const goalCreateSchema = z.object({
  title: z.string().min(1),
  emoji: z.string().optional(),
  area: z.string().optional(),
  priority: PRIORITY.optional(),
  start_date: z.string().optional(),
  target_date: z.string().optional(),
  status: ENTITY_STATUS.optional(),
  notes_md: z.string().optional(),
});

const goalCreate: ToolDef<typeof goalCreateSchema> = {
  name: 'goal_create',
  description: 'Create a new goal, optionally under an Area, with a priority and dates.',
  schema: goalCreateSchema,
  part: 1,
  handler: async (input, ctx) => {
    const dates = dateFields(input.start_date, input.target_date, ctx.now);
    if ('error' in dates) return { message: dates.error };
    const goal = await createGoal({
      title: input.title,
      emoji: input.emoji ?? null,
      area: input.area ?? null,
      priority: input.priority,
      status: input.status,
      start_date: dates.start_date,
      target_date: dates.target_date,
      notes_md: input.notes_md,
    });
    const echo = dates.echo.length ? ` (${dates.echo.join(', ')})` : '';
    return {
      message: `Created goal "${goal.title}"${echo}.`,
      cards: [{ kind: 'goal', title: goal.title, href: `/goals/${goal.id}` }],
      touched: [{ type: 'goal', id: goal.id, title: goal.title }],
      data: { before: null, after: goal },
    };
  },
};

const goalUpdateSchema = z.object({
  ref: z.string().min(1),
  title: z.string().optional(),
  emoji: z.string().optional(),
  area: z.string().optional(),
  priority: PRIORITY.optional(),
  start_date: z.string().optional(),
  target_date: z.string().optional(),
  status: ENTITY_STATUS.optional(),
  notes_md: z.string().optional(),
});

const goalUpdate: ToolDef<typeof goalUpdateSchema> = {
  name: 'goal_update',
  description: 'Update a goal (title, Area, priority, dates, status, or notes) found by id or name.',
  schema: goalUpdateSchema,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.ref, ['goal'], ctx, 'goal_update', input, 'ref', 'goal');
    if ('stop' in resolved) return resolved.stop;
    const before = await getGoal(resolved.id);
    if (!before) throw new ToolError(`No goal ${resolved.id}`);
    const dates = dateFields(input.start_date, input.target_date, ctx.now);
    if ('error' in dates) return { message: dates.error };
    const patch: GoalPatch = {
      title: input.title,
      emoji: input.emoji,
      area: input.area,
      priority: input.priority,
      status: input.status,
      notes_md: input.notes_md,
      start_date: dates.start_date,
      target_date: dates.target_date,
    };
    const after = await updateGoal(before.id, patch);
    const echo = dates.echo.length ? ` (${dates.echo.join(', ')})` : '';
    return {
      message: `Updated goal "${after.title}"${echo}.`,
      cards: [{ kind: 'goal', title: after.title, href: `/goals/${after.id}` }],
      touched: [{ type: 'goal', id: after.id, title: after.title }],
      data: { before, after },
    };
  },
};

const goalDeleteSchema = z.object({ ref: z.string().min(1), confirm: z.boolean().optional() });

const goalDelete: ToolDef<typeof goalDeleteSchema> = {
  name: 'goal_delete',
  description: 'Soft-delete a goal and its projects/tasks. Needs confirm:true (spec safety rules).',
  schema: goalDeleteSchema,
  confirm: true,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.ref, ['goal'], ctx, 'goal_delete', input, 'ref', 'goal');
    if ('stop' in resolved) return resolved.stop;
    const before = await getGoal(resolved.id);
    if (!before) throw new ToolError(`No goal ${resolved.id}`);
    const after = await deleteGoal(before.id);
    return {
      message: `Deleted goal "${before.title}" and its projects and tasks. Say "undo" to bring it back.`,
      cards: [{ kind: 'goal', title: before.title }],
      data: { before, after },
    };
  },
};

// ---------------------------------------------------------------------------
// project_create / project_update / project_delete
// ---------------------------------------------------------------------------

const projectCreateSchema = z.object({
  goal_ref: z.string().min(1),
  title: z.string().min(1),
  emoji: z.string().optional(),
  area: z.string().optional(),
  priority: PRIORITY.optional(),
  start_date: z.string().optional(),
  target_date: z.string().optional(),
  status: ENTITY_STATUS.optional(),
  notes_md: z.string().optional(),
});

const projectCreate: ToolDef<typeof projectCreateSchema> = {
  name: 'project_create',
  description: 'Create a new project under a goal.',
  schema: projectCreateSchema,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.goal_ref, ['goal'], ctx, 'project_create', input, 'goal_ref', 'goal');
    if ('stop' in resolved) return resolved.stop;
    const dates = dateFields(input.start_date, input.target_date, ctx.now);
    if ('error' in dates) return { message: dates.error };
    const project = await createProject({
      goal_id: resolved.id,
      title: input.title,
      emoji: input.emoji ?? null,
      area: input.area ?? null,
      priority: input.priority,
      status: input.status,
      start_date: dates.start_date,
      target_date: dates.target_date,
      notes_md: input.notes_md,
    });
    const path = resolved.path ? `${resolved.path} > ${project.title}` : project.title;
    const echo = dates.echo.length ? ` (${dates.echo.join(', ')})` : '';
    return {
      message: `Created project "${project.title}" under ${path}${echo}.`,
      cards: [{ kind: 'project', title: project.title, subtitle: path, href: `/projects/${project.id}` }],
      touched: [{ type: 'project', id: project.id, title: project.title }],
      data: { before: null, after: project },
    };
  },
};

const projectUpdateSchema = z.object({
  ref: z.string().min(1),
  goal_ref: z.string().optional(),
  title: z.string().optional(),
  emoji: z.string().optional(),
  area: z.string().optional(),
  priority: PRIORITY.optional(),
  start_date: z.string().optional(),
  target_date: z.string().optional(),
  status: ENTITY_STATUS.optional(),
  notes_md: z.string().optional(),
});

const projectUpdate: ToolDef<typeof projectUpdateSchema> = {
  name: 'project_update',
  description: 'Update a project; changing goal_ref moves the project (and its tasks) to another goal.',
  schema: projectUpdateSchema,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.ref, ['project'], ctx, 'project_update', input, 'ref', 'project');
    if ('stop' in resolved) return resolved.stop;
    const before = await getProject(resolved.id);
    if (!before) throw new ToolError(`No project ${resolved.id}`);
    let goal_id: UUID | undefined;
    if (input.goal_ref) {
      const goalResolved = await resolveOrStop(input.goal_ref, ['goal'], ctx, 'project_update', input, 'goal_ref', 'goal');
      if ('stop' in goalResolved) return goalResolved.stop;
      goal_id = goalResolved.id;
    }
    const dates = dateFields(input.start_date, input.target_date, ctx.now);
    if ('error' in dates) return { message: dates.error };
    const patch: ProjectPatch = {
      goal_id,
      title: input.title,
      emoji: input.emoji,
      area: input.area,
      priority: input.priority,
      status: input.status,
      notes_md: input.notes_md,
      start_date: dates.start_date,
      target_date: dates.target_date,
    };
    const after = await updateProject(before.id, patch);
    const echo = dates.echo.length ? ` (${dates.echo.join(', ')})` : '';
    return {
      message: `Updated project "${after.title}"${echo}.`,
      cards: [{ kind: 'project', title: after.title, href: `/projects/${after.id}` }],
      touched: [{ type: 'project', id: after.id, title: after.title }],
      data: { before, after },
    };
  },
};

const projectDeleteSchema = z.object({ ref: z.string().min(1), confirm: z.boolean().optional() });

const projectDelete: ToolDef<typeof projectDeleteSchema> = {
  name: 'project_delete',
  description: 'Soft-delete a project and its tasks. Needs confirm:true (spec safety rules).',
  schema: projectDeleteSchema,
  confirm: true,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.ref, ['project'], ctx, 'project_delete', input, 'ref', 'project');
    if ('stop' in resolved) return resolved.stop;
    const before = await getProject(resolved.id);
    if (!before) throw new ToolError(`No project ${resolved.id}`);
    const after = await deleteProject(before.id);
    return {
      message: `Deleted project "${before.title}" and its tasks. Say "undo" to bring it back.`,
      cards: [{ kind: 'project', title: before.title }],
      data: { before, after },
    };
  },
};

// ---------------------------------------------------------------------------
// task_create / task_update / task_complete / task_reopen / task_delete
// ---------------------------------------------------------------------------

const taskCreateSchema = z.object({
  title: z.string().min(1),
  project_ref: z.string().optional(),
  goal_ref: z.string().optional(),
  parent_task_ref: z.string().optional(),
  area: z.string().optional(),
  priority: PRIORITY.optional(),
  due_date: z.string().optional(),
  due_at: z.string().optional(),
  duration_min: z.number().int().positive().optional(),
  estimate_min: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
  notes_md: z.string().optional(),
  // Part 2 creates the reminder row; accepted here so the model's call
  // validates, but no-op until lib/domain/reminders (not owned by this part).
  remind: z.boolean().optional(),
});

/** "Add a task" with no parent means under the page entity (spec section 7
 * context rules): a Task page makes it a subtask, a Project/Goal page
 * attaches it there, and the dashboard leaves it unsorted (with an Area if
 * the page or the request names one). */
function pageDefaultLinkage(ctx: Parameters<ToolDef['handler']>[1]): {
  project_id?: UUID; goal_id?: UUID; parent_task_id?: UUID; area_id?: UUID | null;
} {
  const page = ctx.page;
  if (page.entity_type === 'task' && page.entity_id) return { parent_task_id: page.entity_id as UUID };
  if (page.entity_type === 'project' && page.entity_id) return { project_id: page.entity_id as UUID };
  if (page.entity_type === 'goal' && page.entity_id) return { goal_id: page.entity_id as UUID };
  if (page.area_id) return { area_id: page.area_id as UUID };
  return {};
}

const taskCreate: ToolDef<typeof taskCreateSchema> = {
  name: 'task_create',
  description: 'Create a task (or subtask). With no project/goal/parent named, it attaches to whatever page the user is on.',
  schema: taskCreateSchema,
  part: 1,
  handler: async (input, ctx) => {
    let project_id: UUID | undefined;
    let goal_id: UUID | undefined;
    let parent_task_id: UUID | undefined;
    let path = '';

    if (input.parent_task_ref) {
      const r = await resolveOrStop(input.parent_task_ref, ['task'], ctx, 'task_create', input, 'parent_task_ref', 'task');
      if ('stop' in r) return r.stop;
      parent_task_id = r.id;
      path = r.path ?? '';
    } else if (input.project_ref) {
      const r = await resolveOrStop(input.project_ref, ['project'], ctx, 'task_create', input, 'project_ref', 'project');
      if ('stop' in r) return r.stop;
      project_id = r.id;
      path = r.path ?? '';
    } else if (input.goal_ref) {
      const r = await resolveOrStop(input.goal_ref, ['goal'], ctx, 'task_create', input, 'goal_ref', 'goal');
      if ('stop' in r) return r.stop;
      goal_id = r.id;
      path = r.path ?? '';
    } else {
      const d = pageDefaultLinkage(ctx);
      project_id = d.project_id;
      goal_id = d.goal_id;
      parent_task_id = d.parent_task_id;
    }

    let area_id: UUID | null | undefined;
    if (input.area) {
      const a = await areaByName(input.area);
      if (!a) return { message: `No area "${input.area}".` };
      area_id = a.id;
    } else if (!project_id && !goal_id && !parent_task_id) {
      area_id = pageDefaultLinkage(ctx).area_id ?? null;
    }

    let due_date: string | null = null;
    let due_at: string | null = null;
    let dueEcho = '';
    const dueText = input.due_at ?? input.due_date;
    if (dueText) {
      const parsed = parseDateIST(dueText, ctx.now);
      if (!parsed) return { message: `Could not understand the date "${dueText}".` };
      due_date = parsed.date;
      due_at = parsed.hasTime ? parsed.at : null; // due_at only set when the text carried a clock time
      dueEcho = parsed.text;
    }

    const created = await createTask({
      title: input.title,
      project_id,
      goal_id,
      parent_task_id,
      area_id,
      priority: input.priority,
      due_date,
      due_at,
      duration_min: input.duration_min,
      estimate_min: input.estimate_min,
      tags: input.tags,
      notes_md: input.notes_md,
    });

    const bc = await breadcrumbFor(created);
    const fullPath = bc.path ? `${bc.path} > ${created.title}` : path ? `${path} > ${created.title}` : created.title;
    return {
      message: `Added "${created.title}" to ${fullPath}${dueEcho ? ` — due ${dueEcho}` : ''}.`,
      cards: [{ kind: 'task', title: created.title, subtitle: fullPath, href: `/tasks/${created.id}` }],
      touched: [{ type: 'task', id: created.id, title: created.title }],
      data: { before: null, after: created },
    };
  },
};

const taskUpdateSchema = z.object({
  ref: z.string().min(1),
  title: z.string().optional(),
  project_ref: z.string().optional(),
  goal_ref: z.string().optional(),
  parent_task_ref: z.string().optional(),
  area: z.string().optional(),
  priority: PRIORITY.optional(),
  status: TASK_STATUS.optional(),
  due_date: z.string().optional(),
  due_at: z.string().optional(),
  duration_min: z.number().int().positive().optional(),
  estimate_min: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
  notes_md: z.string().optional(),
});

const taskUpdate: ToolDef<typeof taskUpdateSchema> = {
  name: 'task_update',
  description: 'Update a task found by id or name: title, linkage, priority, status, dates, effort, tags, or notes.',
  schema: taskUpdateSchema,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.ref, ['task'], ctx, 'task_update', input, 'ref', 'task');
    if ('stop' in resolved) return resolved.stop;
    const before = await getTaskOrThrow(resolved.id);

    const patch: TaskPatch = {
      title: input.title,
      priority: input.priority,
      status: input.status,
      duration_min: input.duration_min,
      estimate_min: input.estimate_min,
      tags: input.tags,
      notes_md: input.notes_md,
      area: input.area,
    };

    if (input.project_ref) {
      const r = await resolveOrStop(input.project_ref, ['project'], ctx, 'task_update', input, 'project_ref', 'project');
      if ('stop' in r) return r.stop;
      patch.project_id = r.id;
    }
    if (input.goal_ref) {
      const r = await resolveOrStop(input.goal_ref, ['goal'], ctx, 'task_update', input, 'goal_ref', 'goal');
      if ('stop' in r) return r.stop;
      patch.goal_id = r.id;
    }
    if (input.parent_task_ref) {
      const r = await resolveOrStop(input.parent_task_ref, ['task'], ctx, 'task_update', input, 'parent_task_ref', 'task');
      if ('stop' in r) return r.stop;
      patch.parent_task_id = r.id;
    }

    let dueEcho = '';
    const dueText = input.due_at ?? input.due_date;
    if (dueText) {
      const parsed = parseDateIST(dueText, ctx.now);
      if (!parsed) return { message: `Could not understand the date "${dueText}".` };
      patch.due_date = parsed.date;
      patch.due_at = parsed.hasTime ? parsed.at : null;
      dueEcho = parsed.text;
    }

    const after = await updateTask(before.id, patch);
    const bc = await breadcrumbFor(after);
    const path = bc.path ? `${bc.path} > ${after.title}` : after.title;
    return {
      message: `Updated "${after.title}" (${path})${dueEcho ? ` — due ${dueEcho}` : ''}.`,
      cards: [{ kind: 'task', title: after.title, subtitle: path, href: `/tasks/${after.id}` }],
      touched: [{ type: 'task', id: after.id, title: after.title }],
      data: { before, after },
    };
  },
};

const taskCompleteSchema = z.object({ ref: z.string().min(1), completed_at: z.string().optional() });

const taskComplete: ToolDef<typeof taskCompleteSchema> = {
  name: 'task_complete',
  description: 'Mark a task done, optionally with a specific completion time.',
  schema: taskCompleteSchema,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.ref, ['task'], ctx, 'task_complete', input, 'ref', 'task');
    if ('stop' in resolved) return resolved.stop;
    const before = await getTaskOrThrow(resolved.id);
    let completedAt: string | undefined;
    if (input.completed_at) {
      const parsed = parseDateIST(input.completed_at, ctx.now);
      if (!parsed) return { message: `Could not understand "${input.completed_at}".` };
      completedAt = parsed.at ?? `${parsed.date}T00:00:00.000Z`;
    }
    const after = await completeTask(before.id, completedAt);
    return {
      message: `Completed "${after.title}".`,
      cards: [{ kind: 'task', title: after.title, href: `/tasks/${after.id}`, badges: ['Done'] }],
      touched: [{ type: 'task', id: after.id, title: after.title }],
      data: { before, after },
    };
  },
};

const taskReopenSchema = z.object({ ref: z.string().min(1) });

const taskReopen: ToolDef<typeof taskReopenSchema> = {
  name: 'task_reopen',
  description: 'Reopen a completed task (sets it back to not started).',
  schema: taskReopenSchema,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.ref, ['task'], ctx, 'task_reopen', input, 'ref', 'task');
    if ('stop' in resolved) return resolved.stop;
    const before = await getTaskOrThrow(resolved.id);
    const after = await reopenTask(before.id);
    return {
      message: `Reopened "${after.title}".`,
      cards: [{ kind: 'task', title: after.title, href: `/tasks/${after.id}` }],
      touched: [{ type: 'task', id: after.id, title: after.title }],
      data: { before, after },
    };
  },
};

const taskDeleteSchema = z.object({ ref: z.string().min(1) });

const taskDelete: ToolDef<typeof taskDeleteSchema> = {
  name: 'task_delete',
  description: 'Soft-delete a task and its subtasks. Undoable, no confirmation required.',
  schema: taskDeleteSchema,
  part: 1,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.ref, ['task'], ctx, 'task_delete', input, 'ref', 'task');
    if ('stop' in resolved) return resolved.stop;
    const before = await getTaskOrThrow(resolved.id);
    const after = await deleteTask(before.id);
    return {
      message: `Deleted "${before.title}". Say "undo" to bring it back.`,
      cards: [{ kind: 'task', title: before.title }],
      data: { before, after },
    };
  },
};

export const entityTools: ToolDef[] = [
  goalCreate, goalUpdate, goalDelete,
  projectCreate, projectUpdate, projectDelete,
  taskCreate, taskUpdate, taskComplete, taskReopen, taskDelete,
];
