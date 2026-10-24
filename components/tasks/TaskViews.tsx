'use client';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { GroupByKey, TaskFilters, TaskViewState } from '@/lib/types/filters';
import { useTaskViewState, type TaskCreateInput } from './useTaskViewState';
import { Board } from './Board';
import { TaskList } from './TaskList';
import { FilterBar } from './FilterBar';

export type TaskViewsProps = {
  /** filters locked by the page, e.g. { project_id } — the user cannot clear these */
  base: TaskFilters;
  /** key for remembering the last-used view in localStorage, e.g. `project:<id>` */
  scope: string;
  /** what an inline "Add task" row attaches the new task to */
  createDefaults?: { project_id?: string; goal_id?: string; parent_task_id?: string; area_id?: string };
  /** hide the preset tabs (entity pages that supply their own grouping) */
  hidePresets?: boolean;
  defaultView?: 'board' | 'list';
  defaultGroup?: GroupByKey;
  /** optional heading rendered above the toolbar */
  title?: React.ReactNode;
};

const PRESET_TABS: { key: TaskViewState['preset']; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Within 7 days' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'open', label: 'All open' },
];

export function TaskViews({ base, scope, createDefaults, hidePresets, defaultView, defaultGroup, title }: TaskViewsProps) {
  const {
    state,
    setPreset,
    setView,
    setGroup,
    setSort,
    setFilters,
    clearFilters,
    tasks,
    loading,
    error,
    createTask,
    completeTask,
    reopenTask,
    moveTask,
  } = useTaskViewState({ base, scope, defaultView, defaultGroup });

  const effectiveCreateDefaults: TaskCreateInput = useMemo(
    () => ({ title: '', ...createDefaults }),
    [createDefaults],
  );

  return (
    <div className="flex flex-col gap-3">
      {title && <div className="text-sm font-medium">{title}</div>}
      {!hidePresets && (
        <div className="flex flex-wrap gap-1">
          {PRESET_TABS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={state.preset === p.key ? 'secondary' : 'ghost'}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button size="sm" variant={state.view === 'board' ? 'secondary' : 'outline'} onClick={() => setView('board')}>
            Board
          </Button>
          <Button size="sm" variant={state.view === 'list' ? 'secondary' : 'outline'} onClick={() => setView('list')}>
            List
          </Button>
        </div>
        {state.view === 'list' && <GroupBySelect value={state.group} onChange={setGroup} />}
      </div>
      <FilterBar filters={state.filters} base={base} onChange={setFilters} onClear={clearFilters} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <ViewSkeleton view={state.view} />
      ) : state.view === 'board' ? (
        <Board
          tasks={tasks}
          onMove={moveTask}
          onComplete={completeTask}
          onCreate={createTask}
          createDefaults={effectiveCreateDefaults}
        />
      ) : (
        <TaskList
          tasks={tasks}
          sort={state.sort}
          dir={state.dir}
          group={state.group}
          onSortChange={setSort}
          onToggleComplete={(t) => (t.status === 'done' ? reopenTask(t.id) : completeTask(t.id))}
          onCreate={createTask}
          createDefaults={effectiveCreateDefaults}
        />
      )}
    </div>
  );
}

function GroupBySelect({ value, onChange }: { value: GroupByKey; onChange: (g: GroupByKey) => void }) {
  return (
    <select
      className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as GroupByKey)}
      aria-label="Group by"
    >
      <option value="none">No grouping</option>
      <option value="area">Area</option>
      <option value="goal">Goal</option>
      <option value="project">Project</option>
      <option value="priority">Priority</option>
      <option value="due">Due date</option>
    </select>
  );
}

function ViewSkeleton({ view }: { view: 'board' | 'list' }) {
  if (view === 'board') {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-border/60 p-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export default TaskViews;
