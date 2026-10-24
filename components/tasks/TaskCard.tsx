'use client';
import Link from 'next/link';
import { CheckSquare, ListTree } from 'lucide-react';
import { dueLabel, isOverdue } from '@/lib/time';
import { isDone, statusFor } from '@/lib/types/statuses';
import { useStatuses } from '@/components/status/StatusProvider';
import type { TaskListItem } from '@/app/actions/tasks';
import { PriorityIcon } from './PriorityIcon';

export const ISSUE_PREFIX = 'LIFE';

function fmtEstimate(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Jira-style issue card: title, project lozenge tinted by Area, key, due and estimate pills, priority. */
export function TaskCard({ task, dragging = false }: { task: TaskListItem; dragging?: boolean }) {
  const statuses = useStatuses();
  const st = statusFor(statuses, task.status);
  const done = isDone(statuses, task.status);
  const due = dueLabel(task.due_date);
  const overdue = isOverdue(task.due_date) && !done;
  const label = task.project_title ?? task.goal_title;
  return (
    <Link
      href={`/tasks/${task.id}`}
      draggable={false}
      className={`group flex flex-col gap-2 rounded-[4px] bg-card px-3 py-2.5 text-sm text-card-foreground
        shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)] transition-colors
        hover:bg-[#f4f5f7] dark:hover:bg-muted ${dragging ? 'rotate-2 shadow-lg' : ''}`}
    >
      <span
        className={`line-clamp-3 break-words leading-5 ${st.dim ? 'text-muted-foreground' : ''} ${st.strike_through ? 'line-through' : ''}`}
      >
        {task.title}
      </span>

      {(label || task.tags.length > 0) && (
        <span className="flex flex-wrap gap-1">
          {label && (
            <span
              className="max-w-full truncate rounded-[3px] px-1.5 py-px text-[12px] font-semibold"
              style={{ backgroundColor: `${task.area_color}29`, color: task.area_color }}
            >
              {label}
            </span>
          )}
          {task.tags.map((t) => (
            <span key={t} className="rounded-[3px] bg-muted px-1.5 py-px text-[12px] font-medium text-muted-foreground">
              {t}
            </span>
          ))}
        </span>
      )}

      <span className="flex items-center gap-2 text-xs">
        <CheckSquare className="size-3.5 shrink-0 text-[#4bade8]" fill="#4bade8" stroke="#fff" aria-hidden />
        <span className="font-medium text-muted-foreground">
          {ISSUE_PREFIX}-{task.task_no}
        </span>
        {task.subtask_total > 0 && (
          <span className="inline-flex items-center gap-0.5 text-muted-foreground" title="Subtasks done">
            <ListTree className="size-3" aria-hidden />
            {task.subtask_done}/{task.subtask_total}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {due && (
            <span
              className={`rounded-full px-1.5 py-px text-[12px] font-semibold ${
                overdue ? 'bg-[#ffebe6] text-[#bf2600] dark:bg-red-500/20 dark:text-red-400' : 'bg-[#dfe1e6] text-[#42526e] dark:bg-muted dark:text-muted-foreground'
              }`}
            >
              {due}
            </span>
          )}
          {task.estimate_min != null && (
            <span className="rounded-full bg-[#dfe1e6] px-1.5 py-px text-[12px] font-semibold text-[#42526e] dark:bg-muted dark:text-muted-foreground">
              {fmtEstimate(task.estimate_min)}
            </span>
          )}
          <PriorityIcon priority={task.priority} />
        </span>
      </span>
    </Link>
  );
}

export default TaskCard;
