// search, get, task_list, get_today (spec section 7 tool table). All
// read-only — no agent_actions row, no mutation-count impact.
import 'server-only';
import { z } from 'zod';
import type { ToolDef } from '../types';
import { ToolError } from '../types';
import { resolveRef, searchEntities } from '../resolver';
import { admin } from '@/lib/supabase/admin';
import { istDate, dueLabel } from '@/lib/time';
import { areaByName, getArea } from '@/lib/domain/areas';
import { getGoal } from '@/lib/domain/goals';
import { getProject, listProjects } from '@/lib/domain/projects';
import { breadcrumbFor, getTaskOrThrow, listSubtasks, listTasks } from '@/lib/domain/tasks';
import { presetFilters, type TaskFilters } from '@/lib/types/filters';
import type { Priority, TaskStatus, ToolResultCard } from '@/lib/types/db';

const REF_TYPE = z.enum(['goal', 'project', 'task', 'habit', 'book']);

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

const searchSchema = z.object({
  query: z.string().min(1),
  types: z.array(REF_TYPE).optional(),
  include_done: z.boolean().optional(),
  limit: z.number().int().positive().max(20).optional(),
});

const search: ToolDef<typeof searchSchema> = {
  name: 'search',
  description: 'Trigram search for goals, projects, tasks and habits by name.',
  schema: searchSchema,
  part: 1,
  handler: async (input) => {
    const results = await searchEntities(input.query, input.types, {
      includeDone: input.include_done,
      limit: input.limit,
    });
    if (results.length === 0) return { message: `Nothing matched "${input.query}".` };
    const cards: ToolResultCard[] = results.map((r) => ({
      kind: r.type,
      title: r.title,
      subtitle: r.path,
      href: r.type === 'goal' ? `/goals/${r.id}` : r.type === 'project' ? `/projects/${r.id}` : r.type === 'task' ? `/tasks/${r.id}` : undefined,
      badges: r.status ? [r.status] : undefined,
    }));
    return {
      message: results.map((r, i) => `${i + 1}. ${r.title}${r.path ? ` (${r.path})` : ''}`).join('\n'),
      cards,
      data: results,
    };
  },
};

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

const getSchema = z.object({ type: z.enum(['goal', 'project', 'task']), id: z.string().min(1) });

const get: ToolDef<typeof getSchema> = {
  name: 'get',
  description: 'Fetch a goal, project or task with its breadcrumb and a summary of its children.',
  schema: getSchema,
  part: 1,
  handler: async (input, ctx) => {
    if (input.type === 'goal') {
      // the ref might be an id or a name — reuse the resolver for either
      const res = await resolveRef(input.id, { types: ['goal'], ctx });
      if (res.kind !== 'auto') throw new ToolError(`No goal "${input.id}"`);
      const goal = await getGoal(res.pick.id);
      if (!goal) throw new ToolError(`No goal ${res.pick.id}`);
      const [area, projects] = await Promise.all([
        goal.area_id ? getArea(goal.area_id) : Promise.resolve(null),
        listProjects({ goal_id: goal.id }),
      ]);
      return {
        message: `${goal.emoji ?? ''} ${goal.title}`.trim(),
        cards: [{ kind: 'goal', title: goal.title, subtitle: area?.name, href: `/goals/${goal.id}` }],
        touched: [{ type: 'goal', id: goal.id, title: goal.title }],
        data: { goal, area, projects: projects.map((p) => ({ id: p.id, title: p.title, status: p.status })) },
      };
    }
    if (input.type === 'project') {
      const res = await resolveRef(input.id, { types: ['project'], ctx });
      if (res.kind !== 'auto') throw new ToolError(`No project "${input.id}"`);
      const project = await getProject(res.pick.id);
      if (!project) throw new ToolError(`No project ${res.pick.id}`);
      const [goal, tasks] = await Promise.all([
        getGoal(project.goal_id),
        listTasks({ project_id: project.id, top_level_only: true, include_done: true }),
      ]);
      const path = goal ? `${goal.title} > ${project.title}` : project.title;
      return {
        message: path,
        cards: [{ kind: 'project', title: project.title, subtitle: goal?.title, href: `/projects/${project.id}` }],
        touched: [{ type: 'project', id: project.id, title: project.title }],
        data: { project, goal, tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })) },
      };
    }
    const res = await resolveRef(input.id, { types: ['task'], ctx });
    if (res.kind !== 'auto') throw new ToolError(`No task "${input.id}"`);
    const task = await getTaskOrThrow(res.pick.id);
    const [bc, subtasks] = await Promise.all([breadcrumbFor(task), listSubtasks(task.id)]);
    return {
      message: bc.path ? `${bc.path} > ${task.title}` : task.title,
      cards: [{ kind: 'task', title: task.title, subtitle: bc.path, href: `/tasks/${task.id}`, badges: [task.status] }],
      touched: [{ type: 'task', id: task.id, title: task.title }],
      data: { task, breadcrumb: bc, subtasks: subtasks.map((t) => ({ id: t.id, title: t.title, status: t.status })) },
    };
  },
};

// ---------------------------------------------------------------------------
// task_list
// ---------------------------------------------------------------------------

const taskListSchema = z.object({
  view: z.enum(['today', 'overdue', 'week', 'inbox']).optional(),
  project_ref: z.string().optional(),
  goal_ref: z.string().optional(),
  area: z.string().optional(),
  status: z.enum(['todo', 'doing', 'review', 'done']).optional(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

function taskCard(t: { id: string; title: string; status: TaskStatus; due_date: string | null; priority: Priority }): ToolResultCard {
  const label = dueLabel(t.due_date);
  return {
    kind: 'task',
    title: t.title,
    subtitle: label ?? undefined,
    href: `/tasks/${t.id}`,
    badges: [t.status, t.priority],
  };
}

const taskList: ToolDef<typeof taskListSchema> = {
  name: 'task_list',
  description: 'List tasks by view (today, overdue, week, inbox) optionally scoped to a project, goal or area.',
  schema: taskListSchema,
  part: 1,
  handler: async (input, ctx) => {
    let goal_id: string | undefined;
    let project_id: string | undefined;
    if (input.project_ref) {
      const res = await resolveRef(input.project_ref, { types: ['project'], ctx });
      if (res.kind === 'none') return { message: `No project matching "${input.project_ref}".` };
      if (res.kind === 'ask') return { message: `Which project — ${res.options.map((o) => o.title).join(', ')}?` };
      project_id = res.pick.id;
    }
    if (input.goal_ref) {
      const res = await resolveRef(input.goal_ref, { types: ['goal'], ctx });
      if (res.kind === 'none') return { message: `No goal matching "${input.goal_ref}".` };
      if (res.kind === 'ask') return { message: `Which goal — ${res.options.map((o) => o.title).join(', ')}?` };
      goal_id = res.pick.id;
    }
    let area_id: string | undefined;
    if (input.area) {
      const a = await areaByName(input.area);
      if (!a) return { message: `No area "${input.area}".` };
      area_id = a.id;
    }

    if (input.view === 'inbox') {
      let q = admin().from('tasks').select('*').is('deleted_at', null).is('project_id', null).is('goal_id', null).is('parent_task_id', null);
      if (area_id) q = q.eq('area_id', area_id);
      if (input.status) q = q.eq('status', input.status);
      if (input.priority) q = q.eq('priority', input.priority);
      const { data, error } = await q.order('sort_order').limit(input.limit ?? 20);
      if (error) throw new Error(`task_list: ${error.message}`);
      const tasks = (data ?? []) as Parameters<typeof taskCard>[0][];
      return {
        message: tasks.length ? `${tasks.length} unsorted task(s).` : 'Nothing in the inbox.',
        cards: tasks.map(taskCard),
        data: tasks,
      };
    }

    const filters: TaskFilters = input.view ? presetFilters(input.view) : { include_done: false };
    filters.goal_id = goal_id;
    filters.project_id = project_id;
    filters.area_id = area_id;
    if (input.status) filters.status = [input.status];
    if (input.priority) filters.priority = [input.priority];
    filters.limit = input.limit ?? 20;

    const tasks = await listTasks(filters);
    return {
      message: tasks.length ? `${tasks.length} task(s).` : 'Nothing found.',
      cards: tasks.map(taskCard),
      data: tasks,
    };
  },
};

// ---------------------------------------------------------------------------
// get_today
// ---------------------------------------------------------------------------

const getTodaySchema = z.object({});

const getToday: ToolDef<typeof getTodaySchema> = {
  name: 'get_today',
  description: 'Overview for right now: overdue tasks, due today, the daily plan, habits due, spend today and journal status.',
  schema: getTodaySchema,
  part: 1,
  handler: async (_input, ctx) => {
    const today = istDate(ctx.now);
    const [overdue, dueToday] = await Promise.all([
      listTasks(presetFilters('overdue')),
      listTasks(presetFilters('today')),
    ]);

    // daily_plans / habits / habit_checkins / journal_entries / transactions
    // have no owning domain module yet (Part 2/3 build those) — read them
    // directly here rather than block get_today on work outside this part.
    const [{ data: plan }, { data: habits }, { data: journal }, { data: spendRows }] = await Promise.all([
      admin().from('daily_plans').select('*').eq('plan_date', today).maybeSingle(),
      admin().from('habits').select('id,name,days_of_week').is('archived_at', null),
      admin().from('journal_entries').select('mood,body_md').eq('entry_date', today).maybeSingle(),
      admin().from('transactions').select('amount,kind').eq('occurred_on', today).is('deleted_at', null),
    ]);

    const isoDow = new Date(ctx.now.getTime() + 330 * 60_000).getUTCDay();
    const dow = isoDow === 0 ? 7 : isoDow;
    let checkedIn = new Set<string>();
    const habitsDue = (habits ?? []).filter((h: { days_of_week: number[] | null }) => !h.days_of_week || h.days_of_week.includes(dow));
    if (habitsDue.length) {
      const { data: checkins } = await admin()
        .from('habit_checkins')
        .select('habit_id')
        .eq('checkin_date', today)
        .in('habit_id', habitsDue.map((h: { id: string }) => h.id));
      checkedIn = new Set((checkins ?? []).map((c: { habit_id: string }) => c.habit_id));
    }
    const spendToday = (spendRows ?? [])
      .filter((r: { kind: string }) => r.kind === 'expense')
      .reduce((sum: number, r: { amount: number }) => sum + Number(r.amount), 0);

    const summary = {
      overdue: overdue.map((t) => ({ id: t.id, title: t.title, due_date: t.due_date })),
      due_today: dueToday.map((t) => ({ id: t.id, title: t.title, due_at: t.due_at })),
      plan: plan ? { plan_md: plan.plan_md, accepted_at: plan.accepted_at } : null,
      habits_due: habitsDue.map((h: { id: string; name: string }) => ({ id: h.id, name: h.name, done: checkedIn.has(h.id) })),
      spend_today: spendToday,
      journal: journal ? { mood: journal.mood, written: !!journal.body_md } : { mood: null, written: false },
    };

    const lines = [
      `${overdue.length} overdue, ${dueToday.length} due today.`,
      habitsDue.length ? `${habitsDue.length - [...checkedIn].length} habit(s) still to check in.` : null,
      spendToday > 0 ? `Spent so far today: ₹${spendToday.toFixed(2)}.` : null,
      summary.journal.written ? 'Journal written for today.' : "Haven't journaled today.",
    ].filter(Boolean);

    return {
      message: lines.join(' '),
      cards: [{ kind: 'info', title: 'Today', subtitle: lines.join(' ') }],
      data: summary,
    };
  },
};

export const coreTools: ToolDef[] = [search, get, taskList, getToday];
