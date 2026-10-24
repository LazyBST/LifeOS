import { formatDate } from '@/lib/time';
import type { JournalEntry } from '@/lib/types/db';

const MOOD_EMOJI: Record<number, string> = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };

type JournalListProps = {
  entries: JournalEntry[];
  /** Newest first by default. */
  className?: string;
};

/** Last entries: date, mood and the first lines of the entry (spec section 6). */
export function JournalList({ entries, className }: JournalListProps) {
  const sorted = [...entries].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">No past entries yet.</p>;
  }
  return (
    <ul className={className ?? 'space-y-2'}>
      {sorted.map((e) => {
        const firstLines = e.body_md.trim().split('\n').slice(0, 2).join(' ').slice(0, 160);
        return (
          <li key={e.entry_date} className="rounded-lg border border-border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{formatDate(e.entry_date)}</span>
              {e.mood != null && <span className="text-sm">{MOOD_EMOJI[e.mood] ?? e.mood}</span>}
            </div>
            <p className="mt-1 line-clamp-2 text-sm">{firstLines || 'No notes.'}</p>
          </li>
        );
      })}
    </ul>
  );
}

export default JournalList;
