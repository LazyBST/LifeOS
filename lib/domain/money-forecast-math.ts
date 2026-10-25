// Pure money-planning maths: recurring payment dates, balance history and the forecast. No Supabase, no server-only.
import { addDays, daysBetween } from '@/lib/time';

export type Frequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'once', label: 'Once' }, { value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Every 3 months' }, { value: 'yearly', label: 'Yearly' },
];

export type ScheduledLike = {
  id: string; name: string; kind: 'expense' | 'income'; amount: number; frequency: Frequency;
  next_due: string; end_date: string | null; active: boolean;
};

const MONTHS: Partial<Record<Frequency, number>> = { monthly: 1, quarterly: 3, yearly: 12 };

/** `anchor` moved forward by whole months, keeping its day of the month (31st becomes the last day of short months). */
export function addMonthsClamped(anchor: string, months: number): string {
  const [y, m, d] = anchor.split('-').map(Number);
  const idx = y * 12 + (m - 1) + months;
  const year = Math.floor(idx / 12), month = idx % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** The date of the k-th payment counted from `anchor` (k = 0 is the anchor itself). */
export function nthDate(anchor: string, freq: Frequency, k: number): string {
  if (freq === 'once') return anchor;
  if (freq === 'weekly') return addDays(anchor, 7 * k);
  if (freq === 'biweekly') return addDays(anchor, 14 * k);
  return addMonthsClamped(anchor, (MONTHS[freq] ?? 1) * k);
}

/** The payment after the one on `date`, or null when it does not repeat or ends first. */
export function nextAfter(date: string, freq: Frequency, endDate: string | null = null): string | null {
  if (freq === 'once') return null;
  const n = nthDate(date, freq, 1);
  return endDate && n > endDate ? null : n;
}

export type Occurrence = { id: string; name: string; kind: 'expense' | 'income'; amount: number; date: string; overdue: boolean };

/**
 * Every payment of `s` that falls in [from, to]. Payments already past due and not yet paid count once, as
 * overdue, on `from` — they are still going to leave the account.
 */
export function occurrences(s: ScheduledLike, from: string, to: string): Occurrence[] {
  if (!s.active) return [];
  const out: Occurrence[] = [];
  const base = { id: s.id, name: s.name, kind: s.kind, amount: s.amount };
  for (let k = 0; k < 800; k++) {
    const date = nthDate(s.next_due, s.frequency, k);
    if (s.end_date && date > s.end_date) break;
    if (date > to) break;
    if (date < from) {
      if (k === 0) out.push({ ...base, date: from, overdue: true });
      if (s.frequency === 'once') break;
      continue;
    }
    out.push({ ...base, date, overdue: false });
    if (s.frequency === 'once') break;
  }
  return out;
}

export function upcoming(list: ScheduledLike[], from: string, to: string): Occurrence[] {
  return list.flatMap((s) => occurrences(s, from, to)).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

type Tx = { occurred_on: string; kind: 'expense' | 'income' | 'settlement'; amount: number; my_share?: number | null };

/** What a transaction does to the account balance. */
export const balanceDelta = (t: Tx): number => (t.kind === 'expense' ? -t.amount : t.amount);

const dayRange = (from: string, to: string): string[] => Array.from({ length: Math.max(0, daysBetween(from, to) + 1) }, (_, i) => addDays(from, i));

/** End-of-day balance for each day in [from, min(to, today)], worked backwards from today's balance. */
export function dailyBalances(currentBalance: number, txs: Tx[], from: string, to: string, today: string): { date: string; balance: number }[] {
  const end = to < today ? to : today;
  return dayRange(from, end).map((date) => ({
    date,
    balance: round2(currentBalance - txs.filter((t) => t.occurred_on > date).reduce((s, t) => s + balanceDelta(t), 0)),
  }));
}

/** Running total of one kind of money per day of the period. `kind` expense uses my share, like analytics. */
export function cumulativeByDay(txs: Tx[], from: string, to: string, kind: 'expense' | 'income' | 'net', upTo?: string): { day: number; value: number }[] {
  const end = upTo && upTo < to ? upTo : to;
  const per = new Map<string, number>();
  for (const t of txs) {
    if (t.kind === 'settlement') continue;
    if (kind === 'expense' && t.kind !== 'expense') continue;
    if (kind === 'income' && t.kind !== 'income') continue;
    const v = t.kind === 'expense' ? (t.my_share ?? t.amount) : t.amount;
    per.set(t.occurred_on, (per.get(t.occurred_on) ?? 0) + (kind === 'net' && t.kind === 'expense' ? -v : v));
  }
  let run = 0;
  return dayRange(from, end).map((date, i) => { run += per.get(date) ?? 0; return { day: i + 1, value: round2(run) }; });
}

export type ForecastPoint = { date: string; committed: number; expected: number };

/**
 * Balance for each of the next `days` days. `committed` only applies the scheduled payments; `expected` also
 * spends `dailySpend` (typical everyday spending) every day.
 */
export function forecast(opts: { start: number; today: string; days: number; scheduled: ScheduledLike[]; dailySpend: number }): ForecastPoint[] {
  const { start, today, days, scheduled, dailySpend } = opts;
  const to = addDays(today, days);
  const byDate = new Map<string, number>();
  for (const o of upcoming(scheduled, today, to)) byDate.set(o.date, (byDate.get(o.date) ?? 0) + (o.kind === 'income' ? o.amount : -o.amount));
  let committed = start;
  const out: ForecastPoint[] = [{ date: today, committed: round2(start), expected: round2(start) }];
  const first = byDate.get(today) ?? 0;
  committed += first;
  out[0] = { date: today, committed: round2(committed), expected: round2(committed) };
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    committed += byDate.get(date) ?? 0;
    out.push({ date, committed: round2(committed), expected: round2(committed - dailySpend * i) });
  }
  return out;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Average spend per day over the last `days` days, leaving out the payments that are already scheduled. */
export function typicalDailySpend(txs: Tx[] & { description?: string | null }[], scheduledNames: string[], days: number): number {
  const skip = new Set(scheduledNames.map((n) => n.trim().toLowerCase()));
  const total = (txs as (Tx & { description?: string | null })[])
    .filter((t) => t.kind === 'expense' && !skip.has((t.description ?? '').trim().toLowerCase()))
    .reduce((s, t) => s + (t.my_share ?? t.amount), 0);
  return days > 0 ? round2(total / days) : 0;
}

/** Percentage change from `before` to `now`; null when there is nothing to compare with. */
export const changePct = (now: number, before: number): number | null => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
