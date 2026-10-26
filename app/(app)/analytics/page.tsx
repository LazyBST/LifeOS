import { completedDaily, goalForecasts } from '@/lib/domain/analytics';
import { listAreas, areaColor } from '@/lib/domain/areas';
import { listHabits, checkinsBetween, habitDueOn } from '@/lib/domain/habits';
import { habitStreak } from '@/lib/domain/progress';
import { spendByCategory, formatINR } from '@/lib/domain/money';
import { listJournal } from '@/lib/domain/journal';
import { addDays, istDate } from '@/lib/time';
import { SetPageContext } from '@/components/chat/page-context';
import { RangeTabs } from '@/components/analytics/RangeTabs';
import { GoalProgressChart } from '@/components/analytics/GoalProgressChart';
import { HabitConsistency } from '@/components/analytics/HabitConsistency';
import { SpendByCategoryChart } from '@/components/analytics/SpendByCategoryChart';
import { MoodChart } from '@/components/analytics/MoodChart';
import type { HabitConsistencyItem } from '@/app/actions/analytics';
import { TimeUse } from '@/components/analytics/TimeUse';
import { FocusDay } from '@/components/pomodoro/FocusDay';
import { WidgetGrid, type GridItem } from '@/components/widgets/WidgetGrid';
import { WidgetCard } from '@/components/dashboard/WidgetCard';
import { getUiState } from '@/lib/domain/uistate';
import { loadInsights } from '@/lib/domain/insights';
import type { ResponsiveLayouts } from 'react-grid-layout';
import { ActivityHeat, Donut, ExecutionWeeks, HourBars, MoneyMonths, PagesBars, PriorityBars, StatTiles, StreakBars } from '@/components/analytics/Insights';

const INITIAL_DAYS = 30 as const;
const HABIT_DAYS = 90;

function monthRange(offsetMonths: number, today = istDate()): { from: string; to: string; label: string } {
  const [y, m] = today.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
  const from = base.toISOString().slice(0, 10);
  let to: string;
  if (offsetMonths === 0) {
    to = today;
  } else {
    const nextMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
    to = new Date(nextMonth.getTime() - 86_400_000).toISOString().slice(0, 10);
  }
  const label = base.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { from, to, label };
}

export default async function AnalyticsPage() {
  const today = istDate();
  const habitFrom = addDays(today, -(HABIT_DAYS - 1));
  const cur = monthRange(0, today);
  const prev = monthRange(-1, today);

  const [rows, forecasts, areas, habits, checkins, spendThis, spendLast, journal, ins, savedLayout] = await Promise.all([
    completedDaily(INITIAL_DAYS),
    goalForecasts(today),
    listAreas(),
    listHabits(),
    checkinsBetween(habitFrom, today),
    spendByCategory(cur.from, cur.to),
    spendByCategory(prev.from, prev.to),
    listJournal(habitFrom, today),
    loadInsights(today),
    getUiState<ResponsiveLayouts>('analytics-layout').catch(() => null),
  ]);

  const areasWithColor = areas.map((a) => ({ id: a.id, name: a.name, resolvedColor: areaColor(a) }));

  const checkinsByHabit = new Map<string, Record<string, number>>();
  for (const c of checkins) {
    const m = checkinsByHabit.get(c.habit_id) ?? {};
    m[c.checkin_date] = Number(c.value);
    checkinsByHabit.set(c.habit_id, m);
  }
  const habitItems: HabitConsistencyItem[] = habits.map((h) => {
    const checkinMap = checkinsByHabit.get(h.id) ?? {};
    const cells: { date: string; due: boolean; met: boolean }[] = [];
    for (let i = 0; i < HABIT_DAYS; i++) {
      const date = addDays(habitFrom, i);
      const v = checkinMap[date] ?? 0;
      const met = v >= Number(h.target_value);
      if (v === -2) { cells.push({ date, due: false, met: false }); continue; } // skipped: not counted
      const due = habitDueOn(h, date) || met; // a done day that was not scheduled counts too
      cells.push({ date, due, met: due && met });
    }
    const { current, longest } = habitStreak({
      today,
      daysOfWeek: h.days_of_week,
      target: Number(h.target_value),
      checkins: checkinMap,
    });
    return { habit: h, cells, current, longest };
  });

  const moodPoints = journal.filter((e) => e.mood != null).map((e) => ({ date: e.entry_date, mood: e.mood }));

  const { summary } = ins;
  const items: GridItem[] = [
    { id: 'timeuse', w: 12, h: 20, minW: 6, minH: 14, node: <WidgetCard title="How I spent my day" sub="Every event, task and habit with a time claims its minutes; gaps are time not used; overlaps count for all of them"><TimeUse /></WidgetCard> },
    { id: 'focus', w: 6, h: 18, minW: 4, minH: 12, node: <WidgetCard title="Focus (Pomodoro)" sub="Sessions, pauses and focused time against what your calendar planned"><FocusDay /></WidgetCard> },
    { id: 'tiles', w: 4, h: 7, minW: 3, minH: 5, node: (
      <WidgetCard title="This week" sub="Scheduled work: finished vs pushed (−1 each)">
        <StatTiles items={[
          { label: 'Daily score', value: summary.scoreWeek === null ? '—' : `${summary.scoreWeek}%`, tone: summary.scoreWeek === null ? undefined : summary.scoreWeek >= 70 ? 'good' : summary.scoreWeek >= 50 ? 'warn' : 'bad' },
          { label: 'Finished', value: String(summary.doneWeek), tone: 'good' },
          { label: 'Pushed', value: String(summary.pushedWeek), tone: summary.pushedWeek > 0 ? 'bad' : undefined },
          { label: 'Best streak', value: `🔥 ${summary.bestStreak}`, sub: 'days' },
        ]} />
      </WidgetCard>) },
    { id: 'execution', w: 8, h: 7, minW: 5, minH: 6, node: <WidgetCard title="Follow-through by week" sub="Finished and pushed items, with your average daily score"><ExecutionWeeks weeks={ins.weeks} /></WidgetCard> },
    { id: 'heat', w: 12, h: 6, minW: 6, minH: 5, node: <WidgetCard title="Activity" sub="Units completed each day, last 26 weeks"><ActivityHeat days={ins.heat} /></WidgetCard> },
    { id: 'throughput', w: 8, h: 11, minW: 5, minH: 8, node: <WidgetCard title="Throughput" sub="Completed per day and effort by Area"><RangeTabs initialDays={INITIAL_DAYS} initialRows={rows} areas={areasWithColor} /></WidgetCard> },
    { id: 'areaMix', w: 4, h: 11, minW: 3, minH: 7, node: <WidgetCard title="Where your time went" sub="Units completed by Area, last 30 days"><Donut data={ins.areaMix} /></WidgetCard> },
    { id: 'goals', w: 6, h: 11, minW: 4, minH: 7, node: <WidgetCard title="Goal progress" sub="By effort, with projected finish"><GoalProgressChart forecasts={forecasts} areas={areasWithColor} /></WidgetCard> },
    { id: 'habits', w: 6, h: 11, minW: 4, minH: 7, node: <WidgetCard title="Habit consistency" sub={`Last ${HABIT_DAYS} days`}><HabitConsistency items={habitItems} /></WidgetCard> },
    { id: 'streaks', w: 4, h: 9, minW: 3, minH: 6, node: <WidgetCard title="Streaks" sub="Current vs best"><StreakBars streaks={ins.streaks} /></WidgetCard> },
    { id: 'hours', w: 4, h: 9, minW: 3, minH: 6, node: <WidgetCard title="When you get things done" sub="Tasks completed by hour, last 90 days"><HourBars hours={ins.hours} /></WidgetCard> },
    { id: 'status', w: 4, h: 9, minW: 3, minH: 6, node: <WidgetCard title="Task status" sub="All tasks"><Donut data={ins.statusMix} /></WidgetCard> },
    { id: 'priority', w: 4, h: 8, minW: 3, minH: 5, node: <WidgetCard title="Open tasks by priority" sub="What is still waiting"><PriorityBars data={ins.priorityMix} /></WidgetCard> },
    { id: 'money', w: 8, h: 9, minW: 4, minH: 6, node: <WidgetCard title="Income vs spending" sub="By month, your share only"><MoneyMonths data={ins.money} /></WidgetCard> },
    { id: 'spend', w: 6, h: 10, minW: 4, minH: 7, node: (
      <WidgetCard title="Spending by category" sub={`${cur.label} vs ${prev.label}`}>
        <SpendByCategoryChart thisMonth={spendThis} lastMonth={spendLast} thisMonthLabel={cur.label} lastMonthLabel={prev.label} />
        <div className="mt-2"><TotalsLine thisMonth={spendThis} lastMonth={spendLast} thisLabel={cur.label} lastLabel={prev.label} /></div>
      </WidgetCard>) },
    { id: 'mood', w: 6, h: 10, minW: 4, minH: 6, node: <WidgetCard title="Mood over time" sub="From your journal"><MoodChart points={moodPoints} /></WidgetCard> },
    { id: 'pages', w: 6, h: 9, minW: 4, minH: 6, node: <WidgetCard title="Reading pace" sub="Pages per day"><PagesBars data={ins.pages} /></WidgetCard> },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <SetPageContext ctx={{ route: '/analytics', entity_type: 'none' }} />
      <header>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Drag a card by its title and resize from the corner. Your layout is saved on every device.</p>
      </header>
      <WidgetGrid items={items} layoutKey="analytics-layout" initial={savedLayout} />
    </div>
  );
}

function TotalsLine({
  thisMonth,
  lastMonth,
  thisLabel,
  lastLabel,
}: {
  thisMonth: { category: string; amount: number }[];
  lastMonth: { category: string; amount: number }[];
  thisLabel: string;
  lastLabel: string;
}) {
  const thisTotal = thisMonth.reduce((s, r) => s + r.amount, 0);
  const lastTotal = lastMonth.reduce((s, r) => s + r.amount, 0);
  const delta = thisTotal - lastTotal;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        {thisLabel}: <span className="font-medium text-foreground">{formatINR(thisTotal)}</span>
      </span>
      <span>
        {lastLabel}: <span className="font-medium text-foreground">{formatINR(lastTotal)}</span>
      </span>
      <span className={delta <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
        {delta <= 0 ? '▼' : '▲'} {formatINR(Math.abs(delta))} vs last month
      </span>
    </div>
  );
}
