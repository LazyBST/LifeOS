'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { ClearableInput } from '@/components/ui/clearable-input';
import { createScheduledAction, deleteScheduledAction, payScheduledAction, skipScheduledAction } from '@/app/actions/budgeting';
import { FREQUENCIES, type Frequency } from '@/lib/domain/money-forecast-math';
import { formatINR } from '@/lib/format';
import { formatDate, istDate } from '@/lib/time';

export type UpcomingItem = { id: string; name: string; kind: 'expense' | 'income'; amount: number; date: string; overdue: boolean };

/** What is due in the next 60 days, with Pay (records it and moves to the next date), Skip and Delete, plus an add form. */
export function ScheduledCard({ items, categories, accounts, ready }: { items: UpcomingItem[]; categories: { id: string; name: string }[]; accounts: { id: string; name: string }[]; ready: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', amount: '', kind: 'expense' as 'expense' | 'income', frequency: 'monthly' as Frequency, next_due: istDate(), end_date: '', category_id: '', account_id: '' });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => { const r = await fn(); if (!r.ok) toast.error(r.error ?? 'Failed'); else toast.success(ok); });

  function add() {
    act(async () => {
      const r = await createScheduledAction({ name: f.name, kind: f.kind, amount: Number(f.amount), frequency: f.frequency, next_due: f.next_due, end_date: f.end_date || null, category_id: f.category_id || null, account_id: f.account_id || null });
      if (r.ok) { setOpen(false); setF((s) => ({ ...s, name: '', amount: '' })); }
      return r;
    }, 'Scheduled.');
  }

  if (!ready) return <p className="text-sm text-muted-foreground">Scheduled payments need migration <code>0016_budgets_scheduled_payments.sql</code> in Supabase first.</p>;
  const sel = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm';
  return (
    <div className="space-y-3">
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled in the next 60 days.</p> : (
        <ul className="divide-y">
          {items.map((o, i) => (
            <li key={`${o.id}-${o.date}-${i}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{o.name}</div>
                <div className={`text-xs ${o.overdue ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}>{o.overdue ? 'Overdue · ' : ''}{formatDate(o.date)}</div>
              </div>
              <span className={`font-semibold ${o.kind === 'income' ? 'text-emerald-600' : ''}`}>{o.kind === 'income' ? '+' : '-'}{formatINR(o.amount)}</span>
              {i === items.findIndex((x) => x.id === o.id) && (
                <span className="no-drag flex gap-1 text-xs">
                  <button disabled={pending} onClick={() => act(() => payScheduledAction(o.id), o.kind === 'income' ? 'Recorded as income.' : 'Recorded as paid.')} className="rounded-md border px-2 py-1 hover:bg-muted">{o.kind === 'income' ? 'Received' : 'Paid'}</button>
                  <button disabled={pending} onClick={() => act(() => skipScheduledAction(o.id), 'Skipped.')} className="rounded-md border px-2 py-1 hover:bg-muted">Skip</button>
                  <button disabled={pending} onClick={() => act(() => deleteScheduledAction(o.id), 'Removed.')} className="rounded-md border px-2 py-1 text-red-600 hover:bg-muted" aria-label={`Delete ${o.name}`}>✕</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="no-drag">
        {!open ? <button onClick={() => setOpen(true)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">+ Schedule a payment</button> : (
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name (Rent, Netflix, Salary…)" className="h-8 sm:col-span-2" />
            <Input value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="Amount ₹" inputMode="decimal" className="h-8" />
            <select value={f.kind} onChange={(e) => set({ kind: e.target.value as 'expense' | 'income' })} className={sel}><option value="expense">Expense</option><option value="income">Income</option></select>
            <select value={f.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency })} className={sel}>{FREQUENCIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">Next due <Input type="date" value={f.next_due} onChange={(e) => set({ next_due: e.target.value })} className="h-8" /></label>
            <select value={f.category_id} onChange={(e) => set({ category_id: e.target.value })} className={sel}><option value="">Category (auto)</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select value={f.account_id} onChange={(e) => set({ account_id: e.target.value })} className={sel}><option value="">Default account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">Ends (optional) <ClearableInput type="date" value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} onClear={() => set({ end_date: '' })} clearLabel="Remove the end date" className="h-8 w-auto" /></label>
            <div className="flex gap-2 sm:col-span-2">
              <button disabled={pending} onClick={add} className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">Save</button>
              <button onClick={() => setOpen(false)} className="h-8 rounded-lg border px-3 text-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
