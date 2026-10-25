import Link from 'next/link';
import { listBooks, recentSessions, statsFor } from '@/lib/domain/books';
import { istDate } from '@/lib/time';
import { BookCard } from '@/components/books/BookCard';
import { getOrder } from '@/lib/domain/order';
import { Reorderable } from '@/components/widgets/Reorderable';
import { WidgetCard } from './WidgetCard';

/** What you are reading, how fast, and the shelf at a glance. */
export async function BooksWidget() {
  const [books, sessions] = await Promise.all([listBooks().catch(() => null), recentSessions(30).catch(() => [])]);
  const today = istDate();
  const order = await getOrder('dash-books');
  if (books === null) return <WidgetCard title="Books" sub="Reading and shelf"><p className="text-sm text-muted-foreground">Run migration 0012 to enable books.</p></WidgetCard>;
  const reading = books.filter((b) => b.status === 'reading');
  const waiting = books.filter((b) => b.status === 'to_read').length;
  const year = books.filter((b) => b.finished_on?.startsWith(today.slice(0, 4))).length;
  const pages = sessions.reduce((n, s) => n + s.pages, 0);
  const readToday = sessions.filter((s) => s.read_on === today).reduce((n, s) => n + s.pages, 0);
  return (
    <WidgetCard title="Books" sub={`${year} finished this year · ${waiting} waiting`} right={<Link href="/books" className="text-xs text-muted-foreground hover:underline">All books</Link>}>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        {[['Today', `${readToday}`, 'pages'], ['30 days', `${pages}`, 'pages'], ['Reading', `${reading.length}`, 'books']].map(([l, v, u]) => (
          <div key={l} className="rounded-xl bg-muted/50 py-2"><div className="text-xl font-bold leading-tight">{v}</div><div className="text-[12px] text-muted-foreground">{l} · {u}</div></div>
        ))}
      </div>
      {reading.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in progress. <Link href="/books" className="underline">Start a book</Link> from your shelf.</p>
      ) : (
        <Reorderable orderKey="dash-books" order={order} className="flex flex-col gap-2" items={reading.map((b) => ({ id: b.id, node: <BookCard book={b} stats={statsFor(b, sessions.filter((s) => s.book_id === b.id), today)} /> }))} />
      )}
    </WidgetCard>
  );
}
