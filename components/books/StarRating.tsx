'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateBookAction } from '@/app/actions/books';

export function StarRating({ bookId, value }: { bookId: string; value: number | null }) {
  const router = useRouter();
  const [v, setV] = useState(value ?? 0);
  const [, start] = useTransition();
  function set(n: number) {
    const next = n === v ? 0 : n;
    setV(next);
    start(async () => {
      const r = await updateBookAction(bookId, { rating: next || null });
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }
  return (
    <div className="flex" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => set(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={`text-lg leading-none ${n <= v ? 'text-amber-500' : 'text-muted-foreground/40'} hover:text-amber-400`}>★</button>
      ))}
    </div>
  );
}
