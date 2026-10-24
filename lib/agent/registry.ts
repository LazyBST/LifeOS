// The tool registry (spec section 7) and the AI-SDK-v7 adapter around it.
//
// `registry` is a flat map of every tool this part owns. Parts 2 and 3 plug
// in their own tool arrays (reminder_*, habit_*, journal_*, expense_add,
// income_add, settle, wallet, finance_summary, report — see the spec's tool
// table) by importing `registerTools` and spreading their arrays alongside
// `entityTools`/`coreTools`/`notesTools`/`undoTools` below — see the
// PART 2/3 PLUG-IN POINT comment.
import 'server-only';
import { tool, type ToolSet } from 'ai';
import type { z } from 'zod';
import type { ToolContext, ToolDef, ToolOutcome, ToolRegistry } from './types';
import { ToolError } from './types';
import { recordAction } from './audit';
import type { PendingChoice, ToolResultCard } from '@/lib/types/db';
import { coreTools } from './tools/core';
import { entityTools } from './tools/entities';
import { notesTools } from './tools/notes';
import { undoTools } from './tools/undo';
import { dailyTools } from './tools/daily';
import { moneyTools } from './tools/money';
import { reportTools } from './tools/report';
import { dashboardTools } from './tools/dashboard';
import { bookTools } from './tools/books';

function toRegistry(defs: ToolDef[]): ToolRegistry {
  const out: ToolRegistry = {};
  for (const d of defs) out[d.name] = d;
  return out;
}

/** Merge any number of tool-def arrays into a registry. Lets each part build
 * its own array (this file's `entityTools` etc.) without fighting over one
 * shared object literal. */
export function registerTools(...groups: ToolDef[][]): ToolRegistry {
  return toRegistry(groups.flat());
}

export const registry: ToolRegistry = registerTools(
  coreTools,
  entityTools,
  notesTools,
  undoTools,
  // PART 2/3 PLUG-IN POINT:
  dailyTools,
  moneyTools, reportTools,
  dashboardTools,
  bookTools,
);

/** Tools that never write and never count against the "more than 3 entities"
 * safety cap (spec section 7). `undo_last` is here too: it rewrites rows via
 * the stored `before`, but that's reversing an existing action, not a new
 * one, and auditing it would make it reverse itself on a second undo. */
const READONLY_TOOLS = new Set([
  'search', 'get', 'task_list', 'notes_read', 'get_today', 'undo_last',
  'habit_status', 'journal_get', 'reminder_list',
  'wallet', 'finance_summary', 'report', 'schedule_report', 'top3_get', 'book_list',
]);

const MAX_FREE_MUTATIONS = 3;

/** Per-request state threaded through every tool call in one chat turn —
 * cards and pending questions accumulate here so `lib/agent/chat.ts` can
 * build the final `{reply, cards, pending}` after the model's tool loop. */
export type RunAccumulator = {
  cards: ToolResultCard[];
  actions: { tool: string; input: unknown; outcome: ToolOutcome }[];
  mutationCount: number;
  /** from the request body: bypasses the >3-mutations confirmation gate */
  confirmed: boolean;
  pending: PendingChoice | null;
  pendingMessage: string | null;
  failures: Map<string, number>;
};

export function newAccumulator(confirmed: boolean): RunAccumulator {
  return { cards: [], actions: [], mutationCount: 0, confirmed, pending: null, pendingMessage: null, failures: new Map() };
}

function toModelResult(outcome: ToolOutcome): Record<string, unknown> {
  const result: Record<string, unknown> = { message: outcome.message };
  if (outcome.pending) result.pending = outcome.pending.options.map((o, i) => ({ n: i + 1, ...o }));
  if (outcome.data !== undefined) result.data = outcome.data;
  return result;
}

/**
 * Runs one named tool with the spec's safety rules applied: confirm-required
 * tools refuse without `confirm: true`, a mutating tool refuses once the
 * per-request cap of {@link MAX_FREE_MUTATIONS} is hit unless the request
 * was `confirmed`, and a tool that already failed once this turn is not
 * retried (spec section 7 safety rules). On success it records an
 * `agent_actions` audit row for mutating tools (the `data: { before, after }`
 * convention every mutating ToolOutcome follows), merges `touched` entities
 * into `ctx.recent` so later calls in the same turn resolve "this"/"it", and
 * folds cards/pending into `acc`.
 *
 * This is the single code path for running a tool — both `toAiTools` (the
 * model's tool loop) and `app/api/chat/route.ts` (the "2" pending-answer
 * shortcut, which bypasses the model entirely) call it.
 */
export async function runTool(name: string, rawInput: unknown, ctx: ToolContext, acc: RunAccumulator): Promise<ToolOutcome> {
  const def = registry[name];
  if (!def) return { message: `Unknown tool "${name}".` };
  const input = (rawInput ?? {}) as Record<string, unknown>;
  const mutating = !READONLY_TOOLS.has(def.name);

  if (acc.pending) {
    return { message: 'Still waiting on the previous question — nothing else runs until that is answered.' };
  }
  if (def.confirm && input.confirm !== true) {
    return { message: `"${def.name}" deletes something and needs confirmation — ask the user to confirm, then call it again with confirm: true.` };
  }
  if (mutating && acc.mutationCount >= MAX_FREE_MUTATIONS && !acc.confirmed) {
    return {
      message: `That's more than ${MAX_FREE_MUTATIONS} changes in one request — ask the user to confirm before continuing, then resend with confirmed: true.`,
    };
  }
  if ((acc.failures.get(def.name) ?? 0) >= 1) {
    return { message: `"${def.name}" already failed once this turn; not retrying it again — tell the user plainly instead.` };
  }

  try {
    const outcome = await def.handler(input, ctx);
    acc.actions.push({ tool: def.name, input, outcome });
    if (outcome.touched?.length) ctx.recent.unshift(...outcome.touched);
    if (outcome.cards?.length) acc.cards.push(...outcome.cards);
    if (outcome.pending) {
      acc.pending = outcome.pending;
      acc.pendingMessage = outcome.message;
    } else if (mutating) {
      const data = outcome.data as { before?: unknown; after?: unknown } | undefined;
      if (data && ('before' in data || 'after' in data)) {
        await recordAction(def.name, input, data.before ?? null, data.after ?? null);
        acc.mutationCount += 1;
      }
    }
    return outcome;
  } catch (e) {
    acc.failures.set(def.name, (acc.failures.get(def.name) ?? 0) + 1);
    const message = e instanceof ToolError || e instanceof Error ? e.message : String(e);
    const outcome: ToolOutcome = { message: `${def.name} failed: ${message}` };
    acc.actions.push({ tool: def.name, input, outcome });
    return outcome;
  }
}

/**
 * Converts every ToolDef into an AI SDK v7 tool whose `execute` runs it
 * through {@link runTool} and hands the model back a compact JSON result.
 */
export function toAiTools(ctx: ToolContext, acc: RunAccumulator): ToolSet {
  const out: ToolSet = {};
  for (const def of Object.values(registry)) {
    // `def.schema` varies per tool (ToolDef is generic over it), so the
    // input type isn't statically known here — this registry is a dynamic
    // dispatch table by nature, hence the `any`s. `runTool` and each
    // handler still validate against the tool's own zod schema at runtime.
    out[def.name] = tool({
      description: def.description,
      inputSchema: def.schema as z.ZodTypeAny,
      execute: async (rawInput: unknown) => toModelResult(await runTool(def.name, rawInput, ctx, acc)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic registry, see comment above
    } as any) as ToolSet[string];
  }
  return out;
}
