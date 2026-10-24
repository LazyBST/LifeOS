import { describeNet, type Ledger } from '@/lib/domain/ledger-math';
import { formatDate } from '@/lib/time';

const chip = (d: number) =>
  d > 0 ? { t: `+${d}d late`, c: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' }
  : d < 0 ? { t: `−${-d}d early`, c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' }
  : { t: 'on time', c: 'bg-muted text-muted-foreground' };

/** Two-way ledger: late work adds days to its parent, early work subtracts them. */
export function ScheduleLedger({ ledger, parentName, limit = 8 }: { ledger: Ledger; parentName: string; limit?: number }) {
  if (ledger.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Give tasks a deadline and every day gained or lost shows up here.</p>;
  }
  const net = chip(ledger.net);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_5rem_5rem_6rem] gap-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Item</span><span>Agreed</span><span>Actual</span><span>Effect</span>
      </div>
      {ledger.rows.slice(0, limit).map((r) => {
        const c = chip(r.delta);
        return (
          <div key={r.id} className={`grid grid-cols-[1fr_5rem_5rem_6rem] items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${r.delta > 0 ? 'bg-red-50 dark:bg-red-500/10' : r.delta < 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-muted/50'}`}>
            <span className="flex min-w-0 items-center gap-1.5"><span className={r.done ? 'text-emerald-600' : 'text-muted-foreground'}>{r.done ? '✓' : '○'}</span><span className="truncate">{r.title}</span></span>
            <span className="text-xs text-muted-foreground">{formatDate(r.agreed).slice(0, -5)}</span>
            <span className="text-xs font-medium">{formatDate(r.actual).slice(0, -5)}<span className="ml-1 text-[10px] font-normal text-muted-foreground">{r.done ? 'done' : 'est'}</span></span>
            <span><span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${c.c}`}>{c.t}</span></span>
          </div>
        );
      })}
      {ledger.rows.length > limit && <p className="px-2 text-xs text-muted-foreground">+{ledger.rows.length - limit} more</p>}
      <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${ledger.net > 0 ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200' : ledger.net < 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-muted'}`}>
        <span className="text-[11px] font-bold">NET</span>
        <span>{describeNet(ledger.net, parentName)}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${net.c}`}>+{ledger.lateDays} late · −{ledger.earlyDays} early</span>
      </div>
      <p className="text-[11px] text-muted-foreground">Net = Σ (actual or forecast end − first agreed end). Finishing one task 3 days early offsets another that ran 2 days late.</p>
    </div>
  );
}
