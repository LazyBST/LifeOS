import { habitStatuses } from '@/lib/domain/habits';
import { HabitCard } from '@/components/habits/HabitCard';
import type { HabitStatus } from '@/lib/domain/habits';
import type { TimeOfDay } from '@/lib/types/db';

const GROUPS: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'any', label: 'Any' },
];

async function loadDueToday(): Promise<HabitStatus[] | null> {
  try {
    const statuses = await habitStatuses();
    return statuses.filter((s) => s.due);
  } catch {
    // habits table may not exist yet; render an empty state
    return null;
  }
}

/** Today's habits grouped Morning/Afternoon/Evening/Any, tap to check in
 *  (spec section 6). Only habits due today are shown. */
export async function HabitsCard() {
  const statuses = await loadDueToday();
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold">Habits</h2>
      {!statuses || statuses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No habits due today.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {GROUPS.map((g) => {
            const items = statuses.filter((s) => s.time_of_day === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key} className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">{g.label}</div>
                <div className="flex flex-col gap-1.5">
                  {items.map((h) => (
                    <HabitCard key={h.id} status={h} compact />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default HabitsCard;
