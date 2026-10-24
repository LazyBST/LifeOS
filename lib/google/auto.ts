import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { isConfigured } from './auth';
import { drainOutbox, pollCalendar } from './sync';
import { pullHabitCheckins } from './habit-sync';

const EVERY_MS = 5 * 60_000;

/**
 * Sync Google (calendar, pending task events, habit check-ins from Google Tasks) when the last sync is older than
 * five minutes. Called after any page renders, so syncing works even if the scheduled job in Supabase was never set up.
 * One caller wins the claim; the others return at once. Never throws.
 */
export async function syncGoogleIfStale(): Promise<void> {
  try {
    if (!isConfigured()) return;
    const cutoff = new Date(Date.now() - EVERY_MS).toISOString();
    const { data: row } = await admin().from('calendar_sync_state').select('last_polled_at').maybeSingle();
    if (!row) return; // migration 0015 not applied: nothing to claim against
    // atomic claim: only the request that moves the timestamp forward runs the sync
    const { data: claimed } = await admin().from('calendar_sync_state')
      .update({ last_polled_at: new Date().toISOString() })
      .eq('id', true)
      .or(`last_polled_at.is.null,last_polled_at.lt.${cutoff}`)
      .select('id');
    if (!claimed?.length) return;
    await pollCalendar();
    await drainOutbox().catch(() => undefined);
    await pullHabitCheckins();
  } catch (e) {
    console.error('syncGoogleIfStale', e instanceof Error ? e.message : e);
  }
}
