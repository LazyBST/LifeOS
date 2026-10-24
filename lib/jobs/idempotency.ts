// Cron idempotency (spec section 8, CONTRACTS.md "Part 2 contracts"): every
// scheduled job claims a key before doing work so a job that fires more than
// once (two overlapping tick invocations, a retried request) only runs once.
import 'server-only';
import { admin } from '@/lib/supabase/admin';

/**
 * Attempts to claim `jobKey`. Returns true when this call is the one that
 * inserted the row (i.e. got to do the work), false when the key was already
 * claimed by an earlier run.
 */
export async function claim(jobKey: string): Promise<boolean> {
  const { data, error } = await admin()
    .from('job_runs')
    .insert({ job_key: jobKey })
    .select('job_key');
  if (error) {
    // Unique-violation on job_key means another run already claimed it.
    if (error.code === '23505') return false;
    throw new Error(`job_runs claim(${jobKey}): ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}
