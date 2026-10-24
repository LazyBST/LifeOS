import 'server-only';
import { admin } from '@/lib/supabase/admin';
import type { AppConfig } from '@/lib/types/db';

let cache: { at: number; value: AppConfig } | null = null;

export async function getConfig(force = false): Promise<AppConfig> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.value;
  const { data, error } = await admin().from('app_config').select('*').limit(1).single();
  if (error) throw new Error(`app_config: ${error.message}`);
  cache = { at: Date.now(), value: data as AppConfig };
  return cache.value;
}

export async function updateConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const { data, error } = await admin()
    .from('app_config')
    .update(patch)
    .eq('id', true)
    .select('*')
    .single();
  if (error) throw new Error(`app_config update: ${error.message}`);
  cache = { at: Date.now(), value: data as AppConfig };
  return cache.value;
}

/** Records the owner's auth uid on first sign-in (spec section 4). */
export async function claimOwner(userId: string): Promise<void> {
  const cfg = await getConfig(true);
  if (!cfg.owner_user_id) await updateConfig({ owner_user_id: userId });
}

export async function defaultEstimate(): Promise<number> {
  return (await getConfig()).default_estimate_min;
}
