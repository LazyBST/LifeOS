import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { areaByName } from './areas';
import { clampPage, estimatedFinish, pagesNeededPerDay, pagesPerDay, progressPct, verdict, type Verdict } from './books-math';
import { istDate } from '@/lib/time';
import type { Book, BookLink, BookLinkType, DateStr, ReadingLogRow, UUID } from '@/lib/types/db';

export type BookInput = {
  title: string;
  author?: string | null;
  status?: string;
  rating?: number | null;
  total_pages?: number | null;
  current_page?: number;
  area?: string | null;
  area_id?: UUID | null;
  start_date?: DateStr | null;
  target_date?: DateStr | null;
  tags?: string[];
  notes_md?: string;
  cover_url?: string | null;
};
export type BookPatch = Partial<BookInput>;

export async function listBooks(opts: { status?: string[]; area_id?: UUID; limit?: number } = {}): Promise<Book[]> {
  let q = admin().from('books').select('*').is('deleted_at', null);
  if (opts.status?.length) q = q.in('status', opts.status);
  if (opts.area_id) q = q.eq('area_id', opts.area_id);
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(opts.limit ?? 500);
  if (error) throw new Error(`books: ${error.message}`);
  return data as Book[];
}

export async function getBook(id: UUID): Promise<Book | null> {
  const { data } = await admin().from('books').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  return (data as Book) ?? null;
}

async function areaIdOf(i: { area?: string | null; area_id?: UUID | null }): Promise<UUID | null | undefined> {
  if (i.area_id !== undefined) return i.area_id;
  if (i.area !== undefined) return i.area ? (await areaByName(i.area))?.id ?? null : null;
  return undefined;
}

export async function createBook(input: BookInput): Promise<Book> {
  const today = istDate();
  const status = input.status ?? 'to_read';
  const total = input.total_pages ?? null;
  const row = {
    title: input.title.trim(),
    author: input.author ?? null,
    status,
    rating: input.rating ?? null,
    total_pages: total,
    current_page: clampPage(input.current_page ?? (status === 'finished' && total ? total : 0), total),
    area_id: (await areaIdOf(input)) ?? null,
    start_date: input.start_date ?? null,
    target_date: input.target_date ?? null,
    started_on: status === 'reading' || status === 'finished' ? today : null,
    finished_on: status === 'finished' ? today : null,
    tags: input.tags ?? [],
    notes_md: input.notes_md ?? '',
    cover_url: input.cover_url ?? null,
  };
  const { data, error } = await admin().from('books').insert(row).select('*').single();
  if (error) throw new Error(`book_create: ${error.message}`);
  return data as Book;
}

/** Status changes keep the dates and page count consistent: reading stamps started_on, finished stamps finished_on and fills the pages. */
export async function updateBook(id: UUID, patch: BookPatch): Promise<Book> {
  const before = await getBook(id);
  if (!before) throw new Error(`No book ${id}`);
  const today = istDate();
  const row: Record<string, unknown> = {};
  for (const k of ['title', 'author', 'rating', 'total_pages', 'start_date', 'target_date', 'tags', 'notes_md', 'cover_url'] as const) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  const area = await areaIdOf(patch);
  if (area !== undefined) row.area_id = area;
  const total = (patch.total_pages !== undefined ? patch.total_pages : before.total_pages) ?? null;
  if (patch.current_page !== undefined) row.current_page = clampPage(patch.current_page, total);
  if (patch.status !== undefined && patch.status !== before.status) {
    row.status = patch.status;
    if (patch.status === 'reading' && !before.started_on) row.started_on = today;
    if (patch.status === 'finished') {
      row.finished_on = today;
      if (!before.started_on) row.started_on = today;
      if (total) row.current_page = total;
    }
    if (before.status === 'finished' && patch.status !== 'finished') row.finished_on = null;
  }
  const { data, error } = await admin().from('books').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(`book_update: ${error.message}`);
  return data as Book;
}

export async function deleteBook(id: UUID): Promise<Book> {
  const { data, error } = await admin().from('books').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (error) throw new Error(`book_delete: ${error.message}`);
  return data as Book;
}

export async function restoreBook(id: UUID): Promise<void> {
  await admin().from('books').update({ deleted_at: null }).eq('id', id);
}

// ---- reading log ------------------------------------------------------------

export async function readingLog(bookId: UUID, limit = 60): Promise<ReadingLogRow[]> {
  const { data, error } = await admin().from('reading_log').select('*').eq('book_id', bookId).order('read_on', { ascending: false }).limit(limit);
  if (error) return [];
  return data as ReadingLogRow[];
}

/** Logs pages read: moves the bookmark, starts the book if needed, finishes it at the last page. */
export async function logReading(bookId: UUID, pages: number, opts: { date?: DateStr; minutes?: number; note?: string } = {}): Promise<{ book: Book; log: ReadingLogRow; finished: boolean }> {
  if (!(pages > 0)) throw new Error('Pages read must be more than zero.');
  const book = await getBook(bookId);
  if (!book) throw new Error(`No book ${bookId}`);
  const date = opts.date ?? istDate();
  const next = clampPage(book.current_page + pages, book.total_pages);
  const actual = next - book.current_page; // pages that actually fit before the last page
  const { data: log, error } = await admin().from('reading_log').insert({ book_id: bookId, read_on: date, pages: actual > 0 ? actual : pages, minutes: opts.minutes ?? null, note: opts.note ?? null }).select('*').single();
  if (error) throw new Error(`reading_log: ${error.message}`);
  const finished = !!book.total_pages && next >= book.total_pages;
  const updated = await updateBook(bookId, { current_page: next, status: finished ? 'finished' : book.status === 'to_read' ? 'reading' : undefined });
  return { book: updated, log: log as ReadingLogRow, finished };
}

export async function undoLogReading(logId: UUID): Promise<void> {
  const { data } = await admin().from('reading_log').select('*').eq('id', logId).maybeSingle();
  if (!data) return;
  const book = await getBook(data.book_id as string);
  await admin().from('reading_log').delete().eq('id', logId);
  if (book) await admin().from('books').update({ current_page: Math.max(0, book.current_page - Number(data.pages)) }).eq('id', book.id);
}

export type BookStats = { pct: number | null; pace: number; eta: string | null; neededPerDay: number | null; verdict: Verdict };

export function statsFor(book: Book, sessions: { read_on: string; pages: number }[], today = istDate()): BookStats {
  const pace = pagesPerDay(sessions, today);
  return {
    pct: progressPct(book.current_page, book.total_pages),
    pace: Math.round(pace * 10) / 10,
    eta: estimatedFinish(book.current_page, book.total_pages, pace, today),
    neededPerDay: pagesNeededPerDay(book.current_page, book.total_pages, book.target_date, today),
    verdict: verdict({ current: book.current_page, total: book.total_pages, target: book.target_date, pace, today }),
  };
}

/** Pages read per book over the last `days` days. */
export async function recentSessions(days = 30): Promise<(ReadingLogRow)[]> {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await admin().from('reading_log').select('*').gte('read_on', from);
  return (data ?? []) as ReadingLogRow[];
}

// ---- links ------------------------------------------------------------------

export async function linkBook(bookId: UUID, type: BookLinkType, entityId: UUID): Promise<void> {
  const { error } = await admin().from('book_links').upsert({ book_id: bookId, entity_type: type, entity_id: entityId }, { onConflict: 'book_id,entity_type,entity_id' });
  if (error) throw new Error(`book_link: ${error.message}`);
}

export async function unlinkBook(bookId: UUID, type: BookLinkType, entityId: UUID): Promise<void> {
  await admin().from('book_links').delete().eq('book_id', bookId).eq('entity_type', type).eq('entity_id', entityId);
}

export async function linksOfBook(bookId: UUID): Promise<{ link: BookLink; title: string; href: string }[]> {
  const { data } = await admin().from('book_links').select('*').eq('book_id', bookId);
  const links = (data ?? []) as BookLink[];
  const table = { goal: 'goals', project: 'projects', task: 'tasks', habit: 'habits' } as const;
  const hrefOf = { goal: '/goals/', project: '/projects/', task: '/tasks/', habit: '/habits' } as const;
  const out = await Promise.all(links.map(async (l) => {
    const col = l.entity_type === 'habit' ? 'name' : 'title';
    const { data: r } = await admin().from(table[l.entity_type]).select(col).eq('id', l.entity_id).maybeSingle();
    const title = (r as Record<string, string> | null)?.[col];
    return title ? { link: l, title, href: l.entity_type === 'habit' ? hrefOf.habit : `${hrefOf[l.entity_type]}${l.entity_id}` } : null;
  }));
  return out.filter((x): x is NonNullable<typeof x> => x !== null);
}

/** Books attached to a goal, project, task or habit. */
export async function booksFor(type: BookLinkType, entityId: UUID): Promise<Book[]> {
  const { data } = await admin().from('book_links').select('book_id').eq('entity_type', type).eq('entity_id', entityId);
  const ids = (data ?? []).map((r: { book_id: string }) => r.book_id);
  if (!ids.length) return [];
  const { data: books } = await admin().from('books').select('*').in('id', ids).is('deleted_at', null);
  return (books ?? []) as Book[];
}
