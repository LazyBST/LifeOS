'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { reorderPriorities, setPriority, togglePriority } from '@/lib/domain/priorities';
import { setImprovement, setImprovementFollowed } from '@/lib/domain/improvement';
import { istDate } from '@/lib/time';
import { type ActionResult, run } from './_result';

const pos = (n: number): 1 | 2 | 3 => {
  if (n !== 1 && n !== 2 && n !== 3) throw new Error('Position must be 1, 2 or 3');
  return n;
};

export async function setPriorityAction(position: number, text: string, taskId?: string | null): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await setPriority(istDate(), pos(position), text, taskId);
    revalidatePath('/');
    return null;
  });
}

export async function togglePriorityAction(position: number): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await togglePriority(istDate(), pos(position));
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Tonight's improvement is saved on today's journal row and shown tomorrow morning. */
export async function setImprovementAction(text: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await setImprovement(istDate(), text);
    revalidatePath('/');
    return null;
  });
}

export async function followImprovementAction(date: string, followed: boolean): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await setImprovementFollowed(date, followed);
    revalidatePath('/');
    return null;
  });
}

export async function reorderPrioritiesAction(order: number[]): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await reorderPriorities(istDate(), order);
    revalidatePath('/', 'layout');
    return null;
  });
}
