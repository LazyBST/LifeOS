'use server';

import { requireUser } from '@/lib/auth';
import { type ActionResult, run } from './_result';
import { completedDaily, goalForecasts, type GoalForecast } from '@/lib/domain/analytics';
import { habitStreak } from '@/lib/domain/progress';
import { listHabits, checkinsBetween, habitDueOn } from '@/lib/domain/habits';
import { spendByCategory } from '@/lib/domain/money';
import { listJournal } from '@/lib/domain/journal';
import { addDays, istDate } from '@/lib/time';
import type { CompletedDailyRow, Habit } from '@/lib/types/db';

export async function completedDailyAction(days: number): Promise<ActionResult<CompletedDailyRow[]>> {
  return run(async () => {
    await requireUser();
    return completedDaily(days);
  });
}

export async function goalForecastsAction(): Promise<ActionResult<GoalForecast[]>> {
  return run(async () => {
    await requireUser();
    return goalForecasts();
  });
}

export type HabitConsistencyDay = { date: string; due: boolean; met: boolean };

export type HabitConsistencyItem = {
  habit: Habit;
  cells: HabitConsistencyDay[];
  current: number;
  longest: number;
};

/** Per-habit day cells for the last `days` days, plus current/longest streak
 *  (spec section 10: days not due neither extend nor break the streak). */
export async function habitConsistencyAction(days = 90): Promise<ActionResult<HabitConsistencyItem[]>> {
  return run(async () => {
    await requireUser();
    const today = istDate();
    const from = addDays(today, -(days - 1));
    const [habits, checkins] = await Promise.all([listHabits(), checkinsBetween(from, today)]);
    const byHabit = new Map<string, Record<string, number>>();
    for (const c of checkins) {
      const m = byHabit.get(c.habit_id) ?? {};
      m[c.checkin_date] = Number(c.value);
      byHabit.set(c.habit_id, m);
    }
    return habits.map((h) => {
      const checkinMap = byHabit.get(h.id) ?? {};
      const cells: HabitConsistencyDay[] = [];
      for (let i = 0; i < days; i++) {
        const date = addDays(from, i);
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
  });
}

function monthRange(offsetMonths: number, today = istDate()): { from: string; to: string; label: string } {
  const [y, m] = today.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
  const from = base.toISOString().slice(0, 10);
  const isCurrent = offsetMonths === 0;
  let to: string;
  if (isCurrent) {
    to = today;
  } else {
    const nextMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
    to = new Date(nextMonth.getTime() - 86_400_000).toISOString().slice(0, 10);
  }
  const label = base.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { from, to, label };
}

export type SpendByCategoryMonths = {
  thisMonth: { category: string; amount: number }[];
  lastMonth: { category: string; amount: number }[];
  thisMonthLabel: string;
  lastMonthLabel: string;
};

export async function spendByCategoryMonthsAction(): Promise<ActionResult<SpendByCategoryMonths>> {
  return run(async () => {
    await requireUser();
    const cur = monthRange(0);
    const prev = monthRange(-1);
    const [thisMonth, lastMonth] = await Promise.all([
      spendByCategory(cur.from, cur.to),
      spendByCategory(prev.from, prev.to),
    ]);
    return { thisMonth, lastMonth, thisMonthLabel: cur.label, lastMonthLabel: prev.label };
  });
}

export type MoodPoint = { date: string; mood: number | null };

export async function moodSeriesAction(days = 90): Promise<ActionResult<MoodPoint[]>> {
  return run(async () => {
    await requireUser();
    const today = istDate();
    const from = addDays(today, -(days - 1));
    const entries = await listJournal(from, today);
    return entries
      .filter((e) => e.mood != null)
      .map((e) => ({ date: e.entry_date, mood: e.mood }));
  });
}
