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
  start_time?: string | null;
  end_time?: string | null;
  gtask_title?: string | null;
};

export type HabitPatch = Partial<HabitInput> & { archived_at?: string | null };

export type HabitStatus = Habit & {
  /** is the habit due on `date`? */
  due: boolean;
  /** today's (or `date`'s) check-in value, 0 when none */
  value: number;
  done: boolean;
  /** marked missed by hand today */
  missed: boolean;
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
    ...(input.start_time ? { start_time: input.start_time } : {}),
    ...(input.end_time ? { end_time: input.end_time } : {}),
    ...(input.gtask_title ? { gtask_title: input.gtask_title } : {}),
  };
  const { data, error } = await admin().from('habits').insert(row).select('*').single();
  if (error) throw new Error(`habit_create: ${error.message}`);
  const created = data as Habit;
  if (input.goal_id) await linkHabit(created.id, 'goal', input.goal_id).catch(() => undefined);
  if (input.task_id) await linkHabit(created.id, 'task', input.task_id).catch(() => undefined);
  return created;
}

export async function updateHabit(id: UUID, patch: HabitPatch): Promise<Habit> {
  if (patch.start_time !== undefined || patch.end_time !== undefined) {
    const { data: before } = await admin().from('habits').select('start_time,end_time').eq('id', id).maybeSingle();
    const b = before as { start_time: string | null; end_time: string | null } | null;
    const same = (a: string | null | undefined, c: string | null | undefined) => (a ?? null)?.slice(0, 5) === (c ?? null)?.slice(0, 5);
    if (b?.start_time && (!same(b.start_time, patch.start_time ?? b.start_time) || (patch.end_time !== undefined && !same(b.end_time, patch.end_time)))) {
      await freezePastDayTimes(id, b.start_time, b.end_time, istDate()).catch(() => undefined);
    }
  }
  const row: Record<string, unknown> = {};
  for (const k of ['name', 'emoji', 'time_of_day', 'kind', 'target_value', 'unit', 'days_of_week', 'reminder_time', 'goal_id', 'archived_at', 'start_time', 'end_time', 'gtask_title'] as const) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  if (patch.area_id !== undefined) row.area_id = patch.area_id;
  else if (patch.area !== undefined) row.area_id = patch.area ? (await areaByName(patch.area))?.id ?? null : null;
  if (patch.start_time && patch.end_time && patch.end_time <= patch.start_time) throw new Error('A habit must end after it starts.');
  const { data, error } = await admin().from('habits').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(`habit_update: ${error.message.includes('start_time') || error.message.includes('gtask_title') ? 'run migration 0015 (and 0010) first' : error.message}`);
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
  if (opts.source !== 'gtasks' && date === istDate() && value >= Number(habit.target_value)) {
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
      value: Math.max(0, value),
      done: value >= Number(h.target_value),
      missed: value < 0,
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
    (h) => h.due && !h.done && !h.missed && h.reminder_time && h.reminder_time.slice(0, 5) === time,
  );
  const habits = await listHabits();
  const byId = new Map(habits.map((h) => [h.id, h]));
  return nudge.map((h) => byId.get(h.id)).filter((h): h is Habit => Boolean(h));
}

// ---- links to goals, projects and tasks -------------------------------------

export type HabitLinkType = 'goal' | 'project' | 'task';

export async function linkHabit(habitId: UUID, type: HabitLinkType, entityId: UUID): Promise<void> {
  const { error } = await admin().from('habit_links').upsert({ habit_id: habitId, entity_type: type, entity_id: entityId }, { onConflict: 'habit_id,entity_type,entity_id' });
  if (error) throw new Error(`habit_link: ${error.message.includes('habit_links') ? 'run migration 0014 first' : error.message}`);
}

export async function unlinkHabit(habitId: UUID, type: HabitLinkType, entityId: UUID): Promise<void> {
  await admin().from('habit_links').delete().eq('habit_id', habitId).eq('entity_type', type).eq('entity_id', entityId);
}

/** Ids of the habits attached to a goal, project or task (also the older goal_id / task_id columns). */
export async function habitIdsFor(type: HabitLinkType, entityId: UUID): Promise<Set<UUID>> {
  const ids = new Set<UUID>();
  const { data } = await admin().from('habit_links').select('habit_id').eq('entity_type', type).eq('entity_id', entityId);
  for (const r of (data ?? []) as { habit_id: string }[]) ids.add(r.habit_id);
  const legacy = type === 'goal' ? 'goal_id' : type === 'task' ? 'task_id' : null;
  if (legacy) {
    const { data: old } = await admin().from('habits').select('id').eq(legacy, entityId);
    for (const r of (old ?? []) as { id: string }[]) ids.add(r.id);
  }
  return ids;
}

/** Toggle one day's check-in: a met day goes to 0, any other day becomes met. Used to correct the past. */
export async function toggleHabitDay(habitId: UUID, date: string): Promise<{ done: boolean }> {
  const habit = await getHabit(habitId);
  if (!habit) throw new Error(`No habit ${habitId}`);
  if (date > istDate()) throw new Error('You cannot check in a future day.');
  const { data } = await admin().from('habit_checkins').select('value').eq('habit_id', habitId).eq('checkin_date', date).maybeSingle();
  const met = Number(data?.value ?? 0) >= Number(habit.target_value);
  await checkinHabit(habitId, { date, value: met ? 0 : Number(habit.target_value), note: met ? undefined : date === istDate() ? undefined : 'edited later' });
  return { done: !met };
}

export type DayState = 'done' | 'missed' | 'clear';

/** Set a day by hand: done, marked missed (stored as -1, which breaks the streak straight away), or cleared back to undecided. */
export async function setHabitDay(habitId: UUID, date: string, state: DayState): Promise<void> {
  const habit = await getHabit(habitId);
  if (!habit) throw new Error(`No habit ${habitId}`);
  if (date > istDate()) throw new Error('You cannot check in a future day.');
  const value = state === 'done' ? Number(habit.target_value) : state === 'missed' ? -1 : 0;
  await checkinHabit(habitId, { date, value, note: state === 'missed' ? 'missed' : date === istDate() ? undefined : 'edited later' });
}

// ---- a habit's time on one particular day ---------------------------------------

export type HabitDayTime = { habit_id: UUID; day: string; start_time: string; end_time: string | null };

/** Override one day's time without touching the habit's own time or any other day. */
export async function setHabitDayTime(habitId: UUID, day: string, start: string, end: string | null): Promise<void> {
  if (end && end <= start) throw new Error('A habit must end after it starts.');
  const { error } = await admin().from('habit_day_times').upsert({ habit_id: habitId, day, start_time: start, end_time: end }, { onConflict: 'habit_id,day' });
  if (error) throw new Error(error.message.includes('habit_day_times') ? 'Run supabase/migrations/0018_habit_day_times.sql first.' : error.message);
}

/** The per-day overrides in a date range. Empty (not an error) until migration 0018 is run. */
export async function habitDayTimes(from: string, to: string): Promise<HabitDayTime[]> {
  const { data, error } = await admin().from('habit_day_times').select('*').gte('day', from).lte('day', to);
  return error ? [] : ((data ?? []) as HabitDayTime[]);
}

/**
 * Changing a habit's own time must not rewrite the past: days before today that have no override of their own
 * keep the time the habit had until now.
 */
export async function freezePastDayTimes(habitId: UUID, oldStart: string, oldEnd: string | null, today: string, days = 60): Promise<void> {
  const from = addDays(today, -days), to = addDays(today, -1);
  const have = new Set((await habitDayTimes(from, to)).filter((r) => r.habit_id === habitId).map((r) => r.day));
  const rows = Array.from({ length: days }, (_, i) => addDays(from, i)).filter((d) => !have.has(d)).map((day) => ({ habit_id: habitId, day, start_time: oldStart, end_time: oldEnd }));
  if (rows.length) await admin().from('habit_day_times').insert(rows);
}
