// reminder_*, habit_*, journal_* (spec section 7 tool table, Part 2). Every
// mutating tool here returns `data: { before, after }` so `runTool` in
// lib/agent/registry.ts writes the agent_actions audit row, same convention
// as lib/agent/tools/entities.ts.
//
// Deviation note: the resolver (lib/agent/resolver.ts) already resolves
// `habit` refs end-to-end (its `RefType` and `TABLE`/`TITLE_KEY` maps include
// 'habit', and it is read-only so this part does not need to touch it) — so
// habit_update/habit_checkin resolve through `resolveRef(..., { types:
// ['habit'] })` exactly like the entity tools resolve goals/projects/tasks.
// Reminders have no resolver support (and the spec gives them no `ref`
// concept — `reminder_cancel` takes `id` or `text`), so reminder_cancel's
// text-match path is hand-rolled below using the same `resolveRanked`
// thresholds from lib/agent/rank.ts, never a locally invented threshold.
import 'server-only';
import { z } from 'zod';
import type { ToolDef, ToolOutcome } from '../types';
import { ToolError } from '../types';
import { resolveRef, toPendingChoice, askMessage, trigramSimilarity, type RefType } from '../resolver';
import { resolveRanked, type Candidate } from '../rank';
import { parseDateIST, istInstant, formatDate, istDate } from '@/lib/time';
import { admin } from '@/lib/supabase/admin';
import {
  createReminder, listReminders, cancelReminder,
} from '@/lib/domain/reminders';
import {
  createHabit, updateHabit, getHabit, checkinHabit, habitStatuses, type HabitPatch,
} from '@/lib/domain/habits';
import { getJournal, writeJournal } from '@/lib/domain/journal';
import type { Reminder, UUID } from '@/lib/types/db';

/** Copied from lib/agent/tools/entities.ts (not exported there) — turns a
 * non-'auto' resolution into a terminal ToolOutcome (ask-pending or refusal),
 * or returns the resolved id. Kept identical so behaviour matches the Part 1
 * entity tools exactly. */
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

// ---------------------------------------------------------------------------
// reminder_create / reminder_list / reminder_cancel
// ---------------------------------------------------------------------------

const RECURRENCE = z.enum(['daily', 'weekdays', 'weekly']);

const reminderCreateSchema = z.object({
  text: z.string().min(1),
  at: z.string().min(1),
  task_ref: z.string().optional(),
  recurrence: RECURRENCE.optional(),
});

const reminderCreate: ToolDef<typeof reminderCreateSchema> = {
  name: 'reminder_create',
  description: 'Create a reminder for a time, optionally tied to a task and recurring.',
  schema: reminderCreateSchema,
  part: 2,
  handler: async (input, ctx) => {
    const parsed = parseDateIST(input.at, ctx.now);
    if (!parsed) return { message: `Could not understand the time "${input.at}".` };

    // A reminder needs a clock time; default to 09:00 IST when the text
    // gave no hour (e.g. "tomorrow"), and say so.
    let remindAtISO: string;
    let echo: string;
    if (parsed.hasTime && parsed.at) {
      remindAtISO = parsed.at;
      echo = parsed.text;
    } else {
      remindAtISO = istInstant(parsed.date, '09:00').toISOString();
      echo = `${formatDate(parsed.date)} 09:00 IST (no time given, defaulted to 9am)`;
    }

    let task_id: UUID | null = null;
    if (input.task_ref) {
      const r = await resolveOrStop(input.task_ref, ['task'], ctx, 'reminder_create', input, 'task_ref', 'task');
      if ('stop' in r) return r.stop;
      task_id = r.id;
    }

    const reminder = await createReminder({
      text: input.text,
      remind_at: remindAtISO,
      task_id,
      recurrence: input.recurrence ?? null,
    });

    return {
      message: `Reminder set: "${reminder.text}" at ${echo}.`,
      cards: [{ kind: 'info', title: reminder.text, subtitle: echo }],
      data: { before: null, after: reminder },
    };
  },
};

const reminderListSchema = z.object({ pending: z.boolean().optional() });

const reminderList: ToolDef<typeof reminderListSchema> = {
  name: 'reminder_list',
  description: 'List reminders, pending ones by default.',
  schema: reminderListSchema,
  part: 2,
  handler: async (input) => {
    const reminders = await listReminders({ pending: input.pending });
    if (reminders.length === 0) return { message: 'No reminders.' };
    const lines = reminders.map((r, i) => `${i + 1}. ${r.text} — ${formatDate(r.remind_at.slice(0, 10))} ${r.remind_at.slice(11, 16)}`);
    return {
      message: lines.join('\n'),
      cards: reminders.map((r) => ({ kind: 'info' as const, title: r.text, subtitle: r.remind_at })),
      data: reminders,
    };
  },
};

async function getReminder(id: string): Promise<Reminder | null> {
  const { data } = await admin().from('reminders').select('*').eq('id', id).maybeSingle();
  return (data as Reminder) ?? null;
}

const reminderCancelSchema = z.object({ id: z.string().optional(), text: z.string().optional() });

const reminderCancel: ToolDef<typeof reminderCancelSchema> = {
  name: 'reminder_cancel',
  description: 'Cancel a pending reminder, found by id or by matching its text.',
  schema: reminderCancelSchema,
  part: 2,
  handler: async (input) => {
    if (input.id) {
      const before = await getReminder(input.id);
      if (!before) throw new ToolError(`No reminder ${input.id}`);
      const after = await cancelReminder(before.id as UUID);
      return {
        message: `Cancelled reminder "${before.text}".`,
        cards: [{ kind: 'info', title: before.text, badges: ['Cancelled'] }],
        data: { before, after },
      };
    }
    if (!input.text) return { message: 'Give either the reminder id or some of its text.' };

    const pending = await listReminders({ pending: true });
    if (pending.length === 0) return { message: 'No pending reminders.' };

    // Hand-rolled match: reminders have no resolver support, so this scores
    // candidates with the resolver's own trigram similarity and feeds the
    // same resolveRanked thresholds from lib/agent/rank.ts used everywhere
    // else — never a locally invented cutoff.
    const candidates: Candidate[] = pending.map((r) => ({
      id: r.id,
      type: 'task', // placeholder — reminders aren't in Candidate's type union; unused beyond typing here
      title: r.text,
      similarity: trigramSimilarity(input.text!, r.text),
    }));
    const res = resolveRanked(candidates);
    if (res.kind === 'none') return { message: `No pending reminder matching "${input.text}".` };
    if (res.kind === 'ask') {
      return {
        message: askMessage('reminder', res.options),
        pending: toPendingChoice('reminder_cancel', input, 'id', res.options),
      };
    }
    const before = await getReminder(res.pick.id);
    if (!before) throw new ToolError(`No reminder ${res.pick.id}`);
    const after = await cancelReminder(before.id as UUID);
    return {
      message: `Cancelled reminder "${before.text}".`,
      cards: [{ kind: 'info', title: before.text, badges: ['Cancelled'] }],
      data: { before, after },
    };
  },
};

// ---------------------------------------------------------------------------
// habit_create / habit_update / habit_checkin / habit_status
// ---------------------------------------------------------------------------

const TIME_OF_DAY = z.enum(['morning', 'afternoon', 'evening', 'any']);
const HABIT_KIND = z.enum(['boolean', 'count']);

const habitCreateSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().optional(),
  time_of_day: TIME_OF_DAY.optional(),
  kind: HABIT_KIND.optional(),
  target_value: z.number().positive().optional(),
  unit: z.string().optional(),
  days_of_week: z.array(z.number().int().min(1).max(7)).optional(),
  reminder_time: z.string().optional(),
  area: z.string().optional(),
  goal_ref: z.string().optional(),
  task_ref: z.string().optional().describe('attach as a sub-habit of this task'),
});

const habitCreate: ToolDef<typeof habitCreateSchema> = {
  name: 'habit_create',
  description: 'Create a habit with an optional cadence (days of week), target and reminder time.',
  schema: habitCreateSchema,
  part: 2,
  handler: async (input, ctx) => {
    let goal_id: UUID | undefined;
    if (input.goal_ref) {
      const r = await resolveOrStop(input.goal_ref, ['goal'], ctx, 'habit_create', input, 'goal_ref', 'goal');
      if ('stop' in r) return r.stop;
      goal_id = r.id;
    }
    let task_id: UUID | undefined;
    if (input.task_ref) {
      const r = await resolveOrStop(input.task_ref, ['task'], ctx, 'habit_create', input, 'task_ref', 'task');
      if ('stop' in r) return r.stop;
      task_id = r.id;
    }
    const habit = await createHabit({
      name: input.name,
      emoji: input.emoji ?? null,
      time_of_day: input.time_of_day,
      kind: input.kind,
      target_value: input.target_value,
      unit: input.unit ?? null,
      days_of_week: input.days_of_week,
      reminder_time: input.reminder_time ?? null,
      area: input.area ?? null,
      goal_id,
      task_id,
    });
    return {
      message: `Created habit "${habit.name}".`,
      cards: [{ kind: 'habit', title: habit.name, href: '/habits' }],
      touched: [{ type: 'habit', id: habit.id, title: habit.name }],
      data: { before: null, after: habit },
    };
  },
};

const habitUpdateSchema = z.object({
  ref: z.string().min(1),
  name: z.string().optional(),
  emoji: z.string().optional(),
  time_of_day: TIME_OF_DAY.optional(),
  kind: HABIT_KIND.optional(),
  target_value: z.number().positive().optional(),
  unit: z.string().optional(),
  days_of_week: z.array(z.number().int().min(1).max(7)).optional(),
  reminder_time: z.string().optional(),
  area: z.string().optional(),
  goal_ref: z.string().optional(),
  archived: z.boolean().optional(),
});

const habitUpdate: ToolDef<typeof habitUpdateSchema> = {
  name: 'habit_update',
  description: 'Update a habit found by name: cadence, target, reminder time, Area/goal link, or archive it.',
  schema: habitUpdateSchema,
  part: 2,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.ref, ['habit'], ctx, 'habit_update', input, 'ref', 'habit');
    if ('stop' in resolved) return resolved.stop;
    const before = await getHabit(resolved.id);
    if (!before) throw new ToolError(`No habit ${resolved.id}`);

    let goal_id: UUID | undefined;
    if (input.goal_ref) {
      const r = await resolveOrStop(input.goal_ref, ['goal'], ctx, 'habit_update', input, 'goal_ref', 'goal');
      if ('stop' in r) return r.stop;
      goal_id = r.id;
    }

    const patch: HabitPatch = {
      name: input.name,
      emoji: input.emoji,
      time_of_day: input.time_of_day,
      kind: input.kind,
      target_value: input.target_value,
      unit: input.unit,
      days_of_week: input.days_of_week,
      reminder_time: input.reminder_time,
      area: input.area,
      goal_id,
      archived_at: input.archived === undefined ? undefined : input.archived ? new Date().toISOString() : null,
    };
    const after = await updateHabit(before.id, patch);
    return {
      message: `Updated habit "${after.name}".`,
      cards: [{ kind: 'habit', title: after.name, href: '/habits' }],
      touched: [{ type: 'habit', id: after.id, title: after.name }],
      data: { before, after },
    };
  },
};

const habitCheckinSchema = z.object({
  ref: z.string().min(1),
  date: z.string().optional(),
  value: z.number().optional(),
});

const habitCheckin: ToolDef<typeof habitCheckinSchema> = {
  name: 'habit_checkin',
  description: 'Check in a habit for today (or a given date) and report the current streak.',
  schema: habitCheckinSchema,
  part: 2,
  handler: async (input, ctx) => {
    const resolved = await resolveOrStop(input.ref, ['habit'], ctx, 'habit_checkin', input, 'ref', 'habit');
    if ('stop' in resolved) return resolved.stop;
    const before = await getHabit(resolved.id);
    if (!before) throw new ToolError(`No habit ${resolved.id}`);

    let date: string | undefined;
    let dateEcho = '';
    if (input.date) {
      const parsed = parseDateIST(input.date, ctx.now);
      if (!parsed) return { message: `Could not understand the date "${input.date}".` };
      date = parsed.date;
      dateEcho = ` (${parsed.text})`;
    }

    const checkinDate = date ?? istDate(ctx.now);
    // Capture the pre-checkin state (not just the habit) so undo_last can
    // either delete the new checkin row or restore the value it overwrote.
    const { data: priorCheckin } = await admin()
      .from('habit_checkins')
      .select('*')
      .eq('habit_id', before.id)
      .eq('checkin_date', checkinDate)
      .maybeSingle();

    const { habit, checkin, current_streak } = await checkinHabit(before.id, { date, value: input.value });
    const streakText = current_streak > 0 ? ` ${current_streak}-day streak.` : '';
    return {
      message: `${habit.name} checked in${dateEcho}.${streakText}`,
      cards: [{ kind: 'habit', title: habit.name, subtitle: `${current_streak}-day streak`, href: '/habits' }],
      touched: [{ type: 'habit', id: habit.id, title: habit.name }],
      data: { before: priorCheckin ?? null, after: checkin },
    };
  },
};

const habitStatusSchema = z.object({ date: z.string().optional() });

const habitStatus: ToolDef<typeof habitStatusSchema> = {
  name: 'habit_status',
  description: "Today's (or a given date's) habit statuses: due, done, and streak for each.",
  schema: habitStatusSchema,
  part: 2,
  handler: async (input, ctx) => {
    let date = istDate(ctx.now);
    let dateEcho = 'today';
    if (input.date) {
      const parsed = parseDateIST(input.date, ctx.now);
      if (!parsed) return { message: `Could not understand the date "${input.date}".` };
      date = parsed.date;
      dateEcho = parsed.text;
    }
    const statuses = await habitStatuses(date);
    const due = statuses.filter((h) => h.due && !h.skipped);
    if (due.length === 0) return { message: `No habits due ${dateEcho}.` };
    const lines = due.map((h) => `${h.name}: ${h.done ? 'done' : 'not yet'} (${h.current_streak}-day streak)`);
    return {
      message: `${dateEcho[0] === dateEcho[0].toUpperCase() ? dateEcho : dateEcho} — ${lines.join(', ')}`,
      cards: due.map((h) => ({
        kind: 'habit' as const,
        title: h.name,
        subtitle: `${h.current_streak}-day streak`,
        href: '/habits',
        badges: [h.done ? 'Done' : 'Due'],
      })),
      data: statuses,
    };
  },
};

// ---------------------------------------------------------------------------
// journal_write / journal_get
// ---------------------------------------------------------------------------

const journalWriteSchema = z.object({
  date: z.string().optional(),
  body_md: z.string().min(1),
  mood: z.number().int().min(1).max(5).optional(),
  mode: z.enum(['append', 'replace']).optional(),
});

const journalWrite: ToolDef<typeof journalWriteSchema> = {
  name: 'journal_write',
  description: "Write (append by default, or replace) today's (or a given date's) journal entry, optionally with a mood.",
  schema: journalWriteSchema,
  part: 2,
  handler: async (input, ctx) => {
    let date = istDate(ctx.now);
    let dateEcho = 'today';
    if (input.date) {
      const parsed = parseDateIST(input.date, ctx.now);
      if (!parsed) return { message: `Could not understand the date "${input.date}".` };
      date = parsed.date;
      dateEcho = parsed.text;
    }
    const before = await getJournal(date);
    const after = await writeJournal({ date, body_md: input.body_md, mood: input.mood, mode: input.mode });
    return {
      message: `Journal ${input.mode === 'replace' ? 'replaced' : 'updated'} for ${dateEcho}.`,
      cards: [{ kind: 'journal', title: `Journal — ${dateEcho}`, subtitle: after.mood ? `Mood ${after.mood}/5` : undefined }],
      data: { before: before ? { date, before: before.body_md, mood: before.mood } : { date, before: null, mood: null }, after },
    };
  },
};

const journalGetSchema = z.object({ date: z.string().optional() });

const journalGet: ToolDef<typeof journalGetSchema> = {
  name: 'journal_get',
  description: "Read today's (or a given date's) journal entry.",
  schema: journalGetSchema,
  part: 2,
  handler: async (input, ctx) => {
    let date = istDate(ctx.now);
    let dateEcho = 'today';
    if (input.date) {
      const parsed = parseDateIST(input.date, ctx.now);
      if (!parsed) return { message: `Could not understand the date "${input.date}".` };
      date = parsed.date;
      dateEcho = parsed.text;
    }
    const entry = await getJournal(date);
    if (!entry) return { message: `Nothing journaled for ${dateEcho}.` };
    return {
      message: `Journal — ${dateEcho}${entry.mood ? ` (mood ${entry.mood}/5)` : ''}:\n\n${entry.body_md}`,
      cards: [{ kind: 'journal', title: `Journal — ${dateEcho}`, subtitle: entry.mood ? `Mood ${entry.mood}/5` : undefined }],
      data: entry,
    };
  },
};

export const dailyTools: ToolDef[] = [
  reminderCreate, reminderList, reminderCancel,
  habitCreate, habitUpdate, habitCheckin, habitStatus,
  journalWrite, journalGet,
];
