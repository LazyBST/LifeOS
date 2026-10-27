import { formatINR } from '@/lib/format';
import type { TxLabel } from '@/lib/types/db';

/** This period's spending split by label: one bar per label with its share of the total. */
export function LabelSplit({ rows, labels }: { rows: { label: string; amount: number; count: number }[]; labels: TxLabel[] }) {
  if (labels.length === 0) return <p className="text-sm text-muted-foreground">Add labels like Necessity and Luxury under “Categories &amp; labels”, then tag your transactions.</p>;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total <= 0) return <p className="text-sm text-muted-foreground">No spending recorded in this period.</p>;
  const color = (n: string) => labels.find((l) => l.name === n)?.color ?? '#94a3b8';
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="Spending by label">
        {rows.map((r) => <div key={r.label} style={{ width: `${(r.amount / total) * 100}%`, background: color(r.label) }} title={`${r.label}: ${formatINR(r.amount)}`} />)}
      </div>
      <ul className="space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: color(r.label) }} />
            <span className="flex-1 truncate">{r.label}</span>
            <span className="text-xs text-muted-foreground">{r.count} · {Math.round((r.amount / total) * 100)}%</span>
            <span className="w-24 text-right font-medium">{formatINR(r.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">A transaction with two labels counts under both.</p>
    </div>
  );
}
