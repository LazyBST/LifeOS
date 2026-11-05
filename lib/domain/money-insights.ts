import 'server-only';
import { addDays, istDate } from '@/lib/time';
import { accountBalances, listTransactionsAll } from './money';
import { daysBetween, type MoneyRange } from './money-range';
import { listScheduled } from './budgeting';
import {
  changePct, cumulativeByDay, dailyBalances, forecast, typicalDailySpend, upcoming,
  type ForecastPoint, type Occurrence,
} from './money-forecast-math';
import type { Transaction } from '@/lib/types/db';

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
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
  /** the period at a glance */
  kpis: { avgPerDay: number; savingsRate: number | null; txCount: number; biggestDay: { date: string; amount: number } | null; elapsedDays: number };
  /** where the money went by name (the person or shop), my share */
  payees: { name: string; amount: number; count: number }[];
  /** my share by day of the week, Monday first */
  weekday: { day: string; amount: number; average: number }[];
};

const sum = (txs: Transaction[], kind: 'income' | 'expense') =>
  txs.filter((t) => t.kind === kind).reduce((s, t) => s + (kind === 'expense' ? Number(t.my_share ?? t.amount) : Number(t.amount)), 0);

/** Everything the money dashboard draws, for a period and the one before it. */
export async function moneyInsights(range: MoneyRange): Promise<MoneyInsights> {
  const today = istDate();
  const { from, to, prevFrom: pFrom, prevTo: pTo } = range;
  const lastMonth = monthStart(to);
  const first6 = monthsBack(lastMonth, 5);
  const [cur, prev, recent, since, balances, sched, six] = await Promise.all([
    listTransactionsAll(from, to),
    listTransactionsAll(pFrom, pTo),
    listTransactionsAll(addDays(today, -59), today),
    listTransactionsAll(from, '9999-12-31'),
    accountBalances(),
    listScheduled(),
    listTransactionsAll(first6, monthEnd(lastMonth)),
  ]);
  const norm = (ts: Transaction[]) => ts.map((t) => ({ ...t, amount: Number(t.amount), my_share: t.my_share == null ? null : Number(t.my_share) }));
  const [c, p, r, s] = [norm(cur), norm(prev), norm(recent), norm(since)];
  const balanceNow = balances.reduce((a, b) => a + b.balance, 0);

  const upTo = today < to ? today : to;
  const series = (kind: 'expense' | 'income' | 'net'): PeriodSeries => {
    const a = cumulativeByDay(c, from, to, kind, upTo);
    const b = cumulativeByDay(p, pFrom, pTo, kind);
    const n = Math.max(range.days, daysBetween(pFrom, pTo));
    return Array.from({ length: n }, (_, i) => ({ day: i + 1, current: i < a.length ? a[i].value : null, previous: b[Math.min(i, b.length - 1)]?.value ?? 0 }));
  };

  const trend = dailyBalances(balanceNow, s, from, to, today);
  const prevEnd = from <= today ? dailyBalances(balanceNow, s, pTo, pTo, today)[0]?.balance ?? null : null;
  const dailySpend = typicalDailySpend(r, sched.items.filter((x) => x.kind === 'expense').map((x) => x.name), 60);
  const six_ = norm(six);
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const start = monthsBack(lastMonth, 5 - i), end = monthEnd(start);
    const m = six_.filter((t) => t.occurred_on >= start && t.occurred_on <= end) as unknown as Transaction[];
    const inc = sum(m, 'income'), exp = sum(m, 'expense');
    return { month: start.slice(0, 7), income: inc, expense: exp, net: inc - exp };
  });
  const perDay = new Map<string, number>();
  for (const t of c) if (t.kind === 'expense') perDay.set(t.occurred_on, (perDay.get(t.occurred_on) ?? 0) + Number(t.my_share ?? t.amount));
  const daily = Array.from({ length: range.days }, (_, i) => { const date = addDays(from, i); return { date, amount: perDay.get(date) ?? 0 }; }).filter((d) => d.date <= today);
  const income = sum(c, 'income'), expense = sum(c, 'expense'), prevIncome = sum(p, 'income'), prevExpense = sum(p, 'expense');
  const elapsedDays = Math.max(1, Math.min(range.days, daysBetween(from, today < to ? today : to)));
  const biggest = [...perDay].sort((x, y) => y[1] - x[1])[0];
  const byName = new Map<string, { name: string; amount: number; count: number }>();
  const dow = Array.from({ length: 7 }, () => ({ amount: 0, days: new Set<string>() }));
  for (const t of c) {
    if (t.kind !== 'expense') continue;
    const v = Number(t.my_share ?? t.amount);
    const name = (t.counterparty || t.description || 'Unnamed').trim();
    const key = name.toLowerCase();
    const e = byName.get(key) ?? { name, amount: 0, count: 0 };
    e.amount += v; e.count += 1; byName.set(key, e);
    const d = (new Date(`${t.occurred_on}T00:00:00Z`).getUTCDay() + 6) % 7;
    dow[d].amount += v; dow[d].days.add(t.occurred_on);
  }
  // each weekday's average is over the days of that weekday that fall in the period
  const occurrences = (d: number) => Array.from({ length: elapsedDays }, (_, i) => (new Date(`${addDays(from, i)}T00:00:00Z`).getUTCDay() + 6) % 7).filter((x) => x === d).length;
  return {
    income, expense, prevIncome, prevExpense,
    incomePct: changePct(income, prevIncome), expensePct: changePct(expense, prevExpense),
    comparison: { expense: series('expense'), income: series('income'), net: series('net') },
    monthly, daily, balanceTrend: trend, balanceNow, prevBalanceEnd: prevEnd,
    forecast: forecast({ start: balanceNow, today, days: 90, scheduled: sched.items, dailySpend }),
    dailySpend, upcoming: upcoming(sched.items, today, addDays(today, 60)), scheduledReady: sched.ready,
    kpis: { avgPerDay: expense / elapsedDays, savingsRate: income > 0 ? (income - expense) / income : null, txCount: c.filter((t) => t.kind !== 'transfer').length, biggestDay: biggest ? { date: biggest[0], amount: biggest[1] } : null, elapsedDays },
    payees: [...byName.values()].sort((x, y) => y.amount - x.amount).slice(0, 8),
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => ({ day, amount: Math.round(dow[i].amount), average: Math.round(dow[i].amount / Math.max(1, occurrences(i))) })),
  };
}

const monthsBack = (from: string, n: number) => { const [y, m] = from.split('-').map(Number); const i = y * 12 + m - 1 - n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`; };
export { monthStart };
