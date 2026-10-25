import { SetPageContext } from '@/components/chat/page-context';
import { TaskViews } from '@/components/tasks/TaskViews';

/** All tasks, full width: presets, board and list, search, filters and grouping. */
export default function TasksPage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <SetPageContext ctx={{ route: '/tasks', entity_type: 'none' }} />
      <h1 className="text-xl font-semibold">Tasks</h1>
      <TaskViews base={{}} scope="tasks-page" />
    </div>
  );
}
