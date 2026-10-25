import { SetPageContext } from '@/components/chat/page-context';
import { AddBookForm } from '@/components/books/AddBookForm';
import { BookCard } from '@/components/books/BookCard';
import { listBooks, recentSessions, statsFor } from '@/lib/domain/books';
import { listAreas } from '@/lib/domain/areas';
import { areaColor } from '@/lib/domain/areas-colors';
import { istDate } from '@/lib/time';
import { getOrder } from '@/lib/domain/order';
import { Reorderable } from '@/components/widgets/Reorderable';

const SECTIONS: { key: string[]; title: string }[] = [
  { key: ['reading'], title: 'Reading now' },
  { key: ['to_read'], title: 'To read' },
  { key: ['finished'], title: 'Finished' },
  { key: ['dropped'], title: 'Dropped' },
];

export default async function BooksPage() {
  const [books, areas, sessions] = await Promise.all([
    listBooks().catch(() => []),
    listAreas(),
    recentSessions(30).catch(() => []),
  ]);
  const today = istDate();
  const orders = await Promise.all(SECTIONS.map((sec) => getOrder(`books-${sec.key[0]}`)));
  const am = new Map(areas.map((a) => [a.id, a]));
  const byBook = (id: string) => sessions.filter((s) => s.book_id === id);
  const finishedThisYear = books.filter((b) => b.finished_on?.startsWith(today.slice(0, 4))).length;
  const pages30 = sessions.reduce((n, s) => n + s.pages, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <SetPageContext ctx={{ route: '/books', entity_type: 'none' }} />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Books</h1>
        <p className="text-sm text-muted-foreground">{finishedThisYear} finished this year · {pages30} pages in the last 30 days · {books.filter((b) => b.status === 'to_read').length} waiting</p>
      </header>
      <section className="rounded-2xl border border-border bg-card p-4"><AddBookForm areas={areas.map((a) => ({ id: a.id, name: a.name }))} /></section>
      {SECTIONS.map((sec, si) => {
        const items = books.filter((b) => sec.key.includes(b.status));
        if (items.length === 0 && sec.key[0] !== 'reading') return null;
        return (
          <section key={sec.title} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{sec.title} <span className="font-normal">· {items.length}</span></h2>
            {items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here. Start a book from “To read”, or add one above.</p> : (
              <Reorderable orderKey={`books-${sec.key[0]}`} order={orders[si]} grid className="grid gap-3 md:grid-cols-2" items={items.map((b) => ({ id: b.id, node: (
                <BookCard book={b} stats={statsFor(b, byBook(b.id), today)} areaColor={b.area_id ? areaColor(am.get(b.area_id)) : undefined} areaName={b.area_id ? am.get(b.area_id)?.name : null} />
              ) }))} />
            )}
          </section>
        );
      })}
    </div>
  );
}
