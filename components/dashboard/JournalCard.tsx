import { WidgetCard } from './WidgetCard';
import { getJournal, listJournal } from '@/lib/domain/journal';
import { addDays, istDate } from '@/lib/time';
import { JournalEditor } from '@/components/journal/JournalEditor';
import { JournalList } from '@/components/journal/JournalList';
import type { JournalEntry } from '@/lib/types/db';

async function loadJournal(): Promise<{ entry: JournalEntry | null; recent: JournalEntry[] } | null> {
  try {
    const today = istDate();
    const [entry, recent] = await Promise.all([getJournal(today), listJournal(addDays(today, -13), today)]);
    return { entry, recent: recent.filter((e) => e.entry_date !== today) };
  } catch {
    // journal table may not exist yet; render an empty editor
    return null;
  }
}

/** Today's journal entry inline, with a compact history below (spec section 6). */
export async function JournalCard() {
  const data = await loadJournal();
  const today = istDate();
  return (
    <WidgetCard title="Journal" sub="Today’s entry and mood">
      <JournalEditor date={today} initialEntry={data?.entry ?? null} compact />
      {data && data.recent.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Last 14 days
          </summary>
          <div className="mt-2">
            <JournalList entries={data.recent} />
          </div>
        </details>
      )}
    </WidgetCard>
  );
}

export default JournalCard;
