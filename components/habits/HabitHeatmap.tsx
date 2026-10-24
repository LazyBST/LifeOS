import { addDays } from '@/lib/time';
import { StreakBadge } from '@/components/habits/StreakBadge';
import { cn } from '@/lib/utils';
import type { Habit } from '@/lib/types/db';

function isoDow(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

function dueOn(habit: Pick<Habit, 'days_of_week'>, date: string): boolean {
  if (!habit.days_of_week || habit.days_of_week.length === 0) return true;
  return habit.days_of_week.includes(isoDow(date));
}

type HabitHeatmapProps = {
  habit: Habit;
  /** checkin_date -> value, for at least the last 90 days */
  checkins: Record<string, number>;
  today: string;
  currentStreak: number;
  longestStreak: number;
  days?: number;
};

/** A 90-day consistency heatmap for one habit: a plain CSS grid of day cells
 *  coloured met / missed / not-due (spec sections 6, 10). */
export function HabitHeatmap({
  habit,
  checkins,
  today,
  currentStreak,
  longestStreak,
  days = 90,
}: HabitHeatmapProps) {
  const start = addDays(today, -(days - 1));
  const cells: { date: string; due: boolean; met: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const due = dueOn(habit, date);
    const met = due && (checkins[date] ?? 0) >= Number(habit.target_value);
    cells.push({ date, due, met });
  }
  // pad so the first cell lines up with its weekday (Mon = row 1)
  const leadPad = isoDow(start) - 1;
  const padded = [...Array.from({ length: leadPad }, () => null), ...cells] as (typeof cells[number] | null)[];

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {habit.emoji && <span>{habit.emoji}</span>}
          <span className="truncate">{habit.name}</span>
        </div>
        <StreakBadge current={currentStreak} longest={longestStreak} />
      </div>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gridAutoColumns: '10px' }}
      >
        {padded.map((cell, i) =>
          cell ? (
            <div
              key={cell.date}
              title={`${cell.date}${cell.due ? (cell.met ? ' · done' : ' · missed') : ' · not due'}`}
              className={cn(
                'size-[10px] rounded-[2px]',
                !cell.due && 'bg-muted',
                cell.due && cell.met && 'bg-emerald-500',
                cell.due && !cell.met && 'bg-red-400/50',
              )}
            />
          ) : (
            <div key={`pad-${i}`} className="size-[10px]" />
          ),
        )}
      </div>
    </div>
  );
}

export default HabitHeatmap;
