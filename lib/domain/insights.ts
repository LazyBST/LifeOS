import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { completedDaily } from './analytics';
import { listAreas } from './areas';
import { areaColor } from './areas-colors';
import { habitStatuses } from './habits';
import { detailItems } from './lifecal';
import { dayScore } from './schedule-math';
import { istDay } from './ledger-math';
import { weekStart } from './lifecal-math';
import { addDays, istDate } from '@/lib/time';

const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };

export type Insights = {
  heat: { date: string; count: number }[];
  areaMix: { name: string; color: string; value: number }[];
  statusMix: { name: string; value: number; color: string }[];
  priorityMix: { name: string; value: number }[];
  weeks: { week: string; done: number; pushed: number; score: number | null }[];
  hours: { hour: number; count: number }[];
  streaks: { name: string; current: number; longest: number }[];
  money: { month: string; income: number; spent: number }[];
  pages: { date: string; pages: number }[];
  summary: { doneWeek: number; pushedWeek: number; scoreWeek: number | null; bestStreak: number };
};

export async function loadInsights(today = istDate()): Promise<Insights> {
  const since84 = addDays(today, -83);
  const [rows182, rows30, areas, items, statusRows, hourRows, habits, moneyRows, pageRows] = await Promise.all([
    safe(completedDaily(182), []),
    safe(completedDaily(30), []),
    safe(listAreas(), []),
    safe(detailItems(since84, today), []),
    safe(Promise.resolve(admin().from('tasks').select('status,priority').is('deleted_at', null).limit(5000)).then((r) => (r.data ?? []) as { status: string; priority: string }[]), []),
    safe(Promise.resolve(admin().from('tasks').select('completed_at').is('deleted_at', null).eq('status', 'done').gte('completed_at', new Date(Date.now() - 90 * 86_400_000).toISOString()).limit(5000)).then((r) => (r.data ?? []) as { completed_at: string }[]), []),
    safe(habitStatuses(today), []),
    safe(Promise.resolve(admin().from('transactions').select('occurred_on,kind,amount,my_share').is('deleted_at', null).gte('occurred_on', addDays(today, -183)).limit(5000)).then((r) => (r.data ?? []) as { occurred_on: string; kind: string; amount: number; my_share: number | null }[]), []),
    safe(Promise.resolve(admin().from('reading_log').select('read_on,pages').gte('read_on', addDays(today, -29))).then((r) => (r.data ?? []) as { read_on: string; pages: number }[]), []),
  ]);

  // activity heatmap: units completed per day
  const perDay = new Map<string, number>();
  for (const r of rows182) perDay.set(r.day, (perDay.get(r.day) ?? 0) + Number(r.tasks));
  const heat = Array.from({ length: 182 }, (_, i) => { const date = addDays(today, i - 181); return { date, count: perDay.get(date) ?? 0 }; });

  // where the last 30 days went
  const byArea = new Map<string, number>();
  for (const r of rows30) byArea.set(r.area_id ?? 'none', (byArea.get(r.area_id ?? 'none') ?? 0) + Number(r.tasks));
  const areaMix = [...byArea.entries()].map(([id, value]) => {
    const a = areas.find((x) => x.id === id);
    return { name: a?.name ?? 'No area', color: a ? areaColor(a) : '#94a3b8', value };
  }).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);

  const count = <K extends string>(list: string[], order: K[]) => order.map((k) => ({ name: k, value: list.filter((x) => x === k).length }));
  const STATUS: Record<string, { label: string; color: string }> = { todo: { label: 'Not started', color: '#94a3b8' }, doing: { label: 'In progress', color: '#3b82f6' }, done: { label: 'Done', color: '#22c55e' } };
  const statusMix = Object.entries(STATUS).map(([k, v]) => ({ name: v.label, color: v.color, value: statusRows.filter((r) => r.status === k).length })).filter((x) => x.value > 0);
  const priorityMix = count(statusRows.filter((r) => r.status !== 'done').map((r) => r.priority), ['P0', 'P1', 'P2', 'P3']);

  // execution: finished vs pushed per week, plus the average daily score
  const weekMap = new Map<string, { done: number; pushed: number; days: Map<string, { total: number; done: number; pushed: number }> }>();
  for (const it of items) {
    if (it.outcome === 'pending') continue;
    const w = weekStart(it.date);
    const e = weekMap.get(w) ?? { done: 0, pushed: 0, days: new Map() };
    const d = e.days.get(it.date) ?? { total: 0, done: 0, pushed: 0 };
    d.total += 1;
    if (it.outcome === 'done') { e.done += 1; d.done += 1; } else { e.pushed += 1; d.pushed += 1; }
    e.days.set(it.date, d); weekMap.set(w, e);
  }
  const weeks = [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([w, e]) => {
    const scores = [...e.days.values()].map((d) => dayScore(d)).filter((x): x is number => x !== null);
    return { week: w.slice(5), done: e.done, pushed: e.pushed, score: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : null };
  });
  const thisWeek = weekMap.get(weekStart(today));
  const thisScores = thisWeek ? [...thisWeek.days.values()].map((d) => dayScore(d)).filter((x): x is number => x !== null) : [];

  const hourCount = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const r of hourRows) { const h = new Date(new Date(r.completed_at).getTime() + 330 * 60_000).getUTCHours(); hourCount[h].count += 1; }
  void istDay;

  const streaks = habits.map((h) => ({ name: h.name, current: h.current_streak, longest: h.longest_streak })).sort((a, b) => b.current - a.current || b.longest - a.longest).slice(0, 8);

  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - (5 - i), 1)); return d.toISOString().slice(0, 7); });
  const money = months.map((m) => ({
    month: m,
    income: moneyRows.filter((t) => t.kind === 'income' && t.occurred_on.startsWith(m)).reduce((n, t) => n + Number(t.amount), 0),
    spent: moneyRows.filter((t) => t.kind === 'expense' && t.occurred_on.startsWith(m)).reduce((n, t) => n + Number(t.my_share ?? t.amount), 0),
  }));

  const pageMap = new Map<string, number>();
  for (const r of pageRows) pageMap.set(r.read_on, (pageMap.get(r.read_on) ?? 0) + Number(r.pages));
  const pages = Array.from({ length: 30 }, (_, i) => { const date = addDays(today, i - 29); return { date, pages: pageMap.get(date) ?? 0 }; });

  return {
    heat, areaMix, statusMix, priorityMix, weeks, hours: hourCount, streaks, money, pages,
    summary: {
      doneWeek: thisWeek?.done ?? 0, pushedWeek: thisWeek?.pushed ?? 0,
      scoreWeek: thisScores.length ? Math.round((thisScores.reduce((a, b) => a + b, 0) / thisScores.length) * 100) : null,
      bestStreak: Math.max(0, ...streaks.map((s) => s.current)),
    },
  };
}
