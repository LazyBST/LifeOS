import Link from 'next/link';
import { booksFor, listBooks, recentSessions, statsFor } from '@/lib/domain/books';
import { StatusLabel } from '@/components/status/StatusLabel';
import { LinkBookPicker, UnlinkBook } from './LinkBookPicker';
import type { BookLinkType } from '@/lib/types/db';

/** Books attached to a goal, project, task or habit. Hidden entirely until migration 0012 has run. */
export async function LinkedBooks({ entityType, entityId, title = 'Books for this' }: { entityType: BookLinkType; entityId: string; title?: string }) {
  const [linked, all, sessions] = await Promise.all([booksFor(entityType, entityId).catch(() => null), listBooks().catch(() => []), recentSessions(30).catch(() => [])]);
  if (linked === null) return null;
  const ids = new Set(linked.map((b) => b.id));
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {linked.length === 0 && <p className="text-xs text-muted-foreground">No books linked. Link one you are reading for this.</p>}
      <div className="flex flex-col gap-2">
        {linked.map((b) => {
          const st = statsFor(b, sessions.filter((s) => s.book_id === b.id));
          return (
            <div key={b.id} className="flex items-center gap-2 text-sm">
              <Link href={`/books/${b.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{b.title}</Link>
              <span className="text-xs text-muted-foreground">{st.pct ?? 0}%</span>
              <StatusLabel status={b.status} compact />
              <UnlinkBook bookId={b.id} entityType={entityType} entityId={entityId} />
            </div>
          );
        })}
      </div>
      <LinkBookPicker entityType={entityType} entityId={entityId} available={all.filter((b) => !ids.has(b.id)).map((b) => ({ id: b.id, title: b.title }))} />
    </section>
  );
}
