'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { findTransferPairsAction, mergeTransferPairsAction } from '@/app/actions/money';
import { formatDate } from '@/lib/time';
import { formatINR } from '@/lib/format';
import type { NamedPair } from '@/lib/domain/transfers';

/** Look through recent transactions for money that only moved between your own accounts, and merge each pair into one transfer. */
export function FindTransfers() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Find transfers</Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader><DialogTitle>Find transfers</DialogTitle></DialogHeader>
            <Finder onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function Finder({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pairs, setPairs] = useState<NamedPair[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const key = (p: NamedPair) => `${p.expenseId}:${p.incomeId}`;

  async function scan() {
    setBusy(true);
    const r = await findTransferPairsAction();
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setPairs(r.data);
    setPicked(Object.fromEntries(r.data.map((p) => [key(p), p.confidence === 'sure'])));
  }

  async function merge() {
    const chosen = (pairs ?? []).filter((p) => picked[key(p)]);
    setBusy(true);
    const r = await mergeTransferPairsAction(chosen.map((p) => ({ expenseId: p.expenseId, incomeId: p.incomeId })));
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`${r.data} transfer${r.data === 1 ? '' : 's'} made`);
    router.refresh();
    onDone();
  }

  if (!pairs) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">Looks for an expense on one account and an income of the same amount on another, a day or two apart (the last 6 months). Each match can become one transfer, which is not counted as income or spending.</p>
        <div className="flex justify-end"><Button onClick={() => void scan()} disabled={busy}>{busy ? 'Looking…' : 'Look for transfers'}</Button></div>
      </div>
    );
  }
  if (pairs.length === 0) return <p className="text-sm text-muted-foreground">No transfers found. Anything that is missed can be changed with the ⇄ button on its row.</p>;
  const n = pairs.filter((p) => picked[key(p)]).length;
  return (
    <div className="space-y-3 text-sm">
      <ul className="divide-y rounded-xl border">
        {pairs.map((p) => (
          <li key={key(p)} className="flex items-start gap-2 px-3 py-2">
            <input type="checkbox" checked={!!picked[key(p)]} onChange={(e) => setPicked((m) => ({ ...m, [key(p)]: e.target.checked }))} className="mt-1 size-4" aria-label="Merge into a transfer" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{formatINR(p.amount)}: {p.fromName} → {p.toName}</div>
              <div className="truncate text-xs text-muted-foreground">{formatDate(p.date)} · {p.expenseDescription ?? 'expense'} / {p.incomeDescription ?? 'income'}</div>
              <div className={`text-xs ${p.confidence === 'sure' ? 'text-emerald-600' : 'text-amber-600'}`}>{p.confidence === 'sure' ? 'Sure' : 'Likely'}: {p.reason}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-end"><Button onClick={() => void merge()} disabled={busy || n === 0}>{busy ? 'Merging…' : `Make ${n} transfer${n === 1 ? '' : 's'}`}</Button></div>
    </div>
  );
}
