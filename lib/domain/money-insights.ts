import 'server-only';
import { addDays, istDate } from '@/lib/time';
import { accountBalances, listTransactions } from './money';
import { listScheduled } from './budgeting';
import {
  changePct, cumulativeByDay, dailyBalances, forecast, typicalDailySpend, upcoming,
  type ForecastPoint, type Occurrence,
} from './money-forecast-math';
import type { Transaction } from '@/lib/types/db';

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const prevMonth = (from: string) => { const [y, m] = from.split('-').map(Number); const i = y * 12 + m - 2; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`; };
const monthEnd = (from: string) => { const [y, m] = from.split('-').map(Number); return `${from.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };

export type PeriodSeries = { day: number; current: number | null; previous: number }[];

export type MoneyInsights = {
  income: number; expense: number; prevIncome: number; prevExpense: number;
  incomePct: number | null; expensePct: number | null;
  comparison: { expense: PeriodSeries; income: PeriodSeries; net: PeriodSeries };
  balanceTrend: { date: string; balance: number }[]; balanceNow: number; prevBalanceEnd: number | null;
  monthly: { month: string; income: number; expense: number; net: number }[];
  daily: { date: string; amount: number }[];
  forecast: ForecastPoint[]; dailySpend: number; upcoming: Occurrence[]; scheduledReady: boolean;
};

const sum = (txs: Transaction[], kind: 'income' | 'expense') =>
  txs.filter((t) => t.kind === kind).reduce((s, t) => s + (kind === 'expense' ? Number(t.my_share ?? t.amount) : Number(t.amount)), 0);

/** Everything the money dashboard draws, for the month containing `from` (a 1st of the month). */
export async function moneyInsights(from: string): Promise<MoneyInsights> {
  const today = istDate();
  const to = monthEnd(from);
  const pFrom = prevMonth(from), pTo = monthEnd(pFrom);
  const first6 = monthsBack(from, 5);
  const [cur, prev, recent, since, balances, sched, six] = await Promise.all([
    listTransactions({ from, to, limit: 1000 }),
    listTransactions({ from: pFrom, to: pTo, limit: 1000 }),
    listTransactions({ from: addDays(today, -59), to: today, limit: 1000 }),
    listTransactions({ from, limit: 1000 }),
    accountBalances(),
    listScheduled(),
    listTransactions({ from: first6, to, limit: 1000 }),
  ]);
  const norm = (ts: Transaction[]) => ts.map((t) => ({ ...t, amount: Number(t.amount), my_share: t.my_share == null ? null : Number(t.my_share) }));
  const [c, p, r, s] = [norm(cur), norm(prev), norm(recent), norm(since)];
  const balanceNow = balances.reduce((a, b) => a + b.balance, 0);

  const upTo = today < to ? today : to;
  const series = (kind: 'expense' | 'income' | 'net'): PeriodSeries => {
    const a = cumulativeByDay(c, from, to, kind, upTo);
    const b = cumulativeByDay(p, pFrom, pTo, kind);
    const n = Math.max(daysIn(from), daysIn(pFrom));
    return Array.from({ length: n }, (_, i) => ({ day: i + 1, current: i < a.length ? a[i].value : null, previous: b[Math.min(i, b.length - 1)]?.value ?? 0 }));
  };

  const trend = dailyBalances(balanceNow, s, from, to, today);
  const prevEnd = from <= today ? dailyBalances(balanceNow, s, pTo, pTo, today)[0]?.balance ?? null : null;
  const dailySpend = typicalDailySpend(r, sched.items.filter((x) => x.kind === 'expense').map((x) => x.name), 60);
  const six_ = norm(six);
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const start = monthsBack(from, 5 - i), end = monthEnd(start);
    const m = six_.filter((t) => t.occurred_on >= start && t.occurred_on <= end) as unknown as Transaction[];
    const inc = sum(m, 'income'), exp = sum(m, 'expense');
    return { month: start.slice(0, 7), income: inc, expense: exp, net: inc - exp };
  });
  const perDay = new Map<string, number>();
  for (const t of c) if (t.kind === 'expense') perDay.set(t.occurred_on, (perDay.get(t.occurred_on) ?? 0) + Number(t.my_share ?? t.amount));
  const daily = Array.from({ length: daysIn(from) }, (_, i) => { const date = addDays(from, i); return { date, amount: perDay.get(date) ?? 0 }; }).filter((d) => d.date <= today);
  const income = sum(c, 'income'), expense = sum(c, 'expense'), prevIncome = sum(p, 'income'), prevExpense = sum(p, 'expense');
  return {
    income, expense, prevIncome, prevExpense,
    incomePct: changePct(income, prevIncome), expensePct: changePct(expense, prevExpense),
    comparison: { expense: series('expense'), income: series('income'), net: series('net') },
    monthly, daily, balanceTrend: trend, balanceNow, prevBalanceEnd: prevEnd,
    forecast: forecast({ start: balanceNow, today, days: 90, scheduled: sched.items, dailySpend }),
    dailySpend, upcoming: upcoming(sched.items, today, addDays(today, 60)), scheduledReady: sched.ready,
  };
}

const monthsBack = (from: string, n: number) => { const [y, m] = from.split('-').map(Number); const i = y * 12 + m - 1 - n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`; };
const daysIn = (from: string) => { const [y, m] = from.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export { monthStart };
