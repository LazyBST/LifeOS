import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { FALLBACK_STATUSES, type StatusDef } from '@/lib/types/statuses';

let cache: { at: number; value: StatusDef[] } | null = null;

/** All statuses, ordered. Falls back to the built-in set if migration 0006 has not been run. */
export async function listStatuses(force = false): Promise<StatusDef[]> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.value;
  const { data, error } = await admin().from('statuses').select('*').order('sort_order');
  const value = error || !data?.length ? FALLBACK_STATUSES : (data as StatusDef[]);
  cache = { at: Date.now(), value };
  return value;
}

export async function isValidStatus(key: string, kind: 'task' | 'project' | 'goal'): Promise<boolean> {
  return (await listStatuses()).some((s) => s.key === key && s.applies_to.includes(kind));
}
