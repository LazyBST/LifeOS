import { listGoals } from '@/lib/domain/goals';
import { ledgerForGoal } from '@/lib/domain/ledger';
import { habitStatuses } from '@/lib/domain/habits';

/** The visible reward and loss: days each active goal has moved, in both directions. */
export async function SlipBanner() {
  const goals = await listGoals({ status: ['active'] }).catch(() => []);
  const ledgers = await Promise.all(goals.map((g) => ledgerForGoal(g.id)));
  const streak = await habitStatuses().then((h) => Math.max(0, ...h.map((x) => x.current_streak))).catch(() => 0);
  const moved = goals.map((g, i) => ({ g, net: ledgers[i].net })).filter((x) => x.net !== 0);
  if (moved.length === 0 && streak === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <span className="font-semibold">Schedule so far</span>
      {moved.map(({ g, net }) => (
        <span key={g.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${net > 0 ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'}`}>
          {g.emoji ? `${g.emoji} ` : ''}{g.title} {net > 0 ? `+${net} day${net === 1 ? '' : 's'} later` : `${-net} day${net === -1 ? '' : 's'} gained`}
        </span>
      ))}
      {streak > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">🔥 Best streak {streak}</span>}
    </div>
  );
}
