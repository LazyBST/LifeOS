'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { dueLabel, isOverdue } from '@/lib/time';
import { statusFor, isDone, type StatusDef } from '@/lib/types/statuses';
import { StatusLabel } from '@/components/status/StatusLabel';
import { useStatuses } from '@/components/status/StatusProvider';
import type { TaskListItem } from '@/app/actions/tasks';
import type { GroupByKey, TaskSortKey } from '@/lib/types/filters';
import { InlineAddTask } from './InlineAddTask';
import type { TaskCreateInput } from './useTaskViewState';

export type TaskListProps = {
  tasks: TaskListItem[];
  sort: TaskSortKey;
  dir: 'asc' | 'desc';
  group: GroupByKey;
  onSortChange: (sort: TaskSortKey, dir: 'asc' | 'desc') => void;
  onToggleComplete: (task: TaskListItem) => void;
  onDelete?: (id: string) => void;
  onCreate: (input: TaskCreateInput) => void;
  createDefaults?: TaskCreateInput;
};

const HEADERS: { key: TaskSortKey; label: string }[] = [
  { key: 'title', label: 'Task' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'due_date', label: 'Due' },
];

function compare(a: TaskListItem, b: TaskListItem, sort: TaskSortKey): number {
  switch (sort) {
    case 'due_date':
      return (a.due_date ?? '9999-99-99').localeCompare(b.due_date ?? '9999-99-99');
    case 'priority':
      return a.priority.localeCompare(b.priority);
    case 'title':
      return a.title.localeCompare(b.title);
    case 'status':
      return a.status.localeCompare(b.status);
    case 'updated_at':
      return a.updated_at.localeCompare(b.updated_at);
    default:
      return a.sort_order - b.sort_order;
  }
}

function groupKeyOf(task: TaskListItem, group: GroupByKey, statuses: StatusDef[]): { key: string; label: string } {
  switch (group) {
    case 'area':
      return { key: task.area_id ?? 'none', label: task.area_name ?? 'No area' };
    case 'goal':
      return { key: task.goal_id ?? 'none', label: task.goal_title ?? 'No goal' };
    case 'project':
      return { key: task.project_id ?? 'none', label: task.project_title ?? 'No project' };
    case 'priority':
      return { key: task.priority, label: task.priority };
    case 'due':
      return { key: task.due_date ?? 'none', label: dueLabel(task.due_date) ?? 'No date' };
    case 'status':
      return { key: task.status, label: statusFor(statuses, task.status).label };
    default:
      return { key: 'all', label: '' };
  }
}

export function TaskList({
  tasks,
  sort,
  dir,
  group,
  onSortChange,
  onToggleComplete,
  onDelete,
  onCreate,
  createDefaults,
}: TaskListProps) {
  const statuses = useStatuses();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const copy = [...tasks].sort((a, b) => compare(a, b, sort));
    if (dir === 'desc') copy.reverse();
    return copy;
  }, [tasks, sort, dir]);

  const groups = useMemo(() => {
    if (group === 'none') return [{ key: 'all', label: '', items: sorted }];
    const map = new Map<string, { key: string; label: string; items: TaskListItem[] }>();
    for (const t of sorted) {
      const { key, label } = groupKeyOf(t, group, statuses);
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key)!.items.push(t);
    }
    return Array.from(map.values());
  }, [sorted, group, statuses]);

  function handleHeaderClick(key: TaskSortKey) {
    if (sort === key) onSortChange(key, dir === 'asc' ? 'desc' : 'asc');
    else onSortChange(key, 'asc');
  }

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <InlineAddTask placeholder="Add task" onCreate={(title) => onCreate({ ...createDefaults, title })} />
      <div className="hidden grid-cols-[1.5rem_1fr_5rem_7rem_6rem_4rem_2rem] gap-2 border-b border-border/60 px-2 py-1 text-xs font-medium text-muted-foreground sm:grid">
        <span />
        {HEADERS.map((h) => (
          <button key={h.key} type="button" className="text-left hover:text-foreground" onClick={() => handleHeaderClick(h.key)}>
            {h.label}
            {sort === h.key ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
        ))}
        <span>Est.</span>
        <span />
      </div>
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1">
          {group !== 'none' && (
            <button
              type="button"
              className="flex items-center gap-2 px-2 py-1 text-left text-xs font-semibold text-muted-foreground"
              onClick={() => toggleGroup(g.key)}
            >
              <span>{collapsed.has(g.key) ? '▶' : '▼'}</span>
              <span>{g.label}</span>
              <span className="text-muted-foreground/70">({g.items.length})</span>
            </button>
          )}
          {!collapsed.has(g.key) &&
            g.items.map((task) => <Row key={task.id} task={task} onToggleComplete={onToggleComplete} onDelete={onDelete} />)}
        </div>
      ))}
      {sorted.length === 0 && (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">No tasks match these filters.</p>
      )}
    </div>
  );
}

function Row({ task, onToggleComplete, onDelete }: { task: TaskListItem; onToggleComplete: (task: TaskListItem) => void; onDelete?: (id: string) => void }) {
  const statuses = useStatuses();
  const st = statusFor(statuses, task.status);
  const done = isDone(statuses, task.status);
  const due = dueLabel(task.due_date);
  const overdue = isOverdue(task.due_date) && !done;
  const path = [task.goal_title, task.project_title].filter(Boolean).join(' > ');
  return (
    <div
      className="grid min-h-11 grid-cols-[1.5rem_1fr_5rem_7rem_6rem_4rem_2rem] items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm"
      style={{ borderLeftColor: task.area_color, borderLeftWidth: 3 }}
    >
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={done}
        onChange={() => onToggleComplete(task)}
        aria-label={done ? 'Reopen task' : 'Complete task'}
      />
      <Link href={`/tasks/${task.id}`} className="flex min-w-0 flex-col">
        <span className={`truncate ${st.dim ? 'text-muted-foreground' : ''} ${st.strike_through ? 'line-through' : ''}`}>{task.title}</span>
        {path && <span className="truncate text-xs text-muted-foreground">{path}</span>}
      </Link>
      <span className="text-xs text-muted-foreground">{task.priority}</span>
      <span><StatusLabel status={task.status} compact /></span>
      <span className={`text-xs ${overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
        {due ?? '—'}
      </span>
      <span className="text-xs text-muted-foreground">{task.estimate_min ? `${task.estimate_min}m` : '—'}</span>
      {onDelete ? (
        <button type="button" aria-label={`Delete ${task.title}`} title="Delete task" onClick={() => onDelete(task.id)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/20"><Trash2 className="size-4" /></button>
      ) : <span />}
    </div>
  );
}

export default TaskList;
