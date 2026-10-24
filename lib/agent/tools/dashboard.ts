// Tools for the dashboard widgets: today's top 3, the journal improvement, and the schedule ledger.
import 'server-only';
import { z } from 'zod';
import type { ToolDef, ToolOutcome } from '../types';
import { resolveRef, toPendingChoice, askMessage, type RefType } from '../resolver';
import { addDays, formatDate, istDate } from '@/lib/time';
import { getPriorities, setPriority, togglePriority } from '@/lib/domain/priorities';
import { setImprovement } from '@/lib/domain/improvement';
import { getGoal } from '@/lib/domain/goals';
import { getProject } from '@/lib/domain/projects';
import { getTask } from '@/lib/domain/tasks';
import { ledgerForGoal, ledgerForProject, ledgerForTask } from '@/lib/domain/ledger';
import { describeNet } from '@/lib/domain/ledger-math';
import { admin } from '@/lib/supabase/admin';
import type { UUID } from '@/lib/types/db';

const setTop3Schema = z.object({
  priorities: z.array(z.string().min(1)).min(1).max(3).describe('1-3 priorities, most important first'),
  day: z.enum(['today', 'tomorrow']).default('today'),
});

const top3Set: ToolDef<typeof setTop3Schema> = {
  name: 'top3_set',
  description: "Set the user's top priorities (up to 3) for today or tomorrow. Replaces that day's list.",
  schema: setTop3Schema,
  part: 1,
  handler: async (input, ctx) => {
    const date = input.day === 'tomorrow' ? addDays(istDate(ctx.now), 1) : istDate(ctx.now);
    const before = await getPriorities(date);
    for (let i = 0; i < 3; i++) await setPriority(date, (i + 1) as 1 | 2 | 3, input.priorities[i] ?? '');
    return {
      message: `Top ${input.priorities.length} for ${input.day} (${formatDate(date)}): ${input.priorities.map((p, i) => `${i + 1}. ${p}`).join('; ')}.`,
      cards: [{ kind: 'info', title: `Top ${input.priorities.length} · ${input.day}`, subtitle: input.priorities.join(' · '), href: '/' }],
      data: { before: { date, items: before }, after: { date, items: input.priorities } },
    };
  },
};

const getTop3Schema = z.object({ day: z.enum(['today', 'tomorrow']).default('today') });
const top3Get: ToolDef<typeof getTop3Schema> = {
  name: 'top3_get',
  description: "Read the user's top priorities (up to 3) for today or tomorrow, and whether each is done. Use for \"what are my top three today?\".",
  schema: getTop3Schema,
  part: 1,
  handler: async (input, ctx) => {
    const date = input.day === 'tomorrow' ? addDays(istDate(ctx.now), 1) : istDate(ctx.now);
    const items = (await getPriorities(date)).filter((p): p is NonNullable<typeof p> => !!p);
    if (items.length === 0) return { message: `No top priorities set for ${input.day}. Ask the user for up to three and call top3_set.` };
    return { message: `Top priorities for ${input.day} (${formatDate(date)}): ${items.map((p) => `${p.position}. ${p.text}${p.done ? ' ✓' : ''}`).join('; ')}.`, data: items };
  },
};

const doneSchema = z.object({ position: z.number().int().min(1).max(3) });
const top3Done: ToolDef<typeof doneSchema> = {
  name: 'top3_toggle',
  description: "Tick (or untick) today's top-3 priority at a position 1-3. A priority linked to a task completes that task.",
  schema: doneSchema,
  part: 1,
  handler: async (input, ctx) => {
    const date = istDate(ctx.now);
    const before = await getPriorities(date);
    const item = before[input.position - 1];
    if (!item) return { message: `There is no priority ${input.position} set for today.` };
    await togglePriority(date, input.position as 1 | 2 | 3);
    return {
      message: `${item.done ? 'Unticked' : 'Ticked'} priority ${input.position}: ${item.text}.`,
      cards: [{ kind: 'info', title: `${item.done ? 'Reopened' : 'Done'}: ${item.text}`, href: '/' }],
      data: { before: { date, items: before }, after: { date, toggled: input.position } },
    };
  },
};

const improvementSchema = z.object({ text: z.string().min(1).describe('one concrete thing to do better tomorrow') });
const improvementSet: ToolDef<typeof improvementSchema> = {
  name: 'improvement_set',
  description: "Save tonight's one improvement from the journal. It shows on the dashboard tomorrow morning.",
  schema: improvementSchema,
  part: 2,
  handler: async (input, ctx) => {
    const date = istDate(ctx.now);
    const { data } = await admin().from('journal_entries').select('improvement').eq('entry_date', date).maybeSingle();
    await setImprovement(date, input.text);
    return {
      message: `Saved for tomorrow: "${input.text}".`,
      cards: [{ kind: 'journal', title: 'Improvement for tomorrow', subtitle: input.text }],
      data: { before: { date, improvement: (data?.improvement as string | null) ?? null }, after: { date, improvement: input.text } },
    };
  },
};

const ledgerSchema = z.object({ ref: z.string().optional().describe('goal, project or task; defaults to the current page') });
const scheduleReport: ToolDef<typeof ledgerSchema> = {
  name: 'schedule_report',
  description:
    "How many days a goal, project or task has been pushed later or pulled earlier against its first agreed deadlines, with the items behind it. Late work adds days, early work subtracts them.",
  schema: ledgerSchema,
  part: 1,
  handler: async (input, ctx): Promise<ToolOutcome> => {
    let type: 'goal' | 'project' | 'task';
    let id: UUID;
    if (!input.ref && ctx.page.entity_id && ['goal', 'project', 'task'].includes(ctx.page.entity_type)) {
      type = ctx.page.entity_type as typeof type;
      id = ctx.page.entity_id as UUID;
    } else if (input.ref) {
      const types: RefType[] = ['goal', 'project', 'task'];
      const res = await resolveRef(input.ref, { types, ctx });
      if (res.kind === 'ask') return { message: askMessage('item', res.options), pending: toPendingChoice('schedule_report', input, 'ref', res.options) };
      if (res.kind !== 'auto') return { message: `Nothing matching "${input.ref}".` };
      type = res.pick.type as typeof type;
      id = res.pick.id as UUID;
    } else {
      return { message: 'Tell me which goal, project or task, or open its page first.' };
    }
    const today = istDate(ctx.now);
    let title = '';
    let ledger;
    let href = '';
    if (type === 'goal') { const g = await getGoal(id); if (!g) return { message: 'Goal not found.' }; title = g.title; ledger = await ledgerForGoal(id, today); href = `/goals/${id}`; }
    else if (type === 'project') { const p = await getProject(id); if (!p) return { message: 'Project not found.' }; title = p.title; ledger = await ledgerForProject(id, today); href = `/projects/${id}`; }
    else { const t = await getTask(id); if (!t) return { message: 'Task not found.' }; title = t.title; ledger = await ledgerForTask(t, today); href = `/tasks/${id}`; }
    const top = ledger.rows.filter((r) => r.delta !== 0).slice(0, 5).map((r) => `${r.title} ${r.delta > 0 ? '+' : '−'}${Math.abs(r.delta)}d`);
    return {
      message: `${describeNet(ledger.net, title)} (late +${ledger.lateDays}, early −${ledger.earlyDays}).${top.length ? ` Biggest movers: ${top.join('; ')}.` : ''}`,
      cards: [{ kind: 'report', title: `${title}: ${ledger.net > 0 ? '+' : ''}${ledger.net} days`, subtitle: top.join(' · ') || 'on schedule', href }],
    };
  },
};

export const dashboardTools: ToolDef[] = [top3Set, top3Get, top3Done, improvementSet, scheduleReport] as unknown as ToolDef[];
