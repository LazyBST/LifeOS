import Link from 'next/link';
import type { GoalForecast } from '@/lib/domain/analytics';
import { formatDate } from '@/lib/time';

/** Area id/name/colour already resolved server-side (areaColor() is
 *  server-only). */
export type AreaWithColor = { id: string; name: string; resolvedColor: string };

type Props = {
  forecasts: GoalForecast[];
  areas: AreaWithColor[];
};

/**
 * Progress bar per goal: effort done vs total, remaining hours, projected
 * date and target date markers, on-track badge and the unestimated-task
 * count so forecast quality is visible (spec section 10).
 */
export function GoalProgressChart({ forecasts, areas }: Props) {
  const areaMap = new Map(areas.map((a) => [a.id, a]));

  if (forecasts.length === 0) {
    return <p className="text-sm text-muted-foreground">No goals yet.</p>;
  }

  return (
    <div className="space-y-3">
      {forecasts.map((f) => {
        const area = f.area_id ? areaMap.get(f.area_id) : undefined;
        const color = area?.resolvedColor ?? '#94a3b8';
        // position of the target date marker, relative to today..projectedDate
        // (or just today when there's no forecast at all)
        return (
          <Link
            key={f.goal_id}
            href={`/goals/${f.goal_id}`}
            className="block rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/40"
            style={{ borderLeftColor: color, borderLeftWidth: 3 }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{f.title}</span>
              {f.onTrack !== null && (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                    f.onTrack
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/15 text-red-600 dark:text-red-400'
                  }`}
                >
                  {f.onTrack ? 'On track' : 'Behind'}
                </span>
              )}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, f.progressPct))}%`, background: color }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{f.progressPct}% done</span>
              <span>{f.remainingHours}h left</span>
              <span>
                ETA {f.projectedDate ? formatDate(f.projectedDate) : '—'}
                {f.rough ? ' (rough)' : ''}
              </span>
              {f.target_date && <span>Target {formatDate(f.target_date)}</span>}
              {f.unestimated > 0 && (
                <span className="text-amber-600 dark:text-amber-400">{f.unestimated} unestimated</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default GoalProgressChart;
