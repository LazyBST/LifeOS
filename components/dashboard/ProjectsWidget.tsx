import Link from 'next/link';
import { projectForecasts } from '@/lib/domain/analytics';
import { listProjects } from '@/lib/domain/projects';
import { ledgerForProject } from '@/lib/domain/ledger';
import { getOrder } from '@/lib/domain/order';
import { Reorderable } from '@/components/widgets/Reorderable';
import { WidgetCard } from './WidgetCard';

export async function ProjectsWidget() {
  const [projects, forecasts] = await Promise.all([listProjects({ status: ['active'] }), projectForecasts()]);
  const fm = new Map(forecasts.map((f) => [f.project_id, f]));
  const [ledgers, order] = await Promise.all([Promise.all(projects.map((p) => ledgerForProject(p.id))), getOrder('dash-projects')]);
  return (
    <WidgetCard title="Projects" sub="Progress in units · days gained or lost">
      {projects.length === 0 ? <p className="text-sm text-muted-foreground">No active projects.</p> : (
        <Reorderable orderKey="dash-projects" order={order} className="flex flex-col gap-3" items={
          projects.map((p, i) => {
            const f = fm.get(p.id);
            const pct = f?.progressPct ?? 0;
            const net = ledgers[i].net;
            return { id: p.id, node: (
              <Link href={`/projects/${p.id}`} className="group flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate font-medium group-hover:underline">{p.emoji ? `${p.emoji} ` : ''}{p.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{pct}%</span>
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${net > 0 ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' : net < 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{net > 0 ? `+${net}d` : net < 0 ? `−${-net}d` : 'on time'}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, pct)}%` }} /></div>
              </Link>
            ) };
          })} />
      )}
    </WidgetCard>
  );
}
