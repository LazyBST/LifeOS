import { Suspense } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { GoalsStrip } from '@/components/dashboard/GoalsStrip';
import { WalletCard } from '@/components/dashboard/WalletCard';
import { HabitsCard } from '@/components/dashboard/HabitsCard';
import { AgendaCard } from '@/components/dashboard/AgendaCard';
import { JournalCard } from '@/components/dashboard/JournalCard';
import { LifeCalendar } from '@/components/dashboard/LifeCalendar';
import { TaskViews } from '@/components/tasks/TaskViews';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <DashboardHeader />

      <Suspense fallback={<div className="h-28 w-full animate-pulse rounded-xl bg-muted" />}>
        <GoalsStrip />
      </Suspense>

      <LifeCalendar />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Suspense fallback={<div className="h-72 w-full animate-pulse rounded-xl bg-muted" />}>
            <TaskViews base={{}} scope="dashboard" />
          </Suspense>
        </div>

        <div className="flex flex-col gap-3">
          <Suspense fallback={<div className="h-28 w-full animate-pulse rounded-xl bg-muted" />}>
            <HabitsCard />
          </Suspense>
          <Suspense fallback={<div className="h-28 w-full animate-pulse rounded-xl bg-muted" />}>
            <AgendaCard />
          </Suspense>
          <Suspense fallback={<div className="h-28 w-full animate-pulse rounded-xl bg-muted" />}>
            <WalletCard />
          </Suspense>
          <Suspense fallback={<div className="h-28 w-full animate-pulse rounded-xl bg-muted" />}>
            <JournalCard />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
