'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { type ActionResult, run } from './_result';
import {
  type GoalInput,
  type GoalPatch,
  createGoal,
  deleteGoal,
  updateGoal,
} from '@/lib/domain/goals';
import type { Goal } from '@/lib/types/db';

export async function createGoalAction(input: GoalInput): Promise<ActionResult<Goal>> {
  return run(async () => {
    await requireUser();
    const goal = await createGoal(input);
    revalidatePath('/', 'layout');
    return goal;
  });
}

export async function updateGoalAction(id: string, patch: GoalPatch): Promise<ActionResult<Goal>> {
  return run(async () => {
    await requireUser();
    const goal = await updateGoal(id, patch);
    revalidatePath('/', 'layout');
    return goal;
  });
}

export async function deleteGoalAction(id: string): Promise<ActionResult<Goal>> {
  return run(async () => {
    await requireUser();
    const goal = await deleteGoal(id);
    revalidatePath('/', 'layout');
    return goal;
  });
}
