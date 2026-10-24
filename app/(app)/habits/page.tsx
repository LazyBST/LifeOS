import { habitStatuses, checkinsBetween, listHabits } from '@/lib/domain/habits';
import { listAreas } from '@/lib/domain/areas';
import { addDays, istDate } from '@/lib/time';
import { SetPageContext } from '@/components/chat/page-context';
import { HabitBoard } from '@/components/habits/HabitBoard';
import { HabitHeatmap } from '@/components/habits/HabitHeatmap';

export default async function HabitsPage() {
  const today = istDate();
  const [statuses, areas, allHabits, checkins] = await Promise.all([
    habitStatuses(today),
    listAreas(),
    listHabits(),
    checkinsBetween(addDays(today, -89), today),
  ]);

  const checkinsByHabit = new Map<string, Record<string, number>>();
  for (const c of checkins) {
    const m = checkinsByHabit.get(c.habit_id) ?? {};
    m[c.checkin_date] = Number(c.value);
    checkinsByHabit.set(c.habit_id, m);
  }
  const streakByHabit = new Map(statuses.map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-6">
      <SetPageContext ctx={{ route: '/habits', entity_type: 'none' }} />

      <HabitBoard initialStatuses={statuses} areas={areas} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">90-day consistency</h2>
        {allHabits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No habits yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {allHabits.map((h) => (
              <HabitHeatmap
                key={h.id}
                habit={h}
                checkins={checkinsByHabit.get(h.id) ?? {}}
                today={today}
                currentStreak={streakByHabit.get(h.id)?.current_streak ?? 0}
                longestStreak={streakByHabit.get(h.id)?.longest_streak ?? 0}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
