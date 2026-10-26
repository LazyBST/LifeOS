import 'server-only';
import { checkinsBetween, habitDueOn, habitStatuses, type HabitStatus } from './habits';
import { addDays, istDate } from '@/lib/time';
import type { HabitRowData } from '@/components/habits/HabitRow';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function scheduleLabel(days: number[] | null): string {
  if (!days || days.length === 0 || days.length === 7) return 'Every day';
  const d = [...days].sort((a, b) => a - b);
  const consecutive = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return consecutive && d.length > 2 ? `${DOW[d[0] - 1]}–${DOW[d[d.length - 1] - 1]}` : d.map((x) => DOW[x - 1]).join(', ');
}

/** Everything one compact habit row needs: today's state, streaks and the last 7 days. */
export function toRow(s: HabitStatus, met: Map<string, number>, today: string): HabitRowData {
  const target = Number(s.target_value);
  return {
    id: s.id, name: s.name, emoji: s.emoji, kind: s.kind, target, unit: s.unit, value: Math.max(0, s.value), done: s.done,
    streak: s.current_streak, longest: s.longest_streak, schedule: scheduleLabel(s.days_of_week), today,
    start: s.start_time?.slice(0, 5) ?? null, end: s.end_time?.slice(0, 5) ?? null,
    week: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i - 6);
      const v = met.get(`${s.id}|${date}`);
      const done = (v ?? 0) >= target;
      return { date, due: habitDueOn(s, date) || done, done, missed: v === -1, skipped: v === -2 };
    }),
  };
}

export async function loadHabitRows(): Promise<{ statuses: HabitStatus[]; rows: Map<string, HabitRowData>; today: string }> {
  const today = istDate();
  const [statuses, checkins] = await Promise.all([habitStatuses(today), checkinsBetween(addDays(today, -6), today)]);
  const met = new Map(checkins.map((c) => [`${c.habit_id}|${c.checkin_date}`, Number(c.value)]));
  return { statuses, rows: new Map(statuses.map((s) => [s.id, toRow(s, met, today)])), today };
}
