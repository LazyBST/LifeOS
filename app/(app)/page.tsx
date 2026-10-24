import { Suspense, type ReactNode } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardGrid, type GridWidget } from '@/components/dashboard/DashboardGrid';
import { SlipBanner } from '@/components/dashboard/SlipBanner';
import { LifeAreasWidget } from '@/components/dashboard/LifeAreasWidget';
import { GoalsWidget } from '@/components/dashboard/GoalsWidget';
import { ProjectsWidget } from '@/components/dashboard/ProjectsWidget';
import { MoneyWidget } from '@/components/dashboard/MoneyWidget';
import { HabitsCard } from '@/components/dashboard/HabitsCard';
import { PrioritiesWidget, ImprovementWidget } from '@/components/dashboard/PrioritiesWidget';
import { JournalCard } from '@/components/dashboard/JournalCard';
import { LifeCalendar } from '@/components/dashboard/LifeCalendar';
import { CalendarEmbed } from '@/components/dashboard/CalendarEmbed';
import { WidgetCard } from '@/components/dashboard/WidgetCard';
import { TaskViews } from '@/components/tasks/TaskViews';
import { getConfig } from '@/lib/domain/config';

const Loading = () => <div className="h-full w-full animate-pulse rounded-2xl bg-muted" />;
const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>;

export default async function DashboardPage() {
  const cfg = await getConfig().catch(() => null);
  const widgets: GridWidget[] = [
    { id: 'areas', node: <S><LifeAreasWidget /></S> },
    { id: 'goals', node: <S><GoalsWidget /></S> },
    { id: 'habits', node: <S><HabitsCard /></S> },
    { id: 'top3', node: <S><PrioritiesWidget /></S> },
    { id: 'improve', node: <S><ImprovementWidget /></S> },
    { id: 'money', node: <S><MoneyWidget /></S> },
    { id: 'projects', node: <S><ProjectsWidget /></S> },
    { id: 'tasks', node: <WidgetCard title="Tasks" sub="Board · List — the same view on every page"><TaskViews base={{}} scope="dashboard" /></WidgetCard> },
    { id: 'life', node: <WidgetCard title="Life calendar" sub="One dot per day · green 70%+, yellow 50–70%, red under 50%"><LifeCalendar /></WidgetCard> },
    { id: 'calendar', node: <WidgetCard title="Google Calendar" sub="Embedded view of your calendar" bodyClassName="flex flex-col"><CalendarEmbed url={cfg?.calendar_embed_url ?? null} /></WidgetCard> },
    { id: 'journal', node: <S><JournalCard /></S> },
  ];
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <DashboardHeader />
      <S><SlipBanner /></S>
      <DashboardGrid widgets={widgets} />
    </div>
  );
}
