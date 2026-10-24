'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { followImprovementAction, setImprovementAction } from '@/app/actions/widgets';
import type { Improvement } from '@/lib/domain/improvement';

/** Last night's one-liner from the journal, plus tonight's for tomorrow. */
export function ImprovementPanel({ last, tonight }: { last: Improvement | null; tonight: string }) {
  const router = useRouter();
  const [text, setText] = useState(tonight);
  const [, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { const r = await fn(); if (!r.ok) toast.error(r.error ?? 'Failed'); router.refresh(); });
  return (
    <div className="flex flex-col gap-3">
      {last ? (
        <div className="border-l-[3px] border-indigo-500 pl-3">
          <p className="text-sm font-medium">“{last.text}”</p>
          <button
            type="button"
            onClick={() => run(() => followImprovementAction(last.date, !last.followed))}
            className={`mt-2 rounded-full px-2.5 py-1 text-xs font-semibold ${last.followed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'}`}
          >{last.followed ? '✓ Following up' : 'Mark as followed up'}</button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No improvement yet. Write one tonight and it will greet you here tomorrow.</p>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Tonight: one thing to do better tomorrow</label>
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run(() => setImprovementAction(text))} placeholder="e.g. Block the first 90 minutes for the hardest task" className="min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus:border-ring" />
          <button type="button" onClick={() => run(() => setImprovementAction(text))} className="rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">Save</button>
        </div>
      </div>
    </div>
  );
}
