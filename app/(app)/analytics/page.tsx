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

  const [rows, forecasts, areas, habits, checkins, spendThis, spendLast, journal] = await Promise.all([
    completedDaily(INITIAL_DAYS),
    goalForecasts(today),
    listAreas(),
    listHabits(),
    checkinsBetween(habitFrom, today),
    spendByCategory(cur.from, cur.to),
    spendByCategory(prev.from, prev.to),
    listJournal(habitFrom, today),
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
      const due = habitDueOn(h, date);
      const met = due && (checkinMap[date] ?? 0) >= Number(h.target_value);
      cells.push({ date, due, met });
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

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-6">
      <SetPageContext ctx={{ route: '/analytics', entity_type: 'none' }} />

      <header>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Progress by effort, not task count — every chart backed by a named view.</p>
      </header>

      <section>
        <RangeTabs initialDays={INITIAL_DAYS} initialRows={rows} areas={areasWithColor} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Goal progress</h2>
        <GoalProgressChart forecasts={forecasts} areas={areasWithColor} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Habit consistency — last {HABIT_DAYS} days</h2>
        <HabitConsistency items={habitItems} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Spending by category — {cur.label} vs {prev.label}</h2>
        <div className="rounded-xl border border-border bg-card p-3">
          <SpendByCategoryChart
            thisMonth={spendThis}
            lastMonth={spendLast}
            thisMonthLabel={cur.label}
            lastMonthLabel={prev.label}
          />
        </div>
        <TotalsLine thisMonth={spendThis} lastMonth={spendLast} thisLabel={cur.label} lastLabel={prev.label} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Mood over time</h2>
        <div className="rounded-xl border border-border bg-card p-3">
          <MoodChart points={moodPoints} />
        </div>
      </section>
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
