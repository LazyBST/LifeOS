'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { type ActionResult, run } from './_result';
import {
  type HabitInput,
  type HabitPatch,
  type HabitStatus,
  archiveHabit,
  unarchiveHabit,
  checkinHabit,
  checkinsBetween,
  createHabit,
  habitStatuses,
  linkHabit,
  setHabitDayTime,
  moveHabitOccurrence,
  setHabitDay,
  type DayState,
  toggleHabitDay,
  unlinkHabit,
  updateHabit,
  type HabitLinkType,
} from '@/lib/domain/habits';
import { istDate } from '@/lib/time';
import type { Habit, HabitCheckin } from '@/lib/types/db';

export async function listHabitStatusesAction(date?: string): Promise<ActionResult<HabitStatus[]>> {
  return run(async () => {
    await requireUser();
    return habitStatuses(date ?? istDate());
  });
}

export async function createHabitAction(input: HabitInput): Promise<ActionResult<Habit>> {
  return run(async () => {
    await requireUser();
    const habit = await createHabit(input);
    revalidatePath('/', 'layout');
    return habit;
  });
}

export async function updateHabitAction(id: string, patch: HabitPatch): Promise<ActionResult<Habit>> {
  return run(async () => {
    await requireUser();
    const habit = await updateHabit(id, patch);
    revalidatePath('/', 'layout');
    return habit;
  });
}

export async function archiveHabitAction(id: string): Promise<ActionResult<Habit>> {
  return run(async () => {
    await requireUser();
    const habit = await archiveHabit(id);
    revalidatePath('/', 'layout');
    return habit;
  });
}

export async function checkinHabitAction(
  id: string,
  opts?: { date?: string; value?: number; note?: string },
): Promise<ActionResult<{ habit: Habit; checkin: HabitCheckin; current_streak: number; longest_streak: number }>> {
  return run(async () => {
    await requireUser();
    const result = await checkinHabit(id, opts ?? {});
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function habitHistoryAction(habitId: string, from: string, to: string): Promise<ActionResult<HabitCheckin[]>> {
  return run(async () => {
    await requireUser();
    return checkinsBetween(from, to, habitId);
  });
}

export async function toggleHabitDayAction(habitId: string, date: string): Promise<ActionResult<{ done: boolean }>> {
  return run(async () => {
    await requireUser();
    const r = await toggleHabitDay(habitId, date);
    revalidatePath('/', 'layout');
    return r;
  });
}

export async function linkHabitAction(habitId: string, type: HabitLinkType, entityId: string): Promise<ActionResult<null>> {
  return run(async () => { await requireUser(); await linkHabit(habitId, type, entityId); revalidatePath('/', 'layout'); return null; });
}

export async function unlinkHabitAction(habitId: string, type: HabitLinkType, entityId: string): Promise<ActionResult<null>> {
  return run(async () => { await requireUser(); await unlinkHabit(habitId, type, entityId); revalidatePath('/', 'layout'); return null; });
}

/** From a goal, project or task page: make a brand-new habit and attach it in one step. */
export async function createAndLinkHabitAction(name: string, type: HabitLinkType, entityId: string, areaId?: string | null): Promise<ActionResult<Habit>> {
  return run(async () => {
    await requireUser();
    const habit = await createHabit({ name: name.trim(), area_id: areaId ?? null });
    await linkHabit(habit.id, type, entityId);
    revalidatePath('/', 'layout');
    return habit;
  });
}

export async function setHabitDayAction(habitId: string, date: string, state: DayState): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await setHabitDay(habitId, date, state);
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Calendar drag/resize of a habit: changes that day only, never the habit's own time or other days. */
export async function setHabitDayTimeAction(habitId: string, day: string, start: string, end: string | null): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await setHabitDayTime(habitId, day, start, end);
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Bring an archived habit back, with its history. */
export async function unarchiveHabitAction(id: string): Promise<ActionResult<Habit>> {
  return run(async () => {
    await requireUser();
    const habit = await unarchiveHabit(id);
    revalidatePath('/', 'layout');
    return habit;
  });
}

/** Move one occurrence of a habit to another day; the old day counts as skipped, the new one as an extra. */
export async function moveHabitOccurrenceAction(habitId: string, from: string, to: string, start?: string | null, end?: string | null): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await moveHabitOccurrence(habitId, from, to, start, end);
    revalidatePath('/', 'layout');
    return null;
  });
}
