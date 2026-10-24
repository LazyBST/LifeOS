'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createBook, deleteBook, linkBook, logReading, unlinkBook, updateBook, undoLogReading, type BookInput, type BookPatch } from '@/lib/domain/books';
import { setNotes } from '@/lib/domain/notes';
import type { Book, BookLinkType } from '@/lib/types/db';
import { type ActionResult, run } from './_result';

const refresh = () => revalidatePath('/', 'layout');

export async function createBookAction(input: BookInput): Promise<ActionResult<Book>> {
  return run(async () => { await requireUser(); const b = await createBook(input); refresh(); return b; });
}
export async function updateBookAction(id: string, patch: BookPatch): Promise<ActionResult<Book>> {
  return run(async () => { await requireUser(); const b = await updateBook(id, patch); refresh(); return b; });
}
export async function deleteBookAction(id: string): Promise<ActionResult<Book>> {
  return run(async () => { await requireUser(); const b = await deleteBook(id); refresh(); return b; });
}
export async function logReadingAction(bookId: string, pages: number, minutes?: number): Promise<ActionResult<{ book: Book; logId: string; finished: boolean }>> {
  return run(async () => {
    await requireUser();
    const r = await logReading(bookId, pages, { minutes });
    refresh();
    return { book: r.book, logId: r.log.id, finished: r.finished };
  });
}
export async function undoReadingAction(logId: string): Promise<ActionResult<null>> {
  return run(async () => { await requireUser(); await undoLogReading(logId); refresh(); return null; });
}
export async function linkBookAction(bookId: string, type: BookLinkType, entityId: string): Promise<ActionResult<null>> {
  return run(async () => { await requireUser(); await linkBook(bookId, type, entityId); refresh(); return null; });
}
export async function unlinkBookAction(bookId: string, type: BookLinkType, entityId: string): Promise<ActionResult<null>> {
  return run(async () => { await requireUser(); await unlinkBook(bookId, type, entityId); refresh(); return null; });
}
export async function saveBookNotesAction(id: string, markdown: string): Promise<ActionResult<string>> {
  return run(async () => { await requireUser(); return setNotes('book', id, markdown); });
}
