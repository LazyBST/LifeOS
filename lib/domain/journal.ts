import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { istDate } from '@/lib/time';
import type { JournalEntry } from '@/lib/types/db';

export async function getJournal(date = istDate()): Promise<JournalEntry | null> {
  const { data } = await admin().from('journal_entries').select('*').eq('entry_date', date).maybeSingle();
  return (data as JournalEntry) ?? null;
}

export async function listJournal(from: string, to: string): Promise<JournalEntry[]> {
  const { data, error } = await admin()
    .from('journal_entries')
    .select('*')
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('entry_date');
  if (error) throw new Error(`journal_entries: ${error.message}`);
  return data as JournalEntry[];
}

/**
 * Write the day's entry. `append` never loses what is already there, which is
 * what the nightly review uses; `replace` is for the editor on the page.
 */
export async function writeJournal(input: {
  date?: string;
  body_md: string;
  mood?: number | null;
  mode?: 'append' | 'replace';
}): Promise<JournalEntry> {
  const date = input.date ?? istDate();
  const mode = input.mode ?? 'append';
  const existing = await getJournal(date);
  const body =
    mode === 'replace' || !existing?.body_md.trim()
      ? input.body_md
      : `${existing.body_md.replace(/\s+$/, '')}\n\n${input.body_md.trim()}`;
  const row = {
    entry_date: date,
    body_md: body,
    mood: input.mood ?? existing?.mood ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin()
    .from('journal_entries')
    .upsert(row, { onConflict: 'entry_date' })
    .select('*')
    .single();
  if (error) throw new Error(`journal_write: ${error.message}`);
  return data as JournalEntry;
}

export async function setMood(date: string, mood: number): Promise<JournalEntry> {
  const { data, error } = await admin()
    .from('journal_entries')
    .upsert({ entry_date: date, mood, updated_at: new Date().toISOString() }, { onConflict: 'entry_date' })
    .select('*')
    .single();
  if (error) throw new Error(`journal_mood: ${error.message}`);
  return data as JournalEntry;
}

/** Whole history, newest first, paged past PostgREST's 1000-row cap. */
export async function listAllJournal(): Promise<JournalEntry[]> {
  const out: JournalEntry[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin()
      .from('journal_entries')
      .select('*')
      .order('entry_date', { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(`journal_entries: ${error.message}`);
    out.push(...(data as JournalEntry[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
