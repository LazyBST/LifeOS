'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CheckSquare, ListTree, Trash2 } from 'lucide-react';
import { isOverdue } from '@/lib/time';
import { isDone, statusFor } from '@/lib/types/statuses';
import { useStatuses } from '@/components/status/StatusProvider';
import type { TaskListItem } from '@/app/actions/tasks';
import { PriorityIcon } from './PriorityIcon';
import { AreaChip, DueChip, PriorityChip, ProjectChip, dueText, type QuickUpdate } from './QuickEdit';
import { SubtaskPanel } from './SubtaskPanel';

export const ISSUE_PREFIX = 'LIFE';

function fmtEstimate(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const ghost = 'opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100';

/**
 * Jira-style issue card. The title opens the task; everything else on it edits in place: tap the priority, area,
 * date or time to change them, or the subtask count to open the subtasks right here and add another.
 * The rarely used chips stay hidden until you hover the card, so it stays light.
 */
export function TaskCard({ task, dragging = false, onDelete, onUpdate, onSubtasksChanged }: { task: TaskListItem; dragging?: boolean; onDelete?: (id: string) => void; onUpdate?: QuickUpdate; onSubtasksChanged?: () => void }) {
  const statuses = useStatuses();
  const st = statusFor(statuses, task.status);
  const done = isDone(statuses, task.status);
  const overdue = isOverdue(task.due_date) && !done;
  const label = task.project_title ?? task.goal_title;
  const [open, setOpen] = useState(false);
  const canEdit = !!onUpdate && !dragging;
  const hasDue = !!task.due_date;
  return (
    <div className="group/card relative isolate">
    {onDelete && (
      <button
        type="button"
        aria-label={`Delete ${task.title}`}
        title="Delete task"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(task.id); }}
        className="absolute top-1.5 right-1.5 z-10 flex size-6 items-center justify-center rounded-md bg-card/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100 dark:hover:bg-red-500/20"
      >
        <Trash2 className="size-3.5" />
      </button>
    )}
    <div
      className={`flex flex-col gap-2 rounded-[4px] bg-card px-3 py-2.5 text-sm text-card-foreground
        shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)] transition-colors
        hover:bg-[#f4f5f7] dark:hover:bg-muted ${dragging ? 'rotate-2 shadow-lg' : ''}`}
    >
      <Link href={`/tasks/${task.id}`} draggable={false} className="flex flex-col gap-0.5 pr-5">
        {task.parent_title && <span className="truncate text-[11px] text-muted-foreground">↳ {task.parent_title}</span>}
        <span className={`line-clamp-3 break-words leading-5 ${st.dim ? 'text-muted-foreground' : ''} ${st.strike_through ? 'line-through' : ''}`}>
          {task.title}
        </span>
      </Link>

      <span className="flex flex-wrap items-center gap-1">
        {canEdit ? (
          <span className={task.area_name ? '' : ghost}><AreaChip task={task} onUpdate={onUpdate} /></span>
        ) : task.area_name ? (
          <span className="max-w-full truncate rounded-full px-1.5 py-px text-[12px] font-semibold" style={{ backgroundColor: `${task.area_color}29`, color: task.area_color }}>{task.area_name}</span>
        ) : null}
        {canEdit && task.parent_task_id == null ? (
          <span className={label ? '' : ghost}><ProjectChip task={task} onUpdate={onUpdate} /></span>
        ) : label ? <span className="max-w-full truncate rounded-[3px] bg-muted px-1.5 py-px text-[12px] font-medium text-muted-foreground">{label}</span> : null}
        {task.tags.map((t) => (
          <span key={t} className="rounded-[3px] bg-muted px-1.5 py-px text-[12px] font-medium text-muted-foreground">{t}</span>
        ))}
      </span>

      <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
        <CheckSquare className="size-3.5 shrink-0 text-[#4bade8]" fill="#4bade8" stroke="#fff" aria-hidden />
        <span className="font-medium text-muted-foreground">
          {ISSUE_PREFIX}-{task.task_no}
        </span>
        {canEdit && task.parent_task_id == null ? (
          <button type="button" {...stopDrag} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} aria-expanded={open} title={task.subtask_total ? 'Show subtasks' : 'Add a subtask'}
            className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground ${task.subtask_total || open ? '' : ghost}`}>
            <ListTree className="size-3" aria-hidden />
            {task.subtask_total > 0 ? `${task.subtask_done}/${task.subtask_total}` : 'Subtask'}
          </button>
        ) : task.subtask_total > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-muted-foreground" title="Subtasks done"><ListTree className="size-3" aria-hidden />{task.subtask_done}/{task.subtask_total}</span>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {canEdit ? (
            <span className={hasDue ? '' : ghost}><DueChip task={task} overdue={overdue} onUpdate={onUpdate} /></span>
          ) : hasDue ? (
            <span className={`whitespace-nowrap rounded-full px-1.5 py-px text-[12px] font-semibold ${overdue ? 'bg-[#ffebe6] text-[#bf2600] dark:bg-red-500/20 dark:text-red-400' : 'bg-[#dfe1e6] text-[#42526e] dark:bg-muted dark:text-muted-foreground'}`}>{dueText(task)}</span>
          ) : null}
          {task.estimate_min != null && (
            <span className="whitespace-nowrap rounded-full bg-[#dfe1e6] px-1.5 py-px text-[12px] font-semibold text-[#42526e] dark:bg-muted dark:text-muted-foreground">
              {fmtEstimate(task.estimate_min)}
            </span>
          )}
          {canEdit ? <PriorityChip task={task} onUpdate={onUpdate} /> : <PriorityIcon priority={task.priority} />}
        </span>
      </span>
      {open && canEdit && <SubtaskPanel parentId={task.id} compact onChanged={() => onSubtasksChanged?.()} />}
    </div>
    </div>
  );
}

const stopDrag = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

export default TaskCard;
