'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RANGE_PRESETS, rangeQuery, type MoneyRange } from '@/lib/domain/money-range';

/** Pick the period the Money page looks at: a quick preset or any two dates. */
export function RangePicker({ range }: { range: Pick<MoneyRange, 'key' | 'from' | 'to' | 'label' | 'prevLabel'> }) {
  const router = useRouter();
  const [custom, setCustom] = useState(range.key === 'custom');
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const go = (q: string) => router.push(`/money${q}`);
  const chip = (on: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${on ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 gap-0.5 overflow-x-auto rounded-full bg-muted p-0.5 [scrollbar-width:none]" role="tablist" aria-label="Period">
          {RANGE_PRESETS.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={range.key === p.id} onClick={() => { setCustom(false); go(`?range=${p.id}`); }} className={chip(range.key === p.id && !custom)}>{p.label}</button>
          ))}
          <button type="button" role="tab" aria-selected={custom} onClick={() => setCustom(true)} className={chip(custom || range.key === 'custom')}>Custom</button>
        </div>
      </div>
      {custom && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-input bg-transparent px-2" aria-label="From" />
          <span className="text-muted-foreground">to</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-input bg-transparent px-2" aria-label="To" />
          <button type="button" disabled={!from || !to} onClick={() => go(rangeQuery({ key: 'custom', from, to }))} className="h-9 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">Apply</button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Showing <b className="text-foreground">{range.label}</b>, compared with {range.prevLabel}.</p>
    </div>
  );
}
