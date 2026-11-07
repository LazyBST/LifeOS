'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Split } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { splitTransactionAction } from '@/app/actions/money';
import { draftAmounts, draftProblem, SplitEditor, startingParts, type DraftPart } from './SplitEditor';
import { formatINR } from '@/lib/format';
import type { TxLabel } from '@/lib/types/db';
import type { TableTx } from './TransactionTable';

type Named = { id: string; name: string };

/** The split button for a row: cut one payment into any number of parts, each with its own amount, category and labels. */
export function SplitTransaction({ tx, categories, labels, onDone }: { tx: TableTx; categories: Named[]; labels: TxLabel[]; onDone: (rows: TableTx[]) => void }) {
  const [open, setOpen] = useState(false);
  const total = Number(tx.amount);
  const [parts, setParts] = useState<DraftPart[]>(() => startingParts(total, tx.category_id ?? '', tx.labels ?? []));
  const [busy, setBusy] = useState(false);
  if (tx.kind !== 'expense' && tx.kind !== 'income') return null;
  const problem = draftProblem(total, parts);

  async function save() {
    setBusy(true);
    const nums = draftAmounts(parts);
    const r = await splitTransactionAction(tx.id, parts.map((p, i) => ({ amount: nums[i], description: p.description, category_id: p.category || null, labels: p.labels })));
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Split into ${r.data.length} parts`);
    onDone(r.data);
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => { setParts(startingParts(total, tx.category_id ?? '', tx.labels ?? [])); setOpen(true); }} aria-label="Split into parts" title="Split into parts" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <Split className="size-3.5" />
      </button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader><DialogTitle>Split {tx.description || 'this payment'} · {formatINR(total)}</DialogTitle></DialogHeader>
            <SplitEditor total={total} parts={parts} onChange={setParts} categories={categories.map((c) => ({ value: c.id, label: c.name }))} labels={labels} />
            <div className="flex items-center justify-end gap-2">
              {problem && <span className="mr-auto text-xs text-muted-foreground">{problem}</span>}
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={() => void save()} disabled={busy || !!problem}>{busy ? 'Splitting…' : `Split into ${parts.length}`}</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
