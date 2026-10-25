'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createScheduled, deleteScheduled, payScheduled, setBudget, skipScheduled, type ScheduledInput } from '@/lib/domain/budgeting';
import { type ActionResult, run } from './_result';

const done = () => revalidatePath('/', 'layout');

export async function setBudgetAction(categoryId: string, amount: number): Promise<ActionResult<null>> {
  return run(async () => { await requireUser(); await setBudget(categoryId, amount); done(); return null; });
}

export async function createScheduledAction(input: ScheduledInput): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    if (!input.name?.trim()) throw new Error('Give the payment a name.');
    if (!(input.amount >= 0)) throw new Error('Enter an amount.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.next_due)) throw new Error('Pick the next due date.');
    await createScheduled(input); done(); return null;
  });
}

export async function payScheduledAction(id: string, amount?: number): Promise<ActionResult<null>> {
  return run(async () => { await requireUser(); await payScheduled(id, amount); done(); return null; });
}
export async function skipScheduledAction(id: string): Promise<ActionResult<null>> {
  return run(async () => { await requireUser(); await skipScheduled(id); done(); return null; });
}
export async function deleteScheduledAction(id: string): Promise<ActionResult<null>> {
  return run(async () => { await requireUser(); await deleteScheduled(id); done(); return null; });
}
