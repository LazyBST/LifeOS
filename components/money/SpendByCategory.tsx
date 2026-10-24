import { formatINR } from '@/lib/format';

type SpendByCategoryProps = {
  rows: { category: string; amount: number }[];
  monthLabel: string;
};

/** Plain CSS bar list of this month's spend by category (built from
 *  my_share, never the cash paid — spec section 5). The chart library lives
 *  on /analytics, not here. */
export function SpendByCategory({ rows, monthLabel }: SpendByCategoryProps) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">Spending by category — {monthLabel}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No spending recorded this month.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.category} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 truncate text-muted-foreground">{r.category}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(2, (r.amount / max) * 100)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right font-medium">{formatINR(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SpendByCategory;
