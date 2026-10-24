'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { logReadingAction, undoReadingAction } from '@/app/actions/books';

/** "+ pages": log today's reading in one tap. Finishing the last page finishes the book. */
export function LogPages({ bookId, step = 10 }: { bookId: string; step?: number }) {
  const router = useRouter();
  const [v, setV] = useState('');
  const [, start] = useTransition();
  function log(pages: number) {
    if (!(pages > 0)) return;
    start(async () => {
      const r = await logReadingAction(bookId, pages);
      if (!r.ok) { toast.error(r.error); return; }
      setV('');
      toast.success(r.data.finished ? `Finished “${r.data.book.title}” 🎉` : `Logged ${pages} page${pages === 1 ? '' : 's'}.`, {
        duration: 8000,
        action: { label: 'Undo', onClick: async () => { const u = await undoReadingAction(r.data.logId); if (!u.ok) toast.error(u.error); router.refresh(); } },
      });
      router.refresh();
    });
  }
  return (
    <div className="flex items-center gap-1.5">
      <input type="number" min={1} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && log(Number(v))} placeholder="pages" className="h-9 w-20 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus:border-ring" />
      <button type="button" onClick={() => log(Number(v))} disabled={!(Number(v) > 0)} className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-40">Log</button>
      <button type="button" onClick={() => log(step)} className="h-9 rounded-lg border border-input px-2.5 text-sm" title={`Log ${step} pages`}>+{step}</button>
    </div>
  );
}
