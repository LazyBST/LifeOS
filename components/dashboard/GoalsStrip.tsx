import Link from 'next/link';
import { goalForecasts } from '@/lib/domain/analytics';
import { listAreas, areaColor } from '@/lib/domain/areas';
import { listGoals } from '@/lib/domain/goals';
import { formatDate } from '@/lib/time';

/** A card per active goal: emoji, Area colour, effort progress ring, forecast (spec section 6). */
export async function GoalsStrip() {
  const [activeGoals, forecasts, areas] = await Promise.all([
    listGoals({ status: ['active'] }),
    goalForecasts(),
    listAreas(),
  ]);
  const forecastMap = new Map(forecasts.map((f) => [f.goal_id, f]));
  const areaMap = new Map(areas.map((a) => [a.id, a]));

  if (activeGoals.length === 0) {
    return <p className="text-sm text-muted-foreground">No active goals yet.</p>;
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {activeGoals.map((goal) => {
        const f = forecastMap.get(goal.id);
        const area = goal.area_id ? (areaMap.get(goal.area_id) ?? null) : null;
        const color = areaColor(area);
        const pct = f?.progressPct ?? 0;
        return (
          <Link
            key={goal.id}
            href={`/goals/${goal.id}`}
            className="flex min-w-56 shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/40"
            style={{ borderLeftColor: color, borderLeftWidth: 3 }}
          >
            <div className="flex items-center gap-2">
              <ProgressRing pct={pct} color={color} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {goal.emoji ? `${goal.emoji} ` : ''}
                  {goal.title}
                </span>
                <span className="text-xs text-muted-foreground">{f ? `${f.remainingHours}h left` : '—'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{f?.projectedDate ? `ETA ${formatDate(f.projectedDate)}` : 'No forecast'}</span>
              {f && f.onTrack !== null && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                    f.onTrack
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/15 text-red-600 dark:text-red-400'
                  }`}
                >
                  {f.onTrack ? 'On track' : 'Behind'}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" className="text-muted-foreground/20" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text x="20" y="23" textAnchor="middle" fontSize="10" className="fill-current">
        {pct}%
      </text>
    </svg>
  );
}

export default GoalsStrip;
