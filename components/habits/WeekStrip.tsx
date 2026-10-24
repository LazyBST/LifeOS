import { habitDueOn } from '@/lib/domain/habits';
import { addDays, istDate } from '@/lib/time';
import type { HabitStatus } from '@/lib/domain/habits';

/** Last 7 days: done = green tick, due-but-missed = red cross (a fresh one is due the next day),
 *  not due = dotted, today still open = outlined. */
export function Week({ s, met }: { s: HabitStatus; met: Map<string, number> }) {
  const today = istDate();
  return (
    <div className="mt-1 flex gap-1">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(today, i - 6);
        const due = habitDueOn(s, d);
        const done = (met.get(`${s.id}|${d}`) ?? 0) >= Number(s.target_value);
        const base = 'flex size-6 items-center justify-center rounded-md text-[11px] font-bold';
        if (!due) return <span key={d} title={`${d}: not due`} className={`${base} border border-dashed border-border text-muted-foreground/50`}>·</span>;
        if (done) return <span key={d} title={`${d}: done`} className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300`}>✓</span>;
        if (d === today) return <span key={d} title="Today" className={`${base} border border-input text-muted-foreground`}>•</span>;
        return <span key={d} title={`${d}: missed`} className={`${base} bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300`}>✕</span>;
      })}
    </div>
  );
}

