import { SetPageContext } from '@/components/chat/page-context';
import { CalendarWeek } from '@/components/dashboard/CalendarWeek';

/** Your calendar on a page of its own: week or day, with drag and drop. */
export default function CalendarPage() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-4.5rem)] max-w-[1600px] flex-col gap-3 p-3 sm:p-6 md:h-dvh">
      <SetPageContext ctx={{ route: '/calendar', entity_type: 'none' }} />
      <h1 className="text-xl font-semibold">Calendar</h1>
      <div className="min-h-0 flex-1"><CalendarWeek /></div>
    </div>
  );
}
