'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ClearableInput } from '@/components/ui/clearable-input';
import { TransactionTable, type TableTx } from './TransactionTable';
import { searchTransactionsAction } from '@/app/actions/money';
import type { TxFilters } from '@/lib/domain/money-filters';
import type { TxKind } from '@/lib/types/db';
import { addDays, istDate } from '@/lib/time';
import { formatINR } from '@/lib/format';

type Named = { id: string; name: string };
type Totals = { count: number; spent: number; income: number; owed: number };

const KINDS: { id: TxKind; label: string }[] = [{ id: 'expense', label: 'Expenses' }, { id: 'income', label: 'Income' }, { id: 'settlement', label: 'Settlements' }];
const SORTS: { id: NonNullable<TxFilters['sort']>; label: string }[] = [
  { id: 'date_desc', label: 'Newest first' }, { id: 'date_asc', label: 'Oldest first' }, { id: 'amount_desc', label: 'Largest first' }, { id: 'amount_asc', label: 'Smallest first' },
];
const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted'}`;
const toggle = <T,>(xs: T[] | undefined, x: T): T[] | undefined => { const cur = xs ?? []; const n = cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x]; return n.length ? n : undefined; };

/** Every transaction with filters: text, dates, kind, category, account, amount range, person, who owes whom. */
export function TransactionsExplorer({ categories, accounts }: { categories: Named[]; accounts: Named[] }) {
  const [f, setF] = useState<TxFilters>({ sort: 'date_desc' });
  const [rows, setRows] = useState<TableTx[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [owedWorks, setOwedWorks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (filters: TxFilters, p: number) => {
    const mine = ++seq.current;
    setLoading(true);
    const r = await searchTransactionsAction(filters, p);
    if (mine !== seq.current) return; // a newer search has taken over
    setLoading(false);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setOwedWorks(r.data.owedFilter);
    setTotal(r.data.total);
    setRows((prev) => (p === 0 ? r.data.rows : [...prev, ...r.data.rows]));
    if (p === 0) { setTotals(r.data.totals); setPeople(r.data.counterparties); }
  }, []);

  // search again shortly after the filters stop changing
  useEffect(() => {
    setPage(0);
    const id = setTimeout(() => void load(f, 0), 300);
    return () => clearTimeout(id);
  }, [f, load]);

  const set = (p: Partial<TxFilters>) => setF((cur) => ({ ...cur, ...p }));
  const today = istDate();
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStart = (() => { const [y, m] = today.split('-').map(Number); const i = y * 12 + m - 2; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`; })();
  const ranges: { label: string; from?: string; to?: string }[] = [
    { label: 'This month', from: monthStart, to: today },
    { label: 'Last month', from: lastMonthStart, to: addDays(monthStart, -1) },
    { label: 'Last 3 months', from: addDays(today, -90), to: today },
    { label: 'This year', from: `${today.slice(0, 4)}-01-01`, to: today },
    { label: 'All time' },
  ];
  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s));
  const active = !!(f.q || f.kinds || f.categoryIds || f.accountIds || f.from || f.to || f.minAmount !== undefined || f.maxAmount !== undefined || f.counterparty || f.owed);
  const sel = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm';

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ClearableInput value={f.q ?? ''} onChange={(e) => set({ q: e.target.value || undefined })} onClear={() => set({ q: undefined })} clearLabel="Clear the search" placeholder="Search description, note or person…" aria-label="Search transactions" className="h-8 w-72 max-w-full" />
          <select value={f.sort ?? 'date_desc'} onChange={(e) => set({ sort: e.target.value as TxFilters['sort'] })} className={sel} aria-label="Sort by">{SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          {active && <button type="button" onClick={() => setF({ sort: f.sort })} className="ml-auto text-xs text-muted-foreground underline">Clear all filters</button>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Dates</span>
          {ranges.map((r) => <button key={r.label} type="button" onClick={() => set({ from: r.from, to: r.to })} className={chip(f.from === r.from && f.to === r.to)}>{r.label}</button>)}
          <ClearableInput type="date" value={f.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} onClear={() => set({ from: undefined })} clearLabel="Remove the start date" aria-label="From" className="h-8 w-auto" />
          <span className="text-xs text-muted-foreground">to</span>
          <ClearableInput type="date" value={f.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} onClear={() => set({ to: undefined })} clearLabel="Remove the end date" aria-label="To" className="h-8 w-auto" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Type</span>
          {KINDS.map((k) => <button key={k.id} type="button" onClick={() => set({ kinds: toggle(f.kinds, k.id) })} className={chip(!!f.kinds?.includes(k.id))}>{k.label}</button>)}
          <span className="ml-3 text-xs font-medium text-muted-foreground">Amount</span>
          <ClearableInput type="number" inputMode="decimal" placeholder="min ₹" value={f.minAmount ?? ''} onChange={(e) => set({ minAmount: num(e.target.value) })} onClear={() => set({ minAmount: undefined })} aria-label="Minimum amount" className="h-8 w-28" />
          <ClearableInput type="number" inputMode="decimal" placeholder="max ₹" value={f.maxAmount ?? ''} onChange={(e) => set({ maxAmount: num(e.target.value) })} onClear={() => set({ maxAmount: undefined })} aria-label="Maximum amount" className="h-8 w-28" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Category</span>
          {categories.map((c) => <button key={c.id} type="button" onClick={() => set({ categoryIds: toggle(f.categoryIds, c.id) })} className={chip(!!f.categoryIds?.includes(c.id))}>{c.name}</button>)}
          <button type="button" onClick={() => set({ categoryIds: toggle(f.categoryIds, 'none') })} className={chip(!!f.categoryIds?.includes('none'))}>No category</button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Account</span>
          {accounts.map((a) => <button key={a.id} type="button" onClick={() => set({ accountIds: toggle(f.accountIds, a.id) })} className={chip(!!f.accountIds?.includes(a.id))}>{a.name}</button>)}
          <span className="ml-3 text-xs font-medium text-muted-foreground">Owed</span>
          <button type="button" onClick={() => set({ owed: f.owed === 'to_me' ? undefined : 'to_me' })} disabled={!owedWorks} className={chip(f.owed === 'to_me')}>Owed to me</button>
          <button type="button" onClick={() => set({ owed: f.owed === 'i_owe' ? undefined : 'i_owe' })} disabled={!owedWorks} className={chip(f.owed === 'i_owe')}>I owe</button>
          <select value={f.counterparty ?? ''} onChange={(e) => set({ counterparty: e.target.value || undefined })} className={sel} aria-label="Person"><option value="">Anyone</option>{people.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        </div>
        {!owedWorks && <p className="text-xs text-amber-600">Run migration 0021_transactions_owed_view.sql in Supabase to filter by who owes whom.</p>}
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Matches', String(totals.count)], ['Spent (my share)', formatINR(totals.spent)], ['Income', formatINR(totals.income)], ['Owed overall', formatINR(totals.owed)]].map(([l, v]) => (
            <div key={l} className="rounded-xl border bg-card px-3 py-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</div><div className="text-lg font-bold">{v}</div></div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4">
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        <TransactionTable transactions={rows} categories={categories} accounts={accounts} emptyText={loading ? 'Loading…' : 'No transactions match these filters.'} />
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {rows.length} of {total}</span>
          {rows.length < total && <button type="button" disabled={loading} onClick={() => { const n = page + 1; setPage(n); void load(f, n); }} className="rounded-lg border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50">Load more</button>}
        </div>
      </div>
    </div>
  );
}
