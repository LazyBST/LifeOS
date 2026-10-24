import { admin } from '@/lib/supabase/admin';
import { istDate } from '@/lib/time';
import type { Habit, HabitCheckin, TimeOfDay } from '@/lib/types/db';

async function loadHabits(): Promise<{ habits: Habit[]; checkins: HabitCheckin[] } | null> {
  try {
    const today = istDate();
    const { data: habits, error } = await admin().from('habits').select('*').is('archived_at', null);
    if (error) return null;
    const { data: checkins } = await admin().from('habit_checkins').select('*').eq('checkin_date', today);
    return { habits: (habits ?? []) as Habit[], checkins: (checkins ?? []) as HabitCheckin[] };
  } catch {
    // habits are Part 2; render an empty state until the tables exist
    return null;
  }
}

const GROUPS: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'any', label: 'Any' },
];

/** Today's habits grouped Morning/Afternoon/Evening/Any (spec section 6). */
export async function HabitsCard() {
  const data = await loadHabits();
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold">Habits</h2>
      {!data || data.habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No habits yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {GROUPS.map((g) => {
            const items = data.habits.filter((h) => h.time_of_day === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key}>
                <div className="text-xs font-medium text-muted-foreground">{g.label}</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {items.map((h) => {
                    const done = data.checkins.some((c) => c.habit_id === h.id);
                    return (
                      <span
                        key={h.id}
                        className={`rounded-full px-2 py-1 text-xs ${
                          done ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {h.emoji ? `${h.emoji} ` : ''}
                        {h.name}
                      </span>
                    );
                  })}
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
