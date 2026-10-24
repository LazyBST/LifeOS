import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { listAreas, areaColor } from './areas';
import { istDate, addDays } from '@/lib/time';
import { istDay } from './ledger-math';
import { bucketIndex, lastWeeks, linearForecast } from './trend-math';

export type TrendSeries = { id: string; name: string; color: string; actual: number[]; forecast: number[]; total: number };
export type Trend = { weeks: string[]; ahead: number; series: TrendSeries[] };

async function pagedTasks<T>(cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin().from('tasks').select(cols).is('deleted_at', null).order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Units completed per week for each Area. Unit = a subtask, or a task without subtasks. */
export async function weeklyUnitsByArea(weeksBack = 10, ahead = 3, today = istDate()): Promise<Trend> {
  const weeks = lastWeeks(today, weeksBack);
  const [areas, tasks] = await Promise.all([
    listAreas(),
    pagedTasks<{ id: string; area_id: string | null; status: string; completed_at: string | null; parent_task_id: string | null }>('id,area_id,status,completed_at,parent_task_id'),
  ]);
  const parents = new Set(tasks.map((t) => t.parent_task_id).filter(Boolean) as string[]);
  const counts = new Map<string, number[]>(areas.map((a) => [a.id, Array(weeksBack).fill(0)]));
  for (const t of tasks) {
    if (t.status !== 'done' || !t.completed_at || parents.has(t.id) || !t.area_id) continue;
    const i = bucketIndex(weeks, istDay(t.completed_at));
    if (i >= 0) counts.get(t.area_id)![i] += 1;
  }
  return {
    weeks,
    ahead,
    series: areas.map((a) => {
      const actual = counts.get(a.id)!;
      return { id: a.id, name: a.name, color: areaColor(a), actual, forecast: linearForecast(actual, ahead), total: actual.reduce((x, y) => x + y, 0) };
    }),
  };
}

/** Total balance across accounts at the end of each week (cash only; owed amounts excluded). */
export async function moneyTrend(weeksBack = 12, ahead = 3, today = istDate()): Promise<Trend & { current: number; monthChange: number }> {
  const weeks = lastWeeks(today, weeksBack);
  const [{ data: accs }, { data: txs }] = await Promise.all([
    admin().from('accounts').select('opening_balance').is('archived_at', null),
    admin().from('transactions').select('occurred_on,kind,amount').is('deleted_at', null).order('occurred_on'),
  ]);
  const opening = (accs ?? []).reduce((n: number, a: { opening_balance: number }) => n + Number(a.opening_balance), 0);
  const signed = (t: { kind: string; amount: number }) => (t.kind === 'expense' ? -Number(t.amount) : Number(t.amount));
  const rows = (txs ?? []) as { occurred_on: string; kind: string; amount: number }[];
  const actual = weeks.map((w) => {
    const end = addDays(w, 6);
    return Math.round((opening + rows.filter((t) => t.occurred_on <= end).reduce((n, t) => n + signed(t), 0)) * 100) / 100;
  });
  const deltas = actual.map((v, i) => (i === 0 ? 0 : v - actual[i - 1])).slice(1);
  const avg = deltas.slice(-6).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(6, deltas.length));
  const forecast = Array.from({ length: ahead }, (_, k) => Math.round((actual[actual.length - 1] + avg * (k + 1)) * 100) / 100);
  const monthAgo = addDays(today, -30);
  const monthChange = rows.filter((t) => t.occurred_on > monthAgo).reduce((n, t) => n + signed(t), 0);
  return { weeks, ahead, series: [{ id: 'balance', name: 'Balance', color: '#06b6d4', actual, forecast, total: actual[actual.length - 1] ?? 0 }], current: actual[actual.length - 1] ?? opening, monthChange };
}
