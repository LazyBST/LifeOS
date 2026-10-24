'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createBookAction } from '@/app/actions/books';

export function AddBookForm({ areas }: { areas: { id: string; name: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [pages, setPages] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState('to_read');
  const [, start] = useTransition();
  function add() {
    if (!title.trim()) return;
    start(async () => {
      const r = await createBookAction({ title, author: author || null, total_pages: pages ? Number(pages) : null, area_id: area || null, status });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(`Added “${r.data.title}”.`);
      setTitle(''); setAuthor(''); setPages('');
      router.refresh();
    });
  }
  const f = 'h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-ring';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Book title" className={`${f} min-w-48 flex-1`} />
      <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" className={`${f} w-40`} />
      <input type="number" min={1} value={pages} onChange={(e) => setPages(e.target.value)} placeholder="Pages" className={`${f} w-24`} />
      <select value={area} onChange={(e) => setArea(e.target.value)} className={f} aria-label="Area">
        <option value="">No area</option>
        {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className={f} aria-label="Status">
        <option value="to_read">To read</option><option value="reading">Reading now</option><option value="finished">Already read</option>
      </select>
      <button type="button" onClick={add} disabled={!title.trim()} className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40">Add book</button>
    </div>
  );
}
