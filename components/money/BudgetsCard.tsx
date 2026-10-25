'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Reorderable } from '@/components/widgets/Reorderable';
import { setBudgetAction } from '@/app/actions/budgeting';
import { formatINR } from '@/lib/format';

export type BudgetItem = { category_id: string; category: string; budget: number | null; spent: number };

/** Monthly budget per category: bar turns amber past 80% and red past 100%. Click an amount to change it. */
export function BudgetsCard({ rows, categories, ready, order = [] }: { rows: BudgetItem[]; categories: { id: string; name: string }[]; ready: boolean; order?: string[] }) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState('');
  const [amount, setAmount] = useState('');
  const budgeted = rows.filter((r) => r.budget !== null);
  const totalBudget = budgeted.reduce((s, r) => s + (r.budget ?? 0), 0);
  const totalSpent = budgeted.reduce((s, r) => s + r.spent, 0);

  function save(categoryId: string, value: string) {
    const n = Number(value);
    if (Number.isNaN(n) || n < 0) { toast.error('Enter an amount.'); return; }
    start(async () => { const r = await setBudgetAction(categoryId, n); if (!r.ok) toast.error(r.error); });
  }

  if (!ready) return <p className="text-sm text-muted-foreground">Budgets need migration <code>0016_budgets_scheduled_payments.sql</code> in Supabase first.</p>;
  const unbudgeted = categories.filter((c) => !budgeted.some((b) => b.category_id === c.id));
  return (
    <div className="space-y-3">
      {budgeted.length > 0 && (
        <div className="text-sm">
          <span className="font-semibold">{formatINR(totalSpent)}</span> of {formatINR(totalBudget)} budgeted
          <span className={`ml-2 text-xs ${totalSpent > totalBudget ? 'text-red-600' : 'text-muted-foreground'}`}>{totalSpent > totalBudget ? `${formatINR(totalSpent - totalBudget)} over` : `${formatINR(totalBudget - totalSpent)} left`}</span>
        </div>
      )}
      <Reorderable orderKey="money-budgets" order={order} className="space-y-2.5" items={
        rows.map((r) => {
          const pct = r.budget ? (r.spent / r.budget) * 100 : 0;
          const color = pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500';
          return { id: r.category_id, node: (
            <div className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{r.category}</span>
                <span className="no-drag flex items-center gap-1 text-xs text-muted-foreground">
                  {formatINR(r.spent)} /
                  <Input defaultValue={r.budget ?? ''} placeholder="set" disabled={pending} inputMode="decimal" className="h-6 w-20 px-1.5 text-right text-xs"
                    onBlur={(e) => { if (e.target.value !== String(r.budget ?? '')) save(r.category_id, e.target.value || '0'); }} aria-label={`Budget for ${r.category}`} />
                </span>
              </div>
              {r.budget ? <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} /></div>
                : <div className="mt-0.5 text-[11px] text-muted-foreground">No budget set</div>}
            </div>
          ) };
        })} />
      <div className="no-drag flex flex-wrap items-center gap-2 border-t pt-3">
        <select value={adding} onChange={(e) => setAdding(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" aria-label="Category">
          <option value="">Add a budget…</option>
          {unbudgeted.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ per month" inputMode="decimal" className="h-8 w-32" />
        <button disabled={!adding || !amount || pending} onClick={() => { save(adding, amount); setAdding(''); setAmount(''); }} className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">Add</button>
      </div>
    </div>
  );
}
