'use client';
import { Plus, X } from 'lucide-react';
import { LabelPicker } from './LabelChips';
import { formatINR } from '@/lib/format';
import { round2, splitProblem, splitRemainder } from '@/lib/domain/split-math';
import type { TxLabel } from '@/lib/types/db';

/** One part of a split, as typed (the amount is text until it is saved). */
export type DraftPart = { amount: string; description: string; category: string; labels: string[] };
export type Option = { value: string; label: string };

export const newPart = (amount = '', category = '', labels: string[] = [], description = ''): DraftPart => ({ amount, description, category, labels });

/** Two parts to start from: half and the rest. */
export function startingParts(total: number, category = '', labels: string[] = [], description = ''): DraftPart[] {
  const half = round2(total / 2);
  return [newPart(String(half), category, labels, description), newPart(String(round2(total - half)), category, labels)];
}

export const draftAmounts = (parts: DraftPart[]) => parts.map((p) => (p.amount.trim() === '' ? NaN : Number(p.amount)));
export const draftProblem = (total: number, parts: DraftPart[]) => splitProblem(total, draftAmounts(parts));

const field = 'h-8 min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm';

/** Edit the parts of a split: each has its own amount, description, category and labels, and the editor says what is
 *  left to assign. Any number of parts. */
export function SplitEditor({ total, parts, onChange, categories, labels, noCategoryLabel = '— none' }: { total: number; parts: DraftPart[]; onChange: (next: DraftPart[]) => void; categories: Option[]; labels: TxLabel[]; noCategoryLabel?: string }) {
  const left = splitRemainder(total, draftAmounts(parts));
  const set = (i: number, patch: Partial<DraftPart>) => onChange(parts.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const fill = (i: number) => set(i, { amount: String(round2(Number(parts[i].amount || 0) + left)) });
  return (
    <div className="space-y-2 text-sm">
      <ul className="space-y-2">
        {parts.map((p, i) => (
          <li key={i} className="space-y-1.5 rounded-xl border p-2">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-muted-foreground">Part {i + 1}</span>
              <span className="text-muted-foreground">₹</span>
              <input type="number" inputMode="decimal" step="0.01" min="0" value={p.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label={`Part ${i + 1} amount`} className={`${field} w-28`} />
              {left !== 0 && <button type="button" onClick={() => fill(i)} className="text-[11px] text-muted-foreground underline" title="Put what is left into this part">use the rest</button>}
              {parts.length > 2 && <button type="button" onClick={() => onChange(parts.filter((_, k) => k !== i))} aria-label={`Remove part ${i + 1}`} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><X className="size-3.5" /></button>}
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-14">
              <input value={p.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="What it was for (optional)" aria-label={`Part ${i + 1} description`} className={`${field} w-48 max-w-full`} />
              <select value={p.category} onChange={(e) => set(i, { category: e.target.value })} aria-label={`Part ${i + 1} category`} className={field}>
                <option value="">{noCategoryLabel}</option>
                {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <LabelPicker labels={labels} value={p.labels} onChange={(next) => set(i, { labels: next })} />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => onChange([...parts, newPart(left > 0 ? String(left) : '')])} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs hover:bg-muted"><Plus className="size-3.5" />Add a part</button>
        <span className={`text-xs tabular-nums ${left === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} role="status">
          {left === 0 ? `All ${formatINR(total)} assigned` : left > 0 ? `${formatINR(left)} left of ${formatINR(total)}` : `${formatINR(-left)} over ${formatINR(total)}`}
        </span>
      </div>
    </div>
  );
}
