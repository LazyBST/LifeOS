import { checkinsBetween, habitStatuses } from '@/lib/domain/habits';
import { HabitCard } from './HabitCard';
import { Week } from './WeekStrip';
import { AddLinkedHabit } from './AddLinkedHabit';
import { addDays, istDate } from '@/lib/time';

/** Habits attached to a goal or a task (sub-habits), with the last week under each. */
export async function LinkedHabits({ goalId, taskId, areaId, title }: { goalId?: string; taskId?: string; areaId?: string | null; title: string }) {
  const today = istDate();
  const [all, checkins] = await Promise.all([habitStatuses().catch(() => []), checkinsBetween(addDays(today, -6), today).catch(() => [])]);
  const mine = all.filter((h) => (goalId ? h.goal_id === goalId : taskId ? h.task_id === taskId : false));
  const met = new Map(checkins.map((c) => [`${c.habit_id}|${c.checkin_date}`, Number(c.value)]));
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {mine.length === 0 && <p className="text-xs text-muted-foreground">None yet. Habits you attach here count toward progress and the life calendar.</p>}
      <div className="flex flex-col gap-3">
        {mine.map((h) => (
          <div key={h.id}><HabitCard status={h} compact /><Week s={h} met={met} /></div>
        ))}
      </div>
      <AddLinkedHabit goalId={goalId} taskId={taskId} areaId={areaId} />
    </section>
  );
}
