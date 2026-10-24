import { notFound } from 'next/navigation';
import { SetPageContext } from '@/components/chat/page-context';
import { Trail } from '@/components/entity/Trail';
import { areaColor } from '@/lib/domain/areas-colors';
import { PropertiesHeader } from '@/components/entity/PropertiesHeader';
import { InlineText } from '@/components/entity/InlineText';
import { InlineSelect } from '@/components/entity/InlineSelect';
import { InlineDate } from '@/components/entity/InlineDate';
import { NotesEditor } from '@/components/notes/NotesEditor';
import { LogPages } from '@/components/books/LogPages';
import { StarRating } from '@/components/books/StarRating';
import { BookLinks } from '@/components/books/BookLinks';
import { getBook, linksOfBook, readingLog, statsFor } from '@/lib/domain/books';
import { listAreas } from '@/lib/domain/areas';
import { listGoals } from '@/lib/domain/goals';
import { listProjects } from '@/lib/domain/projects';
import { listTasks } from '@/lib/domain/tasks';
import { listHabits } from '@/lib/domain/habits';
import { listStatuses } from '@/lib/domain/statuses';
import { statusesFor } from '@/lib/types/statuses';
import { formatDate, istDate } from '@/lib/time';

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();
  const [areas, log, links, goals, projects, tasks, habits, statuses] = await Promise.all([
    listAreas(), readingLog(id), linksOfBook(id), listGoals({ status: ['active'] }), listProjects({ status: ['active'] }),
    listTasks({ include_done: false, limit: 300 }), listHabits(), listStatuses(),
  ]);
  const today = istDate();
  const stats = statsFor(book, log, today);
  const statusOptions = statusesFor(statuses, 'book').map((s) => ({ value: s.key, label: s.label }));
  const save = (field: string, mode?: 'text' | 'nullable' | 'int') => ({ entity: 'book' as const, id, field, ...(mode ? { mode } : {}) });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <SetPageContext ctx={{ route: `/books/${id}`, entity_type: 'book', entity_id: id, area_id: book.area_id }} />
      <PropertiesHeader
        trail={<Trail items={[{ kind: 'books', label: 'Books', href: '/books' }, ...(book.area_id && areas.find((a) => a.id === book.area_id) ? [{ kind: 'area' as const, label: areas.find((a) => a.id === book.area_id)!.name, color: areaColor(areas.find((a) => a.id === book.area_id)) }] : [])]} />}
        title={<InlineText value={book.title} save={save('title')} textClassName="text-xl font-semibold" />}
        meta={
          <>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">Author <InlineText value={book.author ?? ''} placeholder="—" save={save('author', 'nullable')} className="w-40" /></span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">Status <InlineSelect value={book.status} options={statusOptions} save={save('status')} /></span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">Area <InlineSelect value={book.area_id} clearable options={areas.map((a) => ({ value: a.id, label: a.name }))} save={save('area_id', 'nullable')} placeholder="None" /></span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">Pages <InlineText value={book.total_pages != null ? String(book.total_pages) : ''} placeholder="—" save={save('total_pages', 'int')} className="w-16" /></span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">Start <InlineDate value={book.start_date} save={save('start_date', 'nullable')} /></span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">Finish by <InlineDate value={book.target_date} save={save('target_date', 'nullable')} /></span>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ['Progress', stats.pct != null ? `${stats.pct}%` : '—', `${book.current_page}${book.total_pages ? ` / ${book.total_pages}` : ''} pages`],
          ['Pace', `${stats.pace}/day`, 'last 14 days'],
          ['Finish estimate', stats.eta ? formatDate(stats.eta).slice(0, -5) : '—', book.target_date ? `target ${formatDate(book.target_date).slice(0, -5)}${stats.neededPerDay ? ` · needs ${stats.neededPerDay}/day` : ''}` : 'set a finish-by date'],
          ['Started / finished', book.started_on ? formatDate(book.started_on).slice(0, -5) : '—', book.finished_on ? `finished ${formatDate(book.finished_on).slice(0, -5)}` : 'in progress'],
        ].map(([l, v, s]) => (
          <div key={l} className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</div>
            <div className="text-xl font-bold">{v}</div>
            <div className="text-xs text-muted-foreground">{s}</div>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
        {book.status !== 'finished' && <div><div className="mb-1 text-xs font-medium text-muted-foreground">Log today’s reading</div><LogPages bookId={id} /></div>}
        <div><div className="mb-1 text-xs font-medium text-muted-foreground">Rating</div><StarRating bookId={id} value={book.rating} /></div>
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Linked to</h2>
        <p className="text-xs text-muted-foreground">Tie this book to the goals, projects, tasks or habits it serves. Its Area is the field above.</p>
        <BookLinks
          bookId={id}
          links={links.map((l) => ({ type: l.link.entity_type, id: l.link.entity_id, title: l.title, href: l.href }))}
          options={{
            goal: goals.map((g) => ({ id: g.id, title: g.title })),
            project: projects.map((p) => ({ id: p.id, title: p.title })),
            task: tasks.map((t) => ({ id: t.id, title: t.title })),
            habit: habits.map((h) => ({ id: h.id, title: h.name })),
          }}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Reading log</h2>
        {log.length === 0 ? <p className="text-sm text-muted-foreground">Nothing logged yet.</p> : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {log.slice(0, 20).map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2"><span className="w-24 text-muted-foreground">{formatDate(l.read_on).slice(0, -5)}</span><span className="font-medium">{l.pages} pages</span>{l.minutes ? <span className="text-muted-foreground">{l.minutes} min</span> : null}{l.note ? <span className="truncate text-muted-foreground">{l.note}</span> : null}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Notes and highlights</h2>
        <NotesEditor type="book" id={id} initial={book.notes_md} />
      </section>
    </div>
  );
}
