// expense_add, income_add, settle, wallet, finance_summary (spec section 7
// tool table, Part 3; money model is spec section 5). Every mutating tool
// here returns `data: { before, after }` so `runTool` in lib/agent/registry.ts
// writes the agent_actions audit row — same convention as
// lib/agent/tools/entities.ts and lib/agent/tools/daily.ts.
import 'server-only';
import { z } from 'zod';
import type { ToolDef } from '../types';
import { parseDateIST, istDate, addDays } from '@/lib/time';
import { splitEqually } from '@/lib/domain/money-math';
import {
  addExpense,
  addIncome,
  settle as settleTx,
  defaultAccount,
  wallet as getWallet,
  owedByLabel,
  spendByCategory,
  formatINR,
} from '@/lib/domain/money';

/** Resolves the free-text date field every money tool takes, defaulting to
 * today and echoing the resolved day like the entity tools echo dates. */
function resolveDate(dateText: string | undefined, now: Date): { date: string; echo: string } | { error: string } {
  if (!dateText) return { date: istDate(now), echo: '' };
  const parsed = parseDateIST(dateText, now);
  if (!parsed) return { error: `Could not understand the date "${dateText}".` };
  return { date: parsed.date, echo: ` (${parsed.text})` };
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function owedPhrase(owed: number, counterparty: string | null | undefined): string {
  if (!counterparty) return '';
  const label = capitalize(counterparty);
  if (Math.abs(owed) < 0.01) return ` Settled up with ${label}.`;
  if (owed > 0) return ` ${label} owes you ${formatINR(owed)}.`;
  return ` You owe ${label} ${formatINR(-owed)}.`;
}

// ---------------------------------------------------------------------------
// expense_add
// ---------------------------------------------------------------------------

const expenseAddSchema = z.object({
  amount: z.number().min(0),
  description: z.string().optional(),
  my_share: z.coerce.number().min(0).optional(),
  counterparty: z.string().optional(),
  category: z.string().optional(),
  account: z.string().optional(),
  date: z.string().optional(),
  /** my share = splitEqually(total ?? amount, split_with) */
  split_with: z.number().int().positive().optional(),
  /**
   * The full bill, when it differs from the cash the user personally paid
   * (`amount`) — the "Ravi paid 600 for dinner for 3 of us" case (spec
   * section 5): amount: 0, total: 600, split_with: 3, counterparty: 'Ravi'
   * means paid 0, my share splitEqually(600, 3) = 200, owed -200 (he owes
   * Ravi 200). Omit when the user himself paid the cash amount.
   */
  total: z.number().min(0).optional(),
});

const expenseAdd: ToolDef<typeof expenseAddSchema> = {
  name: 'expense_add',
  description:
    'Record an expense: cash paid and his own share of it. If a counterparty is named with no split (no my_share, no split_with), asks once whether to split equally, keep it all his, or all theirs — never guesses. split_with:N means his share is the bill split N ways; pass `total` too when he paid nothing himself but still owes a share of a bigger bill someone else paid (e.g. "Ravi paid 600 for dinner for 3 of us" -> amount:0, total:600, split_with:3, counterparty:"Ravi").',
  schema: expenseAddSchema,
  part: 3,
  handler: async (input, ctx) => {
    const billTotal = input.total ?? input.amount;

    let my_share: number;
    if (input.my_share !== undefined) {
      my_share = input.my_share;
    } else if (input.split_with) {
      my_share = splitEqually(billTotal, input.split_with);
    } else if (input.counterparty) {
      // Ask once; write nothing (spec section 5: "do not guess").
      const equalShare = splitEqually(billTotal, 2);
      return {
        message: `Split ${formatINR(billTotal)}${input.description ? ` (${input.description})` : ''} with ${input.counterparty} — split equally, all yours, or all theirs?`,
        pending: {
          tool: 'expense_add',
          input,
          field: 'my_share',
          options: [
            { id: String(equalShare), label: 'Split equally' },
            { id: String(billTotal), label: 'All mine' },
            { id: '0', label: 'All theirs' },
          ],
        },
      };
    } else {
      my_share = input.amount;
    }

    const dateRes = resolveDate(input.date, ctx.now);
    if ('error' in dateRes) return { message: dateRes.error };

    if (!input.account) {
      const acc = await defaultAccount();
      if (!acc) return { message: 'No account exists yet — create one (e.g. "Cash" or "HDFC") before adding expenses.' };
    }

    const expense = await addExpense({
      amount: input.amount,
      description: input.description ?? null,
      my_share,
      counterparty: input.counterparty ?? null,
      category: input.category ?? null,
      account: input.account ?? null,
      date: dateRes.date,
      raw_text: input.description ?? null,
    });

    const message =
      `${formatINR(expense.amount)} on ${expense.category_name ?? 'Misc'}` +
      ` via ${expense.account_name ?? 'no account'}${dateRes.echo}.` +
      owedPhrase(expense.owed, expense.counterparty);

    return {
      message,
      cards: [
        {
          kind: 'money',
          title: formatINR(expense.amount),
          subtitle: `${expense.category_name ?? 'Misc'} · ${expense.account_name ?? ''}`.trim(),
          href: '/money',
        },
      ],
      data: { before: null, after: expense },
    };
  },
};

// ---------------------------------------------------------------------------
// income_add
// ---------------------------------------------------------------------------

const incomeAddSchema = z.object({
  amount: z.number().min(0),
  description: z.string().optional(),
  account: z.string().optional(),
  date: z.string().optional(),
  category: z.string().optional(),
});

const incomeAdd: ToolDef<typeof incomeAddSchema> = {
  name: 'income_add',
  description: 'Record income (money received) into an account.',
  schema: incomeAddSchema,
  part: 3,
  handler: async (input, ctx) => {
    const dateRes = resolveDate(input.date, ctx.now);
    if ('error' in dateRes) return { message: dateRes.error };

    if (!input.account) {
      const acc = await defaultAccount();
      if (!acc) return { message: 'No account exists yet — create one before adding income.' };
    }

    const income = await addIncome({
      amount: input.amount,
      description: input.description ?? null,
      category: input.category ?? null,
      account: input.account ?? null,
      date: dateRes.date,
      raw_text: input.description ?? null,
    });

    return {
      message: `${formatINR(income.amount)} income${income.description ? ` (${income.description})` : ''} into ${income.account_name ?? 'no account'}${dateRes.echo}.`,
      cards: [
        {
          kind: 'money',
          title: `+${formatINR(income.amount)}`,
          subtitle: income.account_name ?? undefined,
          href: '/money',
        },
      ],
      data: { before: null, after: income },
    };
  },
};

// ---------------------------------------------------------------------------
// settle
// ---------------------------------------------------------------------------

const settleSchema = z.object({
  amount: z.number().min(0),
  direction: z.enum(['received', 'paid']),
  counterparty: z.string().min(1),
  account: z.string().optional(),
  date: z.string().optional(),
});

const settle: ToolDef<typeof settleSchema> = {
  name: 'settle',
  description: 'Record a settlement with someone (money received from them, or paid to them) — not spending, just clears the owed balance.',
  schema: settleSchema,
  part: 3,
  handler: async (input, ctx) => {
    const dateRes = resolveDate(input.date, ctx.now);
    if ('error' in dateRes) return { message: dateRes.error };

    const settlement = await settleTx({
      amount: input.amount,
      direction: input.direction,
      counterparty: input.counterparty,
      account: input.account ?? null,
      date: dateRes.date,
    });

    const byLabel = await owedByLabel();
    const row = byLabel.find((r) => r.label === input.counterparty);
    const owedNow = row?.owed ?? 0;
    const verb = input.direction === 'received' ? 'Received' : 'Paid';

    return {
      message:
        `${verb} ${formatINR(input.amount)} ${input.direction === 'received' ? 'from' : 'to'} ${capitalize(input.counterparty)} via ${settlement.account_name ?? 'no account'}${dateRes.echo}.` +
        (Math.abs(owedNow) < 0.01
          ? ` ${capitalize(input.counterparty)} is settled up.`
          : owedNow > 0
            ? ` ${capitalize(input.counterparty)} still owes you ${formatINR(owedNow)}.`
            : ` You still owe ${capitalize(input.counterparty)} ${formatINR(-owedNow)}.`),
      cards: [{ kind: 'money', title: `${verb} ${formatINR(input.amount)}`, subtitle: capitalize(input.counterparty), href: '/money' }],
      data: { before: null, after: settlement },
    };
  },
};

// ---------------------------------------------------------------------------
// wallet
// ---------------------------------------------------------------------------

const walletSchema = z.object({});

const walletTool: ToolDef<typeof walletSchema> = {
  name: 'wallet',
  description: 'Cash on hand, owed to him, what he owes, and net — the four numbers the wallet card shows.',
  schema: walletSchema,
  part: 3,
  handler: async () => {
    const w = await getWallet();
    const message =
      `Cash on hand ${formatINR(w.cash_on_hand)}. ` +
      `Owed to you ${formatINR(w.owed_to_me)} (green), you owe ${formatINR(w.i_owe)} (red). ` +
      `Net ${formatINR(w.net)} (${w.net >= 0 ? 'green' : 'red'}).`;
    return {
      message,
      cards: [
        {
          kind: 'money',
          title: `Net ${formatINR(w.net)}`,
          subtitle: `Cash ${formatINR(w.cash_on_hand)} · Owed to you ${formatINR(w.owed_to_me)} · You owe ${formatINR(w.i_owe)}`,
          href: '/money',
        },
      ],
      data: w,
    };
  },
};

// ---------------------------------------------------------------------------
// finance_summary
// ---------------------------------------------------------------------------

const PERIOD = z.enum(['this_month', 'last_month', 'last_7d', 'last_30d']);
const GROUP_BY = z.enum(['category', 'label']);

const finrepSchema = z.object({ period: PERIOD.optional(), group_by: GROUP_BY.optional() });

/** 'this_month' (default), 'last_month', 'last_7d' or 'last_30d', resolved
 * against `now` in IST. */
export function periodRange(period: z.infer<typeof PERIOD> | undefined, now: Date): { from: string; to: string; label: string } {
  const today = istDate(now);
  if (period === 'last_7d') return { from: addDays(today, -6), to: today, label: 'the last 7 days' };
  if (period === 'last_30d') return { from: addDays(today, -29), to: today, label: 'the last 30 days' };
  if (period === 'last_month') {
    const [y, m] = today.split('-').map(Number);
    const firstThisMonth = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDayLastMonth = addDays(firstThisMonth, -1);
    const [ly, lm] = lastDayLastMonth.split('-').map(Number);
    const firstLastMonth = `${ly}-${String(lm).padStart(2, '0')}-01`;
    return { from: firstLastMonth, to: lastDayLastMonth, label: 'last month' };
  }
  const [y, m] = today.split('-').map(Number);
  const firstThisMonth = `${y}-${String(m).padStart(2, '0')}-01`;
  return { from: firstThisMonth, to: today, label: 'this month' };
}

const financeSummary: ToolDef<typeof finrepSchema> = {
  name: 'finance_summary',
  description: 'Spending by category for a period (default this month), or the running owed-by-label balances.',
  schema: finrepSchema,
  part: 3,
  handler: async (input, ctx) => {
    if (input.group_by === 'label') {
      const rows = await owedByLabel();
      if (rows.length === 0) return { message: 'Nobody owes anything, and you owe nobody.', data: [] };
      const lines = rows.map((r) =>
        r.owed > 0 ? `${capitalize(r.label)} owes you ${formatINR(r.owed)}` : `You owe ${capitalize(r.label)} ${formatINR(-r.owed)}`,
      );
      return {
        message: lines.join('; ') + '.',
        cards: rows.map((r) => ({
          kind: 'money' as const,
          title: capitalize(r.label),
          subtitle: r.owed >= 0 ? `owes you ${formatINR(r.owed)}` : `you owe ${formatINR(-r.owed)}`,
          href: '/money',
        })),
        data: rows,
      };
    }

    const range = periodRange(input.period, ctx.now);
    const rows = await spendByCategory(range.from, range.to);
    if (rows.length === 0) return { message: `No spending recorded for ${range.label}.`, data: [] };
    const total = rows.reduce((a, r) => a + r.amount, 0);
    const lines = rows.map((r) => `${r.category} ${formatINR(r.amount)}`);
    return {
      message: `Spending for ${range.label}: ${lines.join(', ')}. Total ${formatINR(total)}.`,
      cards: rows.map((r) => ({ kind: 'money' as const, title: r.category, subtitle: formatINR(r.amount), href: '/money' })),
      data: { from: range.from, to: range.to, rows, total },
    };
  },
};

export const moneyTools: ToolDef[] = [expenseAdd, incomeAdd, settle, walletTool, financeSummary];
