'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createPrimaryEvent, deletePrimaryEvent, undoEdit, updatePrimaryEvent, type EditResult } from '@/lib/google/events';
import { pollCalendar } from '@/lib/google/sync';
import { type EventInput } from '@/lib/google/events-math';
import { type ActionResult, run } from './_result';

export async function createEventAction(input: EventInput): Promise<ActionResult<EditResult>> {
  return run(async () => { await requireUser(); const r = await createPrimaryEvent(input); revalidatePath('/'); return r; });
}
export async function updateEventAction(id: string, input: EventInput): Promise<ActionResult<EditResult>> {
  return run(async () => { await requireUser(); const r = await updatePrimaryEvent(id, input); revalidatePath('/'); return r; });
}
export async function deleteEventAction(id: string): Promise<ActionResult<EditResult>> {
  return run(async () => { await requireUser(); const r = await deletePrimaryEvent(id); revalidatePath('/'); return r; });
}
export async function undoEventEditAction(logId: number): Promise<ActionResult<string>> {
  return run(async () => { await requireUser(); const m = await undoEdit(logId); revalidatePath('/'); return m; });
}
/** "Sync now": pull the latest from Google instead of waiting for the next poll. */
export async function syncCalendarNowAction(): Promise<ActionResult<{ changed: number }>> {
  return run(async () => { await requireUser(); const r = await pollCalendar(); revalidatePath('/'); return r; });
}
