'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { drainOutbox, pollCalendar, type PollResult } from '@/lib/google/sync';
import { pullHabitCheckins, type PullReport } from '@/lib/google/habit-sync';
import { type ActionResult, run } from './_result';

export type GoogleSyncReport = { calendar: PollResult; outbox: { pushed: number; failed: number }; tasks: PullReport };

/** "Sync Google now": re-read the whole calendar window, push pending task events, and pull habit check-ins from Google Tasks. */
export async function syncGoogleNowAction(): Promise<ActionResult<GoogleSyncReport>> {
  return run(async () => {
    await requireUser();
    const calendar = await pollCalendar({ full: true });
    const outbox = await drainOutbox().catch(() => ({ pushed: 0, failed: 0 }));
    const tasks = await pullHabitCheckins();
    revalidatePath('/', 'layout');
    return { calendar, outbox, tasks };
  });
}
