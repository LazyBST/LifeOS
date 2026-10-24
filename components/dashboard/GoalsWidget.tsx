import Link from 'next/link';
import { goalForecasts } from '@/lib/domain/analytics';
import { listGoals } from '@/lib/domain/goals';
import { listAreas } from '@/lib/domain/areas';
import { areaColor } from '@/lib/domain/areas-colors';
import { ledgerForGoal } from '@/lib/domain/ledger';
import { projectedEnd } from '@/lib/domain/ledger-math';
import { formatDate } from '@/lib/time';
import { WidgetCard } from './WidgetCard';

export async function GoalsWidget() {
  const [goals, forecasts, areas] = await Promise.all([listGoals({ status: ['active'] }), goalForecasts(), listAreas()]);
  const fm = new Map(forecasts.map((f) => [f.goal_id, f]));
  const am = new Map(areas.map((a) => [a.id, a]));
  const ledgers = await Promise.all(goals.map((g) => ledgerForGoal(g.id)));
  return (
    <WidgetCard title="Goals" sub="Progress in units · agreed vs projected deadline">
      {goals.length === 0 ? <p className="text-sm text-muted-foreground">No active goals yet.</p> : (
        <div className="flex flex-col gap-4">
          {goals.map((g, i) => {
            const f = fm.get(g.id);
            const pct = f?.progressPct ?? 0;
            const color = areaColor(g.area_id ? am.get(g.area_id) : null);
            const net = ledgers[i].net;
            const agreed = g.original_target_date ?? g.target_date;
            const proj = projectedEnd(agreed, net);
            return (
              <Link key={g.id} href={`/goals/${g.id}`} className="group flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium group-hover:underline">{g.emoji ? `${g.emoji} ` : ''}{g.title}</span>
                  <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${net > 0 ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' : net < 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                    {net > 0 ? `+${net}d` : net < 0 ? `−${-net}d` : 'on time'}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: color }} /></div>
                <div className="flex gap-2 text-[12px] text-muted-foreground">
                  <span>{pct}% · {f ? `${f.remainingHours}h left` : '—'}</span>
                  {agreed && <span className="ml-auto">Agreed {formatDate(agreed).slice(0, -5)} → <b className={net > 0 ? 'text-red-600' : net < 0 ? 'text-emerald-600' : ''}>{proj ? formatDate(proj).slice(0, -5) : '—'}</b></span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
