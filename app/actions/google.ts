'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { drainOutbox, pollCalendar, syncToday, type PollResult, type TodayResult } from '@/lib/google/sync';
import { pullHabitCheckins, type PullReport } from '@/lib/google/habit-sync';
import { type ActionResult, run } from './_result';

export type GoogleSyncReport = { calendar: PollResult; outbox: { pushed: number; failed: number }; tasks: PullReport };

/** "Sync Google now": fetch what changed since last time (full = re-read the month either side), push pending task events, and pull habit check-ins from Google Tasks. */
export async function syncGoogleNowAction(opts: { full?: boolean } = {}): Promise<ActionResult<GoogleSyncReport>> {
  return run(async () => {
    await requireUser();
    const calendar = await pollCalendar({ full: opts.full === true }); // incremental by default; the first run (or full) reads one month either side
    const outbox = await drainOutbox().catch(() => ({ pushed: 0, failed: 0 }));
    const tasks = await pullHabitCheckins();
    revalidatePath('/', 'layout');
    return { calendar, outbox, tasks };
  });
}

/** "Sync today": only today's events, both ways: Google to the app and the app's changes to Google. */
export async function syncTodayAction(): Promise<ActionResult<TodayResult>> {
  return run(async () => {
    await requireUser();
    const r = await syncToday();
    revalidatePath('/', 'layout');
    return r;
  });
}
