'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { convertFromTransferAction, convertToTransferAction, transferCounterpartsAction } from '@/app/actions/money';
import { formatDate } from '@/lib/time';
import { formatINR } from '@/lib/format';
import type { Transaction } from '@/lib/types/db';

type Named = { id: string; name: string };
type Candidate = { id: string; description: string | null; occurred_on: string; account_id: string | null; sure: boolean };
const selectCls = 'h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm';

/** Turn an expense or income into a transfer between two of your accounts (or back). Offers to remove the entry for the other half. */
export function ConvertTransfer({ tx, accounts, onDone }: { tx: Transaction; accounts: Named[]; onDone: (t: Transaction) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={tx.kind === 'transfer' ? 'Change the transfer' : 'Convert to a transfer'} title={tx.kind === 'transfer' ? 'This is a transfer: change it' : 'Is this a transfer between your accounts?'} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <ArrowLeftRight className="size-3.5" />
      </button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{tx.kind === 'transfer' ? 'Transfer between accounts' : 'Convert to a transfer'}</DialogTitle></DialogHeader>
            <Body tx={tx} accounts={accounts} onDone={(t) => { onDone(t); setOpen(false); }} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function Body({ tx, accounts, onDone }: { tx: Transaction; accounts: Named[]; onDone: (t: Transaction) => void }) {
  const router = useRouter();
  const name = (id: string | null | undefined) => accounts.find((a) => a.id === id)?.name ?? 'no account';
  const [other, setOther] = useState('');
  const [cands, setCands] = useState<Candidate[]>([]);
  const [remove, setRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tx.kind === 'transfer') return;
    let live = true;
    void transferCounterpartsAction(tx.id).then((r) => {
      if (!live || !r.ok) return;
      setCands(r.data);
      const best = r.data.find((c) => c.sure) ?? r.data[0];
      if (best?.account_id) { setOther(best.account_id); setRemove(best.id); }
    });
    return () => { live = false; };
  }, [tx.id, tx.kind]);

  async function finish(p: Promise<{ ok: true; data: Transaction } | { ok: false; error: string }>) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success('Saved');
    router.refresh();
    onDone(r.data);
  }

  if (tx.kind === 'transfer') {
    return (
      <div className="space-y-3 text-sm">
        <p>{formatINR(Number(tx.amount))} moved from <b>{name(tx.account_id)}</b> to <b>{name(tx.to_account_id)}</b>. It is not counted as income or spending.</p>
        <p className="text-xs text-muted-foreground">Not a transfer after all? Make it:</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void finish(convertFromTransferAction(tx.id, 'expense'))}>An expense from {name(tx.account_id)}</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void finish(convertFromTransferAction(tx.id, 'income'))}>An income into {name(tx.to_account_id)}</Button>
        </div>
      </div>
    );
  }

  const out = tx.kind === 'expense';
  const options = accounts.filter((a) => a.id !== tx.account_id);
  return (
    <div className="space-y-3 text-sm">
      <p>{formatINR(Number(tx.amount))} {out ? `left ${name(tx.account_id)}` : `arrived in ${name(tx.account_id)}`}.</p>
      <label className="block space-y-1">
        <span className="font-medium">{out ? 'Where did it go?' : 'Where did it come from?'}</span>
        <select value={other} onChange={(e) => setOther(e.target.value)} className={selectCls}>
          <option value="">Choose one of your accounts…</option>
          {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {cands.length > 0 && (
        <fieldset className="space-y-1 rounded-xl border bg-muted/30 p-3">
          <legend className="px-1 text-xs font-medium">The other half looks recorded already. Remove it so nothing counts twice?</legend>
          {cands.map((c) => (
            <label key={c.id} className="flex items-start gap-2 text-xs">
              <input type="radio" name="counterpart" checked={remove === c.id} onChange={() => { setRemove(c.id); if (c.account_id) setOther(c.account_id); }} className="mt-0.5" />
              <span>{c.description ?? 'Entry'} · {formatDate(c.occurred_on)} · {name(c.account_id)}{c.sure ? ' · same bank reference' : ''}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="radio" name="counterpart" checked={remove === null} onChange={() => setRemove(null)} />Keep it</label>
        </fieldset>
      )}
      <div className="flex justify-end">
        <Button size="sm" disabled={busy || !other} onClick={() => void finish(convertToTransferAction(tx.id, other, remove))}>Make it a transfer</Button>
      </div>
    </div>
  );
}
