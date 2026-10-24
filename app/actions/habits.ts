'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { type ActionResult, run } from './_result';
import {
  type HabitInput,
  type HabitPatch,
  type HabitStatus,
  archiveHabit,
  checkinHabit,
  checkinsBetween,
  createHabit,
  habitStatuses,
  updateHabit,
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
