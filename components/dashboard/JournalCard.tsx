import { admin } from '@/lib/supabase/admin';
import { istDate } from '@/lib/time';
import type { JournalEntry } from '@/lib/types/db';

async function loadJournal(): Promise<JournalEntry | null> {
  try {
    const { data } = await admin().from('journal_entries').select('*').eq('entry_date', istDate()).maybeSingle();
    return (data as JournalEntry) ?? null;
  } catch {
    // journal is Part 2; render an empty state until the table exists
    return null;
  }
}

/** Today's journal entry and mood, or a prompt (spec section 6). */
export async function JournalCard() {
  const entry = await loadJournal();
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold">Journal</h2>
      {!entry || !entry.body_md ? (
        <p className="text-sm text-muted-foreground">No entry yet today. How was your day?</p>
      ) : (
        <div className="flex flex-col gap-1">
          {entry.mood != null && <span className="text-xs text-muted-foreground">Mood: {entry.mood}/5</span>}
          <p className="line-clamp-3 text-sm">{entry.body_md}</p>
        </div>
      )}
    </div>
  );
}

export default JournalCard;
