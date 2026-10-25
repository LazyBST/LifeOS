import { habitStatuses, checkinsBetween, listHabits, listArchivedHabits } from '@/lib/domain/habits';
import { ArchivedHabits } from '@/components/habits/ArchivedHabits';
import { scheduleLabel } from '@/lib/domain/habit-rows';
import { loadHabitRows } from '@/lib/domain/habit-rows';
import { listAreas } from '@/lib/domain/areas';
import { addDays, istDate } from '@/lib/time';
import { SetPageContext } from '@/components/chat/page-context';
import { HabitBoard } from '@/components/habits/HabitBoard';
import { HabitHeatmap } from '@/components/habits/HabitHeatmap';
import { WidgetGrid, type GridItem } from '@/components/widgets/WidgetGrid';
import { WidgetCard } from '@/components/dashboard/WidgetCard';
import { StatTiles } from '@/components/analytics/Insights';
import { getOrder } from '@/lib/domain/order';
import { getUiState } from '@/lib/domain/uistate';
import type { ResponsiveLayouts } from 'react-grid-layout';


export default async function HabitsPage() {
  const today = istDate();
  const [statuses, areas, allHabits, checkins, savedLayout, { rows }] = await Promise.all([
    habitStatuses(today),
    listAreas(),
    listHabits(),
    checkinsBetween(addDays(today, -89), today),
    getUiState<ResponsiveLayouts>('habits-layout').catch(() => null),
    loadHabitRows(),
  ]);
  const archived = await listArchivedHabits().catch(() => []);
  const orders = Object.fromEntries(await Promise.all((['morning', 'afternoon', 'evening', 'any'] as const).map(async (g) => [g, await getOrder(`habits-${g}`)])));

  const checkinsByHabit = new Map<string, Record<string, number>>();
  for (const c of checkins) {
    const m = checkinsByHabit.get(c.habit_id) ?? {};
    m[c.checkin_date] = Number(c.value);
    checkinsByHabit.set(c.habit_id, m);
  }
  const streakByHabit = new Map(statuses.map((s) => [s.id, s]));

  const dueToday = statuses.filter((x) => x.due);
  const doneToday = dueToday.filter((x) => x.done).length;
  const items: GridItem[] = [
    { id: 'overview', w: 4, h: 7, minW: 3, minH: 5, node: (
      <WidgetCard title="Today" sub="Habits due and done">
        <StatTiles items={[
          { label: 'Done', value: `${doneToday}/${dueToday.length}`, tone: dueToday.length && doneToday === dueToday.length ? 'good' : undefined },
          { label: 'Missed', value: String(dueToday.filter((x) => x.missed).length), tone: dueToday.some((x) => x.missed) ? 'bad' : undefined },
          { label: 'Best streak', value: `🔥 ${Math.max(0, ...statuses.map((x) => x.current_streak))}` },
          { label: 'Habits', value: String(allHabits.length) },
        ]} />
      </WidgetCard>) },
    { id: 'board', w: 8, h: 14, minW: 5, minH: 8, node: <WidgetCard title="Habits" sub="Check in, edit, archive"><HabitBoard initialStatuses={statuses} areas={areas} rows={Object.fromEntries(rows)} orders={orders} /></WidgetCard> },
    { id: 'archived', w: 8, h: 8, minW: 4, minH: 5, node: (
      <WidgetCard title="Archived habits" sub={`${archived.length} paused · hidden from every widget and analytic until restored`}>
        <ArchivedHabits items={archived.map((h) => ({ id: h.id, name: h.name, emoji: h.emoji, schedule: scheduleLabel(h.days_of_week), time: h.start_time ? `${h.start_time.slice(0, 5)}${h.end_time ? `–${h.end_time.slice(0, 5)}` : ''}` : null, archivedOn: (h.archived_at ?? '').slice(0, 10) }))} />
      </WidgetCard>) },
    ...allHabits.map((h): GridItem => ({
      id: `hm-${h.id}`, w: 4, h: 6, minW: 3, minH: 5,
      node: (
        <WidgetCard title={`${h.emoji ? `${h.emoji} ` : ''}${h.name}`} sub={`🔥 ${streakByHabit.get(h.id)?.current_streak ?? 0} · best ${streakByHabit.get(h.id)?.longest_streak ?? 0} · click a day to change it`}>
          <HabitHeatmap bare habit={h} checkins={checkinsByHabit.get(h.id) ?? {}} today={today} currentStreak={streakByHabit.get(h.id)?.current_streak ?? 0} longestStreak={streakByHabit.get(h.id)?.longest_streak ?? 0} />
        </WidgetCard>),
    })),
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <SetPageContext ctx={{ route: '/habits', entity_type: 'none' }} />
      <header>
        <h1 className="text-xl font-semibold">Habits</h1>
        <p className="text-sm text-muted-foreground">Drag a card by its title and resize from the corner. Click a square in a heatmap to correct that day.</p>
      </header>
      <WidgetGrid items={items} layoutKey="habits-layout" initial={savedLayout} />
    </div>
  );
}
