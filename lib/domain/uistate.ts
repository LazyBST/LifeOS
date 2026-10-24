import 'server-only';
import { admin } from '@/lib/supabase/admin';

/** Small JSON documents that should follow the user across devices (e.g. the dashboard layout). */
export async function getUiState<T>(key: string): Promise<T | null> {
  const { data, error } = await admin().from('ui_state').select('value').eq('key', key).maybeSingle();
  if (error || !data) return null;
  return data.value as T;
}

export async function setUiState(key: string, value: unknown): Promise<void> {
  const { error } = await admin().from('ui_state').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message.includes('ui_state') ? 'Run supabase/migrations/0014_ui_state_habit_links_indexes.sql to sync your layout.' : error.message);
}

export async function clearUiState(key: string): Promise<void> {
  await admin().from('ui_state').delete().eq('key', key);
}
