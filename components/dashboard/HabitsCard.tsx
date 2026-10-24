import { checkinsBetween, habitStatuses } from '@/lib/domain/habits';
import { HabitCard } from '@/components/habits/HabitCard';
import { addDays, istDate } from '@/lib/time';
import { Week } from '@/components/habits/WeekStrip';
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
