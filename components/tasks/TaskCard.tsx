'use client';
import Link from 'next/link';
import { dueLabel, isOverdue } from '@/lib/time';
import type { TaskListItem } from '@/app/actions/tasks';

export function TaskCard({ task }: { task: TaskListItem }) {
  const due = dueLabel(task.due_date);
  const overdue = isOverdue(task.due_date) && task.status !== 'done';
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="flex min-h-11 flex-col gap-1 rounded-md border border-border bg-card p-2 pl-3 text-sm shadow-sm transition-colors hover:bg-muted/50"
      style={{ borderLeftColor: task.area_color, borderLeftWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`line-clamp-2 font-medium ${task.status === 'done' ? 'text-muted-foreground line-through' : ''}`}
        >
          {task.title}
        </span>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border">
          {task.priority}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {due && (
          <span className={overdue ? 'font-medium text-red-600 dark:text-red-400' : undefined}>{due}</span>
        )}
        {task.estimate_min != null && <span>{task.estimate_min}m</span>}
        {task.subtask_total > 0 && (
          <span>
            {task.subtask_done}/{task.subtask_total} subtasks
          </span>
        )}
      </div>
    </Link>
  );
}

export default TaskCard;
