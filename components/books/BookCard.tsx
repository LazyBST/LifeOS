import Link from 'next/link';
import { StatusLabel } from '@/components/status/StatusLabel';
import { LogPages } from './LogPages';
import { formatDate } from '@/lib/time';
import type { Book } from '@/lib/types/db';
import type { BookStats } from '@/lib/domain/books';

const VERDICT: Record<BookStats['verdict'], { text: string; cls: string } | null> = {
  finished: null,
  on_track: { text: 'On track', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  behind: { text: 'Behind', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
  no_pace: null,
  no_target: null,
};

/** A book with its progress, pace and a one-tap page logger. */
export function BookCard({ book, stats, areaColor, areaName, compact = false }: { book: Book; stats: BookStats; areaColor?: string; areaName?: string | null; compact?: boolean }) {
  const v = VERDICT[stats.verdict];
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-3" style={areaColor ? { borderLeftColor: areaColor, borderLeftWidth: 3 } : undefined}>
      <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 text-lg font-bold text-white" aria-hidden>
        {book.title.slice(0, 1).toUpperCase()}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <Link href={`/books/${book.id}`} className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold hover:underline">{book.title}</div>
            {book.author && <div className="truncate text-xs text-muted-foreground">{book.author}{areaName ? ` · ${areaName}` : ''}</div>}
          </Link>
          <StatusLabel status={book.status} compact />
        </div>
        {book.total_pages ? (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(2, stats.pct ?? 0)}%` }} /></div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{book.current_page} / {book.total_pages} pages · {stats.pct}%</span>
              {book.status === 'reading' && stats.pace > 0 && <span>{stats.pace}/day{stats.eta ? ` · done ~${formatDate(stats.eta).slice(0, -5)}` : ''}</span>}
              {book.target_date && book.status !== 'finished' && <span>target {formatDate(book.target_date).slice(0, -5)}{stats.neededPerDay ? ` (${stats.neededPerDay}/day)` : ''}</span>}
              {v && <span className={`rounded-full px-1.5 py-0.5 font-semibold ${v.cls}`}>{v.text}</span>}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Add the page count to track progress.</div>
        )}
        {!compact && book.status !== 'finished' && book.status !== 'dropped' && <LogPages bookId={book.id} />}
        {book.status === 'finished' && book.rating ? <div className="text-sm text-amber-500">{'★'.repeat(book.rating)}<span className="text-muted-foreground/40">{'★'.repeat(5 - book.rating)}</span></div> : null}
      </div>
    </div>
  );
}
