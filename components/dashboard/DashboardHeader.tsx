import { formatDate, istDate } from '@/lib/time';
import { QuickAdd } from './QuickAdd';

/** Server component: static date text plus the interactive QuickAdd/chat bits. */
export function DashboardHeader() {
  const today = istDate();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{formatDate(today)}</p>
      </div>
      <QuickAdd />
    </div>
  );
}

export default DashboardHeader;
