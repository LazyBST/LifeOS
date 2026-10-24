'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { linkBookAction, unlinkBookAction } from '@/app/actions/books';
import type { BookLinkType } from '@/lib/types/db';

/** On a goal, project, task or habit: link one of your books to it, or unlink. */
export function LinkBookPicker({ entityType, entityId, available }: { entityType: BookLinkType; entityId: string; available: { id: string; title: string }[] }) {
  const router = useRouter();
  const [book, setBook] = useState('');
  const [, start] = useTransition();
  if (available.length === 0) return null;
  return (
    <div className="flex gap-2">
      <select value={book} onChange={(e) => setBook(e.target.value)} className="h-9 min-w-48 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus:border-ring" aria-label="Book to link">
        <option value="">Link a book…</option>
        {available.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
      </select>
      <button type="button" disabled={!book} onClick={() => start(async () => { const r = await linkBookAction(book, entityType, entityId); if (!r.ok) toast.error(r.error); setBook(''); router.refresh(); })} className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-40">Link</button>
    </div>
  );
}

export function UnlinkBook({ bookId, entityType, entityId }: { bookId: string; entityType: BookLinkType; entityId: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <button type="button" aria-label="Unlink book" onClick={() => start(async () => { const r = await unlinkBookAction(bookId, entityType, entityId); if (!r.ok) toast.error(r.error); router.refresh(); })} className="rounded-full px-2 text-muted-foreground hover:bg-muted hover:text-foreground">×</button>
  );
}
