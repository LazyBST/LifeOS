'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { linkBookAction, unlinkBookAction } from '@/app/actions/books';
import type { BookLinkType } from '@/lib/types/db';

type Opt = { id: string; title: string };
const LABEL: Record<BookLinkType, string> = { goal: 'Goal', project: 'Project', task: 'Task', habit: 'Habit' };

/** A book's links: to any goal, project, task or habit. (The Area is the book's own field.) */
export function BookLinks({ bookId, links, options }: {
  bookId: string;
  links: { type: BookLinkType; id: string; title: string; href: string }[];
  options: Record<BookLinkType, Opt[]>;
}) {
  const router = useRouter();
  const [type, setType] = useState<BookLinkType>('goal');
  const [target, setTarget] = useState('');
  const [, start] = useTransition();
  const taken = new Set(links.map((l) => `${l.type}:${l.id}`));
  const choices = options[type].filter((o) => !taken.has(`${type}:${o.id}`));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) toast.error(r.error ?? 'Failed'); setTarget(''); router.refresh(); });
  const f = 'h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus:border-ring';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {links.length === 0 && <p className="text-sm text-muted-foreground">Not linked to anything yet.</p>}
        {links.map((l) => (
          <span key={`${l.type}:${l.id}`} className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pr-1 pl-3 text-sm">
            <span className="text-[11px] font-semibold uppercase text-muted-foreground">{LABEL[l.type]}</span>
            <Link href={l.href} className="hover:underline">{l.title}</Link>
            <button type="button" aria-label="Unlink" onClick={() => run(() => unlinkBookAction(bookId, l.type, l.id))} className="rounded-full px-1.5 text-muted-foreground hover:bg-background hover:text-foreground">×</button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <select className={f} value={type} onChange={(e) => { setType(e.target.value as BookLinkType); setTarget(''); }} aria-label="Link type">
          {(Object.keys(LABEL) as BookLinkType[]).map((t) => <option key={t} value={t}>{LABEL[t]}</option>)}
        </select>
        <select className={`${f} min-w-52 flex-1`} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Link target">
          <option value="">Choose a {LABEL[type].toLowerCase()}…</option>
          {choices.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
        <button type="button" disabled={!target} onClick={() => run(() => linkBookAction(bookId, type, target))} className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-40">Link</button>
      </div>
    </div>
  );
}
