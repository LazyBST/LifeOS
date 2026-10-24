import { weeklyUnitsByArea } from '@/lib/domain/trends';
import { WidgetCard } from './WidgetCard';
import { TrendChart } from './TrendChart';

export async function LifeAreasWidget() {
  const trend = await weeklyUnitsByArea(10, 3).catch(() => null);
  return (
    <WidgetCard title="Life areas report" sub="Units completed per week · a task counts as its subtasks, or 1 without any">
      {!trend ? <p className="text-sm text-muted-foreground">No data yet.</p> : (
        <>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {trend.series.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /><b className="font-medium">{s.name}</b><span className="text-muted-foreground">{s.total} units</span></span>
            ))}
          </div>
          <TrendChart weeks={trend.weeks} ahead={trend.ahead} series={trend.series} height={230} />
        </>
      )}
    </WidgetCard>
  );
}
