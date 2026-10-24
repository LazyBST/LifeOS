import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { areaByName } from './areas';
import { addDays, istDate, istParts } from '@/lib/time';
import { habitStreak } from './progress';
import type { Habit, HabitCheckin, TimeOfDay, UUID } from '@/lib/types/db';

export type HabitInput = {
  name: string;
  emoji?: string | null;
  time_of_day?: TimeOfDay;
  kind?: 'boolean' | 'count';
  target_value?: number;
  unit?: string | null;
  /** 1 = Mon .. 7 = Sun; null or empty means every day */
  days_of_week?: number[] | null;
  reminder_time?: string | null;
  area?: string | null;
  area_id?: UUID | null;
  goal_id?: UUID | null;
  /** a sub-habit of this task */
  task_id?: UUID | null;
};

export type HabitPatch = Partial<HabitInput> & { archived_at?: string | null };

export type HabitStatus = Habit & {
  /** is the habit due on `date`? */
  due: boolean;
  /** today's (or `date`'s) check-in value, 0 when none */
  value: number;
  done: boolean;
  current_streak: number;
  longest_streak: number;
};

export async function listHabits(includeArchived = false): Promise<Habit[]> {
  let q = admin().from('habits').select('*');
  if (!includeArchived) q = q.is('archived_at', null);
  const { data, error } = await q.order('time_of_day').order('created_at');
  if (error) throw new Error(`habits: ${error.message}`);
  return data as Habit[];
}

export async function getHabit(id: UUID): Promise<Habit | null> {
  const { data } = await admin().from('habits').select('*').eq('id', id).maybeSingle();
  return (data as Habit) ?? null;
}

export async function createHabit(input: HabitInput): Promise<Habit> {
  const area_id = input.area_id ?? (input.area ? (await areaByName(input.area))?.id ?? null : null);
  const row = {
    name: input.name,
    emoji: input.emoji ?? null,
    time_of_day: input.time_of_day ?? 'any',
    kind: input.kind ?? 'boolean',
    target_value: input.target_value ?? 1,
    unit: input.unit ?? null,
    days_of_week: input.days_of_week?.length ? input.days_of_week : null,
    reminder_time: input.reminder_time ?? null,
    area_id,
    goal_id: input.goal_id ?? null,
    ...(input.task_id ? { task_id: input.task_id } : {}),
  };
  const { data, error } = await admin().from('habits').insert(row).select('*').single();
  if (error) throw new Error(`habit_create: ${error.message}`);
  return data as Habit;
}

export async function updateHabit(id: UUID, patch: HabitPatch): Promise<Habit> {
  const row: Record<string, unknown> = {};
  for (const k of ['name', 'emoji', 'time_of_day', 'kind', 'target_value', 'unit', 'days_of_week', 'reminder_time', 'goal_id', 'archived_at'] as const) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  if (patch.area_id !== undefined) row.area_id = patch.area_id;
  else if (patch.area !== undefined) row.area_id = patch.area ? (await areaByName(patch.area))?.id ?? null : null;
  const { data, error } = await admin().from('habits').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(`habit_update: ${error.message}`);
  return data as Habit;
}

export async function archiveHabit(id: UUID): Promise<Habit> {
  return updateHabit(id, { archived_at: new Date().toISOString() });
}

/** A habit with no days_of_week is due every day. */
export function habitDueOn(habit: Pick<Habit, 'days_of_week'>, date: string): boolean {
  if (!habit.days_of_week || habit.days_of_week.length === 0) return true;
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return habit.days_of_week.includes(dow === 0 ? 7 : dow);
}

export async function checkinsBetween(from: string, to: string, habitId?: UUID): Promise<HabitCheckin[]> {
  let q = admin().from('habit_checkins').select('*').gte('checkin_date', from).lte('checkin_date', to);
  if (habitId) q = q.eq('habit_id', habitId);
  const { data, error } = await q.order('checkin_date');
  if (error) throw new Error(`habit_checkins: ${error.message}`);
  return data as HabitCheckin[];
}

/** Upsert today's check-in. `value` defaults to the habit's target. */
export async function checkinHabit(
  id: UUID,
  opts: { date?: string; value?: number; note?: string; /** 'gtasks' = came from Google Tasks, so do not push it back */ source?: 'app' | 'gtasks' } = {},
): Promise<{ habit: Habit; checkin: HabitCheckin; current_streak: number; longest_streak: number }> {
  const habit = await getHabit(id);
  if (!habit) throw new Error(`No habit ${id}`);
  const date = opts.date ?? istDate();
  const value = opts.value ?? habit.target_value;
  const { data, error } = await admin()
    .from('habit_checkins')
    .upsert({ habit_id: id, checkin_date: date, value, note: opts.note ?? null }, { onConflict: 'habit_id,checkin_date' })
    .select('*')
    .single();
  if (error) throw new Error(`habit_checkin: ${error.message}`);
  const { current, longest } = await streakFor(habit, date);
  if (opts.source !== 'gtasks' && value >= Number(habit.target_value)) {
    // keep Google Tasks in step; a failure here must never fail the check-in
    const { pushHabitCheckin } = await import('@/lib/google/habit-sync');
    await pushHabitCheckin(habit, date).catch(() => false);
  }
  return { habit, checkin: data as HabitCheckin, current_streak: current, longest_streak: longest };
}

export async function streakFor(habit: Habit, today = istDate()): Promise<{ current: number; longest: number }> {
  const rows = await checkinsBetween(addDays(today, -365), today, habit.id);
  const checkins: Record<string, number> = {};
  for (const r of rows) checkins[r.checkin_date] = Number(r.value);
  return habitStreak({
    today,
    daysOfWeek: habit.days_of_week,
    target: Number(habit.target_value),
    checkins,
  });
}

/** Everything the habits board and the dashboard card need for one day. */
export async function habitStatuses(date = istDate()): Promise<HabitStatus[]> {
  const habits = await listHabits();
  const rows = await checkinsBetween(addDays(date, -365), date);
  const byHabit = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const m = byHabit.get(r.habit_id) ?? {};
    m[r.checkin_date] = Number(r.value);
    byHabit.set(r.habit_id, m);
  }
  return habits.map((h) => {
    const checkins = byHabit.get(h.id) ?? {};
    const value = checkins[date] ?? 0;
    const { current, longest } = habitStreak({
      today: date,
      daysOfWeek: h.days_of_week,
      target: Number(h.target_value),
      checkins,
    });
    return {
      ...h,
      due: habitDueOn(h, date),
      value,
      done: value >= Number(h.target_value),
      current_streak: current,
      longest_streak: longest,
    };
  });
}

/** Habits whose reminder_time matches the current IST minute and which are
 *  due today but not yet checked in (spec section 8). */
export async function habitsNeedingNudge(now = new Date()): Promise<Habit[]> {
  const { time, date } = istParts(now);
  const statuses = await habitStatuses(date);
  const nudge = statuses.filter(
    (h) => h.due && !h.done && h.reminder_time && h.reminder_time.slice(0, 5) === time,
  );
  const habits = await listHabits();
  const byId = new Map(habits.map((h) => [h.id, h]));
  return nudge.map((h) => byId.get(h.id)).filter((h): h is Habit => Boolean(h));
}
