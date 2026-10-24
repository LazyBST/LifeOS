import { checkinsBetween, habitDueOn, habitStatuses } from '@/lib/domain/habits';
import { HabitCard } from '@/components/habits/HabitCard';
import { addDays, istDate } from '@/lib/time';
import type { HabitStatus } from '@/lib/domain/habits';
import type { TimeOfDay } from '@/lib/types/db';
import { WidgetCard } from './WidgetCard';

const GROUPS: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'any', label: 'Any' },
];

async function load(): Promise<{ statuses: HabitStatus[]; met: Map<string, number> } | null> {
  try {
    const today = istDate();
    const [statuses, checkins] = await Promise.all([habitStatuses(), checkinsBetween(addDays(today, -6), today)]);
    return { statuses, met: new Map(checkins.map((c) => [`${c.habit_id}|${c.checkin_date}`, Number(c.value)])) };
  } catch {
    return null;
  }
}

/** Last 7 days: done = green tick, due-but-missed = red cross (a fresh one is due the next day),
 *  not due = dotted, today still open = outlined. */
function Week({ s, met }: { s: HabitStatus; met: Map<string, number> }) {
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

/** Today's habits grouped Morning/Afternoon/Evening/Any, tap to check in, with the last week under each. */
export async function HabitsCard() {
  const data = await load();
  const due = data?.statuses.filter((s) => s.due) ?? [];
  return (
    <WidgetCard title="Habits" sub="Tap to check in · missed days are crossed out and due again next day">
      {!data || due.length === 0 ? (
        <p className="text-sm text-muted-foreground">No habits due today.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {GROUPS.map((g) => {
            const items = due.filter((s) => s.time_of_day === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key} className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">{g.label}</div>
                <div className="flex flex-col gap-2">
                  {items.map((h) => (
                    <div key={h.id}>
                      <HabitCard status={h} compact />
                      <Week s={h} met={data.met} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

export default HabitsCard;
