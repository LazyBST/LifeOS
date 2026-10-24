import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { istDate } from '@/lib/time';

export type Improvement = { date: string; text: string; followed: boolean };

/** The most recent journal improvement before today (the "last night" one-liner). */
export async function latestImprovement(today = istDate()): Promise<Improvement | null> {
  const { data, error } = await admin()
    .from('journal_entries')
    .select('entry_date,improvement,improvement_followed_at')
    .lt('entry_date', today)
    .not('improvement', 'is', null)
    .order('entry_date', { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const r = data[0] as { entry_date: string; improvement: string; improvement_followed_at: string | null };
  return r.improvement.trim() ? { date: r.entry_date, text: r.improvement.trim(), followed: !!r.improvement_followed_at } : null;
}

export async function setImprovement(date: string, text: string): Promise<void> {
  const { error } = await admin().from('journal_entries').upsert({ entry_date: date, improvement: text.trim() || null, improvement_followed_at: null, updated_at: new Date().toISOString() }, { onConflict: 'entry_date' });
  if (error) throw new Error(error.message);
}

export async function setImprovementFollowed(date: string, followed: boolean): Promise<void> {
  const { error } = await admin().from('journal_entries').update({ improvement_followed_at: followed ? new Date().toISOString() : null }).eq('entry_date', date);
  if (error) throw new Error(error.message);
}
