// Two-way schedule ledger. Every leaf unit (a task with no subtasks, or a subtask) carries the days it
// gained or lost against its first agreed deadline. Late adds days, early subtracts them, and the
// parent's net is the sum: one task 3 days early and one 2 days late improves the parent by 1 day.
import { addDays, daysBetween } from '@/lib/time';

export type LedgerTask = {
  id: string;
  title: string;
  status: string;
  original_due_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  done: boolean;
};

export type LedgerRow = {
  id: string;
  title: string;
  agreed: string;
  /** completion date when done, otherwise the forecast end (never earlier than today if overdue) */
  actual: string;
  done: boolean;
  /** + days later than agreed, − days earlier */
  delta: number;
};

const IST_MS = 330 * 60_000;
export const istDay = (iso: string) => new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10);

export function ledgerRow(t: LedgerTask, today: string): LedgerRow | null {
  if (!t.original_due_date) return null;
  let actual: string;
  if (t.done && t.completed_at) actual = istDay(t.completed_at);
  else {
    const planned = t.due_date ?? t.original_due_date;
    actual = planned < today ? today : planned; // overdue work is at least as late as today
  }
  return { id: t.id, title: t.title, agreed: t.original_due_date, actual, done: t.done, delta: daysBetween(t.original_due_date, actual) };
}

export type Ledger = {
  rows: LedgerRow[];
  /** sum of every row's delta */
  net: number;
  lateDays: number;
  earlyDays: number;
};

export function buildLedger(tasks: LedgerTask[], today: string): Ledger {
  const rows = tasks.map((t) => ledgerRow(t, today)).filter((r): r is LedgerRow => r !== null);
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.agreed.localeCompare(b.agreed));
  const net = rows.reduce((n, r) => n + r.delta, 0);
  return {
    rows,
    net,
    lateDays: rows.reduce((n, r) => n + Math.max(0, r.delta), 0),
    earlyDays: rows.reduce((n, r) => n + Math.max(0, -r.delta), 0),
  };
}

/** Where the parent now ends: its first agreed date moved by the ledger's net. */
export function projectedEnd(agreedTarget: string | null, net: number): string | null {
  return agreedTarget ? addDays(agreedTarget, net) : null;
}

export function describeNet(net: number, name: string): string {
  if (net === 0) return `${name} is exactly on its agreed schedule`;
  return net > 0
    ? `${name} is pushed ${net} day${net === 1 ? '' : 's'} later`
    : `${name} is ${-net} day${net === -1 ? '' : 's'} ahead of schedule`;
}
