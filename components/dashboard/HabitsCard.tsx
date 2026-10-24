import { loadHabitRows } from '@/lib/domain/habit-rows';
import { HabitRow } from '@/components/habits/HabitRow';
import type { TimeOfDay } from '@/lib/types/db';
import { WidgetCard } from './WidgetCard';

const GROUPS: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'any', label: 'Any time' },
];

/** Today's habits as compact rows grouped by time of day. Tap the circle to check in, a square to fix a day. */
export async function HabitsCard() {
  const data = await loadHabitRows().catch(() => null);
  const due = data?.statuses.filter((s) => s.due) ?? [];
  const done = due.filter((s) => s.done).length;
  return (
    <WidgetCard title="Habits" sub={due.length ? `${done} of ${due.length} done today · tap a square to correct a day` : 'Nothing due today'}>
      {!data || due.length === 0 ? (
        <p className="text-sm text-muted-foreground">No habits due today.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {GROUPS.map((g) => {
            const items = due.filter((s) => s.time_of_day === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key} className="space-y-1">
                <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</div>
                {items.map((s) => <HabitRow key={s.id} h={data.rows.get(s.id)!} />)}
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

export default HabitsCard;
