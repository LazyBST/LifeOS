// Chat tools for books: add, update, log reading, list, link to a goal/project/task/habit.
import 'server-only';
import { z } from 'zod';
import type { ToolDef, ToolOutcome } from '../types';
import { resolveRef, toPendingChoice, askMessage, type RefType } from '../resolver';
import { parseDateIST, formatDate, istDate } from '@/lib/time';
import { createBook, getBook, linkBook, listBooks, logReading, recentSessions, statsFor, updateBook } from '@/lib/domain/books';
import type { Book, BookLinkType, UUID } from '@/lib/types/db';

async function pick(ref: string, types: RefType[], ctx: Parameters<ToolDef['handler']>[1], tool: string, input: Record<string, unknown>, field: string, label: string): Promise<{ id: UUID; type: RefType } | { stop: ToolOutcome }> {
  const res = await resolveRef(ref, { types, ctx });
  if (res.kind === 'auto') return { id: res.pick.id as UUID, type: res.pick.type as RefType };
  if (res.kind === 'ask') return { stop: { message: askMessage(label, res.options), pending: toPendingChoice(tool, input, field, res.options) } };
  return { stop: { message: `No ${label} matching "${ref}". I won't create one automatically.` } };
}

const card = (b: Book, extra?: string) => ({ kind: 'book' as const, title: b.title, subtitle: [b.author, extra].filter(Boolean).join(' · ') || undefined, href: `/books/${b.id}` });
const touched = (b: Book) => [{ type: 'book', id: b.id, title: b.title }];
const BOOK_STATUS = z.enum(['to_read', 'reading', 'finished', 'dropped']);

function dateOf(text: string | undefined, now: Date): { date: string; echo: string } | { error: string } | null {
  if (!text) return null;
  const p = parseDateIST(text, now);
  return p ? { date: p.date, echo: p.text } : { error: `Could not understand the date "${text}".` };
}

const addSchema = z.object({
  title: z.string().min(1), author: z.string().optional(), total_pages: z.number().int().positive().optional(),
  area: z.string().optional(), status: BOOK_STATUS.optional(), finish_by: z.string().optional(),
  goal_ref: z.string().optional(), project_ref: z.string().optional(),
});
const bookAdd: ToolDef<typeof addSchema> = {
  name: 'book_add',
  description: 'Add a book to the shelf (status to_read by default), optionally with its author, page count, Area, a finish-by date, and a goal or project it serves.',
  schema: addSchema, part: 1,
  handler: async (input, ctx) => {
    const target = dateOf(input.finish_by, ctx.now);
    if (target && 'error' in target) return { message: target.error };
    const links: { type: BookLinkType; id: UUID }[] = [];
    for (const [ref, type] of [[input.goal_ref, 'goal'], [input.project_ref, 'project']] as const) {
      if (!ref) continue;
      const r = await pick(ref, [type], ctx, 'book_add', input, `${type}_ref`, type);
      if ('stop' in r) return r.stop;
      links.push({ type, id: r.id });
    }
    const b = await createBook({ title: input.title, author: input.author ?? null, total_pages: input.total_pages ?? null, area: input.area ?? null, status: input.status, target_date: target?.date ?? null });
    for (const l of links) await linkBook(b.id, l.type, l.id);
    return {
      message: `Added "${b.title}"${b.author ? ` by ${b.author}` : ''} (${b.status.replace('_', ' ')})${target ? `, finish by ${target.echo}` : ''}${links.length ? `, linked to ${links.length} item${links.length > 1 ? 's' : ''}` : ''}.`,
      cards: [card(b, b.total_pages ? `${b.total_pages} pages` : undefined)], touched: touched(b), data: { before: null, after: b },
    };
  },
};

const updSchema = z.object({
  ref: z.string().optional(), status: BOOK_STATUS.optional(), rating: z.number().int().min(1).max(5).optional(),
  total_pages: z.number().int().positive().optional(), current_page: z.number().int().min(0).optional(), finish_by: z.string().optional(),
  author: z.string().optional(), title: z.string().optional(), area: z.string().optional(),
});
const bookUpdate: ToolDef<typeof updSchema> = {
  name: 'book_update',
  description: 'Change a book: status (to_read, reading, finished, dropped), rating 1-5, page count, current page, finish-by date, author, title or Area. Finishing fills the pages and stamps the date.',
  schema: updSchema, part: 1,
  handler: async (input, ctx) => {
    const ref = input.ref ?? (ctx.page.entity_type === 'book' ? 'this' : undefined);
    if (!ref) return { message: 'Which book? Name it, or open its page.' };
    const r = await pick(ref, ['book'], ctx, 'book_update', input, 'ref', 'book');
    if ('stop' in r) return r.stop;
    const before = await getBook(r.id);
    if (!before) return { message: 'Book not found.' };
    const target = dateOf(input.finish_by, ctx.now);
    if (target && 'error' in target) return { message: target.error };
    const b = await updateBook(r.id, { status: input.status, rating: input.rating, total_pages: input.total_pages, current_page: input.current_page, target_date: target?.date, author: input.author, title: input.title, area: input.area });
    const bits = [input.status && `now ${input.status.replace('_', ' ')}`, input.rating && `${input.rating}★`, input.current_page != null && `page ${b.current_page}`, target && `finish by ${target.echo}`].filter(Boolean);
    return { message: `Updated "${b.title}"${bits.length ? `: ${bits.join(', ')}` : ''}.`, cards: [card(b)], touched: touched(b), data: { before, after: b } };
  },
};

const logSchema = z.object({ ref: z.string().optional(), pages: z.number().int().positive(), minutes: z.number().int().positive().optional(), date: z.string().optional() });
const bookLog: ToolDef<typeof logSchema> = {
  name: 'book_log_reading',
  description: 'Log pages read today (or on a date) for a book. Moves the bookmark, starts a to-read book, and finishes it at the last page.',
  schema: logSchema, part: 1,
  handler: async (input, ctx) => {
    const ref = input.ref ?? (ctx.page.entity_type === 'book' ? 'this' : undefined);
    let id: UUID;
    if (ref) {
      const r = await pick(ref, ['book'], ctx, 'book_log_reading', input, 'ref', 'book');
      if ('stop' in r) return r.stop;
      id = r.id;
    } else {
      const reading = await listBooks({ status: ['reading'] });
      if (reading.length !== 1) return { message: reading.length ? `You are reading ${reading.length} books; which one? ${reading.map((b) => b.title).join(', ')}.` : 'You are not reading anything yet. Name the book.' };
      id = reading[0].id;
    }
    const d = dateOf(input.date, ctx.now);
    if (d && 'error' in d) return { message: d.error };
    const before = await getBook(id);
    const out = await logReading(id, input.pages, { date: d?.date, minutes: input.minutes });
    const st = statsFor(out.book, await recentSessions(30).then((s) => s.filter((x) => x.book_id === id)), istDate(ctx.now));
    return {
      message: out.finished ? `Finished "${out.book.title}"! 🎉` : `Logged ${input.pages} pages of "${out.book.title}": page ${out.book.current_page}${out.book.total_pages ? ` of ${out.book.total_pages} (${st.pct}%)` : ''}${st.eta ? `, on pace to finish ~${formatDate(st.eta)}` : ''}.`,
      cards: [card(out.book, st.pct != null ? `${st.pct}%` : undefined)], touched: touched(out.book), data: { before, after: out.book, logId: out.log.id },
    };
  },
};

const listSchema = z.object({ status: BOOK_STATUS.optional(), area: z.string().optional(), limit: z.number().int().min(1).max(30).optional() });
const bookList: ToolDef<typeof listSchema> = {
  name: 'book_list',
  description: 'List books, optionally by status or Area. Use for "what am I reading" or "what is on my shelf".',
  schema: listSchema, part: 1,
  handler: async (input) => {
    const all = await listBooks({ status: input.status ? [input.status] : undefined, limit: input.limit ?? 15 });
    const books = input.area ? all.filter((b) => b.area_id) : all;
    if (books.length === 0) return { message: input.status ? `No books with status ${input.status.replace('_', ' ')}.` : 'The shelf is empty.' };
    return { message: books.map((b) => `${b.title}${b.author ? ` — ${b.author}` : ''} [${b.status.replace('_', ' ')}${b.total_pages ? `, ${b.current_page}/${b.total_pages}` : ''}]`).join('; '), cards: books.slice(0, 8).map((b) => card(b)), data: books.map((b) => ({ id: b.id, title: b.title, status: b.status })) };
  },
};

const linkSchema = z.object({ book_ref: z.string().optional(), goal_ref: z.string().optional(), project_ref: z.string().optional(), task_ref: z.string().optional(), habit_ref: z.string().optional() });
const bookLink: ToolDef<typeof linkSchema> = {
  name: 'book_link',
  description: 'Link a book to a goal, project, task or habit it serves. Give the book (or open its page) and one target.',
  schema: linkSchema, part: 1,
  handler: async (input, ctx) => {
    const target = ([['goal_ref', 'goal'], ['project_ref', 'project'], ['task_ref', 'task'], ['habit_ref', 'habit']] as const).find(([k]) => input[k]);
    if (!target) return { message: 'Link it to what: a goal, project, task or habit?' };
    const bookRef = input.book_ref ?? (ctx.page.entity_type === 'book' ? 'this' : undefined);
    if (!bookRef) return { message: 'Which book?' };
    const b = await pick(bookRef, ['book'], ctx, 'book_link', input, 'book_ref', 'book');
    if ('stop' in b) return b.stop;
    const t = await pick(input[target[0]]!, [target[1]], ctx, 'book_link', input, target[0], target[1]);
    if ('stop' in t) return t.stop;
    await linkBook(b.id, target[1], t.id);
    const book = await getBook(b.id);
    return { message: `Linked "${book?.title}" to that ${target[1]}.`, cards: book ? [card(book)] : [], data: { before: null, after: { book_id: b.id, type: target[1], entity_id: t.id } } };
  },
};

export const bookTools: ToolDef[] = [bookAdd, bookUpdate, bookLog, bookList, bookLink] as unknown as ToolDef[];
