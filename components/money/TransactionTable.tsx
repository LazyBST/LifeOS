'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Editable } from './Editable';
import { deleteTransactionAction, updateTransactionAction } from '@/app/actions/money';
import type { TxPatch } from '@/lib/domain/money-filters';
import { formatDate } from '@/lib/time';
import { formatINR } from '@/lib/format';
import type { Transaction, TxLabel } from '@/lib/types/db';
import { LabelPicker } from './LabelChips';

export type TableTx = Transaction & { category_name?: string | null; account_name?: string | null };
type Named = { id: string; name: string };

const KIND = { expense: ['Expense', 'text-red-600 dark:text-red-400'], income: ['Income', 'text-emerald-600 dark:text-emerald-400'], settlement: ['Settle', 'text-sky-600 dark:text-sky-400'] } as const;
const NONE = '__none__';

/**
 * Transactions as a table where every cell is editable in place: click the description, category, account, amount,
 * share, date or person and it turns into a box or drop-down right there. Used by the Money page and the full page.
 */
export function TransactionTable({ transactions, categories, accounts, labels = [], onDeleted, emptyText = 'No transactions.' }: { transactions: TableTx[]; categories: Named[]; accounts: Named[]; labels?: TxLabel[]; onDeleted?: (id: string) => void; emptyText?: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(transactions);
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => setRows(transactions), [transactions]);
  const cat = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const acc = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  async function save(id: string, patch: TxPatch): Promise<string | null> {
    const res = await updateTransactionAction(id, patch);
    if (!res.ok) { toast.error(res.error || 'Could not save'); return res.error || 'failed'; }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...res.data } : r)));
    router.refresh(); // balances and charts elsewhere follow
    return null;
  }
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

  async function remove(id: string) {
    setDeleting(id);
    const res = await deleteTransactionAction(id);
    setDeleting(null);
    if (!res.ok) { toast.error(res.error || 'Could not delete'); return; }
    setRows((prev) => prev.filter((r) => r.id !== id));
    onDeleted?.(id);
    toast.success('Transaction deleted');
    router.refresh();
  }

  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{emptyText}</p>;
  const th = 'px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b">
            <th className={th}>Date</th><th className={th}>Description</th><th className={th}>Category</th><th className={th}>Labels</th><th className={th}>Account</th>
            <th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>My share</th><th className={th}>Person</th><th className={`${th} text-right`}>Owed</th><th />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((t) => {
            const owed = t.kind === 'expense' ? Number(t.amount) - Number(t.my_share ?? t.amount) : t.kind === 'settlement' ? -Number(t.amount) : 0;
            const [kindLabel, kindColor] = KIND[t.kind];
            return (
              <tr key={t.id} className="align-middle hover:bg-muted/30">
                <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                  <Editable label="date" type="date" value={t.occurred_on} display={formatDate(t.occurred_on)} onCommit={(v) => v ? save(t.id, { occurred_on: v }) : 'Pick a date'} />
                </td>
                <td className="max-w-56 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`shrink-0 text-[10px] font-semibold uppercase ${kindColor}`}>{kindLabel}</span>
                    <Editable label="description" value={t.description ?? ''} placeholder="Add a description" className="truncate" onCommit={(v) => save(t.id, { description: v })} />
                  </div>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {t.kind === 'settlement' ? '—' : (
                    <Editable label="category" value={t.category_id ?? NONE} display={cat.get(t.category_id ?? '') ?? t.category_name ?? '—'} options={[{ value: NONE, label: '— none' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} onCommit={(v) => save(t.id, { category_id: v === NONE ? null : v })} />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {t.kind === 'settlement' ? <span className="text-muted-foreground">—</span> : <LabelPicker labels={labels} value={t.labels ?? []} onChange={(next) => void save(t.id, { labels: next })} />}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  <Editable label="account" value={t.account_id ?? NONE} display={acc.get(t.account_id ?? '') ?? t.account_name ?? '—'} options={[{ value: NONE, label: '— none' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} onCommit={(v) => save(t.id, { account_id: v === NONE ? null : v })} />
                </td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  <Editable label="amount" type="number" align="right" value={String(Number(t.amount))} display={formatINR(Number(t.amount))} onCommit={(v) => Number.isNaN(num(v)) ? 'Enter an amount' : save(t.id, { amount: num(v) })} />
                </td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap text-muted-foreground">
                  {t.kind === 'expense' ? <Editable label="my share" type="number" align="right" value={String(Number(t.my_share ?? t.amount))} display={formatINR(Number(t.my_share ?? t.amount))} onCommit={(v) => Number.isNaN(num(v)) ? 'Enter your share' : save(t.id, { my_share: num(v) })} /> : '—'}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground capitalize">
                  <Editable label="person" value={t.counterparty ?? ''} placeholder="—" onCommit={(v) => save(t.id, { counterparty: v })} />
                </td>
                <td className={`px-2 py-1.5 text-right font-medium whitespace-nowrap ${owed === 0 ? 'text-muted-foreground' : owed > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{owed === 0 ? '—' : formatINR(owed)}</td>
                <td className="px-1 py-1.5 text-right">
                  <button type="button" disabled={deleting === t.id} onClick={() => void remove(t.id)} aria-label="Delete transaction" title="Delete" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"><Trash2 className="size-3.5" /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
