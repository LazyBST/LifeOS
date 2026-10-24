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
import { CalendarWeek } from '@/components/dashboard/CalendarWeek';
import { WidgetCard } from '@/components/dashboard/WidgetCard';
import { TaskViews } from '@/components/tasks/TaskViews';
import { safe } from '@/components/dashboard/safe';

const Areas = safe('Life areas report', () => LifeAreasWidget());
const Goals = safe('Goals', () => GoalsWidget());
const Habits = safe('Habits', () => HabitsCard());
const Top3 = safe('Today’s top 3', () => PrioritiesWidget());
const Improve = safe('Last night’s improvement', () => ImprovementWidget());
const Money = safe('Money', () => MoneyWidget());
const Projects = safe('Projects', () => ProjectsWidget());
const Journal = safe('Journal', () => JournalCard());
const Slip = safe('Schedule', async () => (await SlipBanner()) ?? null);

const Loading = () => <div className="h-full w-full animate-pulse rounded-2xl bg-muted" />;
const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>;

export default async function DashboardPage() {
  const widgets: GridWidget[] = [
    { id: 'areas', node: <S><Areas /></S> },
    { id: 'goals', node: <S><Goals /></S> },
    { id: 'habits', node: <S><Habits /></S> },
    { id: 'top3', node: <S><Top3 /></S> },
    { id: 'improve', node: <S><Improve /></S> },
    { id: 'money', node: <S><Money /></S> },
    { id: 'projects', node: <S><Projects /></S> },
    { id: 'tasks', node: <WidgetCard title="Tasks" sub="Board · List — the same view on every page"><TaskViews base={{}} scope="dashboard" /></WidgetCard> },
    { id: 'life', node: <WidgetCard title="Life calendar" sub="One dot per day · green 70%+, yellow 50–70%, red under 50%"><LifeCalendar /></WidgetCard> },
    { id: 'calendar', node: <WidgetCard title="Calendar" sub="Your week · events, timed tasks, goals and projects" bodyClassName="flex flex-col"><CalendarWeek /></WidgetCard> },
    { id: 'journal', node: <S><Journal /></S> },
  ];
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <DashboardHeader />
      <S><Slip /></S>
      <DashboardGrid widgets={widgets} />
    </div>
  );
}
