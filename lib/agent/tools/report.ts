// `report` (spec section 7 tool table, Part 3): "returns numbers and a deep
// link to the page" — the same numbers the goal/project pages, /analytics
// and /money already show, read straight from the domain layer
// (lib/domain/analytics.ts, lib/domain/habits.ts, lib/domain/money.ts), never
// an ad-hoc query of our own. Read-only — no agent_actions row.
import 'server-only';
import { z } from 'zod';
import type { ToolDef, ToolOutcome } from '../types';
import { resolveRef, toPendingChoice, askMessage, type RefType } from '../resolver';
import { parseDateIST, istDate, addDays, formatDate } from '@/lib/time';
import { goalForecast, projectForecasts, completedDaily } from '@/lib/domain/analytics';
import { habitStatuses } from '@/lib/domain/habits';
import { mySpending, spendByCategory, wallet, formatINR } from '@/lib/domain/money';
import type { UUID } from '@/lib/types/db';

/** Copied from lib/agent/tools/entities.ts (not exported there) — turns a
 * non-'auto' ref resolution into a terminal ToolOutcome (ask-pending or
 * refusal), or returns the resolved id, same as every other tool that takes
 * a `ref`. */
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

/** `range` resolved to a single IST date, defaulting to today. Used by the
 * 'day' and 'habits' kinds. */
function resolveAnchorDate(range: string | undefined, now: Date): { date: string; echo: string } | { error: string } {
  if (!range) return { date: istDate(now), echo: 'today' };
  const parsed = parseDateIST(range, now);
  if (!parsed) return { error: `Could not understand "${range}" as a date.` };
  return { date: parsed.date, echo: parsed.text };
}

const reportSchema = z.object({
  kind: z.enum(['goal', 'project', 'day', 'week', 'habits', 'spending']),
  /** a date/period, read differently per kind: an anchor day for 'day'/'habits',
   * the end of the window for 'week', or a period keyword
   * (this_month/last_month/last_7d/last_30d) for 'spending'. */
  range: z.string().optional(),
  /** entity ref, required for 'goal' and 'project' */
  ref: z.string().optional(),
});

const report: ToolDef<typeof reportSchema> = {
  name: 'report',
  description:
    "Numbers the UI already shows, plus a deep link: 'goal'/'project' (ref required) give progress/velocity/forecast; 'day'/'habits' take an optional date in range (default today); 'week' takes an optional end date in range (default today, covers the trailing 7 days); 'spending' takes an optional period in range: this_month (default), last_month, last_7d, last_30d.",
  schema: reportSchema,
  part: 3,
  handler: async (input, ctx) => {
    switch (input.kind) {
      case 'goal': {
        if (!input.ref) return { message: 'Which goal?' };
        const resolved = await resolveOrStop(input.ref, ['goal'], ctx, 'report', input, 'ref', 'goal');
        if ('stop' in resolved) return resolved.stop;
        const fc = await goalForecast(resolved.id, istDate(ctx.now));
        if (!fc) return { message: 'No progress data for that goal yet.' };
        const target = fc.target_date ? ` — target ${formatDate(fc.target_date)}` : '';
        const eta = fc.projectedDate
          ? `, on track for ${formatDate(fc.projectedDate)}`
          : fc.rough
            ? ' (too little history to forecast)'
            : '';
        return {
          message: `${fc.title}: ${fc.progressPct}% done, ${fc.remainingHours}h left${eta}${target}.`,
          cards: [{ kind: 'goal', title: fc.title, subtitle: `${fc.progressPct}% done`, href: `/goals/${fc.goal_id}` }],
          touched: [{ type: 'goal', id: fc.goal_id, title: fc.title }],
          data: fc,
        };
      }

      case 'project': {
        if (!input.ref) return { message: 'Which project?' };
        const resolved = await resolveOrStop(input.ref, ['project'], ctx, 'report', input, 'ref', 'project');
        if ('stop' in resolved) return resolved.stop;
        const list = await projectForecasts(undefined, istDate(ctx.now));
        const fc = list.find((p) => p.project_id === resolved.id);
        if (!fc) return { message: 'No progress data for that project yet.' };
        const target = fc.target_date ? ` — target ${formatDate(fc.target_date)}` : '';
        const eta = fc.projectedDate
          ? `, on track for ${formatDate(fc.projectedDate)}`
          : fc.rough
            ? ' (too little history to forecast)'
            : '';
        return {
          message: `${fc.title}: ${fc.progressPct}% done, ${fc.remainingHours}h left${eta}${target}.`,
          cards: [{ kind: 'project', title: fc.title, subtitle: `${fc.progressPct}% done`, href: `/projects/${fc.project_id}` }],
          touched: [{ type: 'project', id: fc.project_id, title: fc.title }],
          data: fc,
        };
      }

      case 'day': {
        const anchor = resolveAnchorDate(input.range, ctx.now);
        if ('error' in anchor) return { message: anchor.error };
        const [daily, habits, spendRows] = await Promise.all([
          completedDaily(1),
          habitStatuses(anchor.date),
          mySpending(anchor.date, anchor.date),
        ]);
        const todays = daily.filter((d) => d.day === anchor.date);
        const tasksDone = todays.reduce((a, d) => a + d.tasks, 0);
        const effortMin = todays.reduce((a, d) => a + d.effort_min, 0);
        const due = habits.filter((h) => h.due);
        const habitsDone = due.filter((h) => h.done).length;
        const spend = spendRows.reduce((a, r) => a + r.amount, 0);
        return {
          message:
            `${anchor.echo}: ${tasksDone} task${tasksDone === 1 ? '' : 's'} done (${Math.round(effortMin / 60)}h), ` +
            `${habitsDone}/${due.length} habits, spent ${formatINR(spend)}.`,
          cards: [
            {
              kind: 'report',
              title: `Day — ${anchor.echo}`,
              subtitle: `${tasksDone} tasks · ${habitsDone}/${due.length} habits · ${formatINR(spend)}`,
              href: '/analytics',
            },
          ],
          data: { date: anchor.date, tasksDone, effortMin, habitsDue: due.length, habitsDone, spend },
        };
      }

      case 'week': {
        const anchor = resolveAnchorDate(input.range, ctx.now);
        if ('error' in anchor) return { message: anchor.error };
        const from = addDays(anchor.date, -6);
        const [daily, spendRows] = await Promise.all([completedDaily(7), spendByCategory(from, anchor.date)]);
        const inWeek = daily.filter((d) => d.day >= from && d.day <= anchor.date);
        const tasksDone = inWeek.reduce((a, d) => a + d.tasks, 0);
        const effortMin = inWeek.reduce((a, d) => a + d.effort_min, 0);
        const spend = spendRows.reduce((a, r) => a + r.amount, 0);
        return {
          message: `${formatDate(from)} – ${anchor.echo}: ${tasksDone} task${tasksDone === 1 ? '' : 's'} done (${Math.round(effortMin / 60)}h), spent ${formatINR(spend)}.`,
          cards: [
            {
              kind: 'report',
              title: `Week ending ${anchor.echo}`,
              subtitle: `${tasksDone} tasks · ${formatINR(spend)}`,
              href: '/analytics',
            },
          ],
          data: { from, to: anchor.date, tasksDone, effortMin, spendByCategory: spendRows, spend },
        };
      }

      case 'habits': {
        const anchor = resolveAnchorDate(input.range, ctx.now);
        if ('error' in anchor) return { message: anchor.error };
        const statuses = await habitStatuses(anchor.date);
        const due = statuses.filter((h) => h.due);
        if (due.length === 0) return { message: `No habits due ${anchor.echo}.`, data: [] };
        const lines = due.map((h) => `${h.name}: ${h.done ? 'done' : 'not yet'} (${h.current_streak}-day streak)`);
        return {
          message: `Habits — ${anchor.echo}: ${lines.join(', ')}.`,
          cards: due.map((h) => ({
            kind: 'habit' as const,
            title: h.name,
            subtitle: `${h.current_streak}-day streak`,
            href: '/habits',
            badges: [h.done ? 'Done' : 'Due'],
          })),
          data: due,
        };
      }

      case 'spending': {
        const keyword = (input.range ?? 'this_month').trim().toLowerCase();
        const today = istDate(ctx.now);
        let from: string;
        let to = today;
        let label: string;
        if (keyword === 'last_7d') {
          from = addDays(today, -6);
          label = 'the last 7 days';
        } else if (keyword === 'last_30d') {
          from = addDays(today, -29);
          label = 'the last 30 days';
        } else if (keyword === 'last_month') {
          const [y, m] = today.split('-').map(Number);
          const firstThisMonth = `${y}-${String(m).padStart(2, '0')}-01`;
          to = addDays(firstThisMonth, -1);
          const [ly, lm] = to.split('-').map(Number);
          from = `${ly}-${String(lm).padStart(2, '0')}-01`;
          label = 'last month';
        } else {
          const [y, m] = today.split('-').map(Number);
          from = `${y}-${String(m).padStart(2, '0')}-01`;
          label = 'this month';
        }
        const [rows, w] = await Promise.all([spendByCategory(from, to), wallet()]);
        const total = rows.reduce((a, r) => a + r.amount, 0);
        return {
          message:
            `Spending ${label}: ${rows.map((r) => `${r.category} ${formatINR(r.amount)}`).join(', ') || 'none'}. ` +
            `Total ${formatINR(total)}. Net worth ${formatINR(w.net)}.`,
          cards: [
            {
              kind: 'report',
              title: `Spending — ${label}`,
              subtitle: `Total ${formatINR(total)} · Net ${formatINR(w.net)}`,
              href: '/money',
            },
          ],
          data: { from, to, rows, total, wallet: w },
        };
      }
    }
  },
};

export const reportTools: ToolDef[] = [report];
