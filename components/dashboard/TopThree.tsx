'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { reorderPrioritiesAction, setPriorityAction, togglePriorityAction } from '@/app/actions/widgets';
import { Reorderable } from '@/components/widgets/Reorderable';
import type { Priority3 } from '@/lib/domain/priorities';

/** Today's three priorities: fill them in the evening before or in the morning. */
export function TopThree({ initial }: { initial: Priority3[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<string[]>(initial.map((p) => p?.text ?? ''));
  const [, start] = useTransition();
  const empty = initial.every((p) => !p);
  const sig = JSON.stringify(initial);
  useEffect(() => { setDrafts(initial.map((p) => p?.text ?? '')); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  async function reorder(ids: string[]) {
    const r = await reorderPrioritiesAction(ids.map((id) => Number(id.slice(1))));
    if (!r.ok) toast.error(r.error);
    router.refresh();
  }

  function save(i: number) {
    const text = drafts[i].trim();
    if (text === (initial[i]?.text ?? '')) return;
    start(async () => {
      const r = await setPriorityAction(i + 1, text);
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }
  function toggle(i: number) {
    start(async () => {
      const r = await togglePriorityAction(i + 1);
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-2">
      {empty && <p className="text-xs text-amber-600 dark:text-amber-400">Set today’s three before you start — or tonight for tomorrow.</p>}
      <Reorderable key={sig} orderKey="top3" className="flex flex-col gap-2" onReorder={reorder} items={initial.map((p, i) => ({ id: `s${i + 1}`, node: (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${p?.done ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-muted/60'}`}>
          <span className="w-3 text-sm font-bold text-muted-foreground">{i + 1}</span>
          <button
            type="button"
            disabled={!p}
            onClick={() => toggle(i)}
            aria-label={p?.done ? 'Mark not done' : 'Mark done'}
            className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs text-white ${p?.done ? 'border-emerald-600 bg-emerald-600' : 'border-input bg-transparent'} disabled:opacity-40`}
          >{p?.done ? '✓' : ''}</button>
          <input
            value={drafts[i]}
            onChange={(e) => setDrafts((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
            onBlur={() => save(i)}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            placeholder={`Priority ${i + 1}…`}
            className={`min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground ${p?.done ? 'text-muted-foreground line-through' : ''}`}
          />
        </div>
      ) }))} />
    </div>
  );
}
