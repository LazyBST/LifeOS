'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClearableInput } from '@/components/ui/clearable-input';
import { Skeleton } from '@/components/ui/skeleton';
import { createDefaultsFor, type GroupByKey, type TaskFilters, type TaskViewState } from '@/lib/types/filters';
import { addDays, istDate } from '@/lib/time';
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
  /** which preset tab to start on (default: all open tasks); 'all' also shows done tasks */
  defaultPreset?: TaskViewState['preset'];
  /** optional heading rendered above the toolbar */
  title?: React.ReactNode;
};

const PRESET_TABS: { key: TaskViewState['preset']; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'today_tomorrow', label: 'Today + tomorrow' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'open', label: 'All open' },
  { key: 'range', label: 'Date range' },
];

export function TaskViews({ base, scope, createDefaults, hidePresets, defaultView, defaultGroup, defaultPreset, title }: TaskViewsProps) {
  const {
    state,
    effectiveFilters,
    setPreset,
    setView,
    setGroup,
    setSort,
    setFilters,
    clearFilters,
    tasks,
    loading,
    fetching,
    error,
    createTask,
    completeTask,
    reopenTask,
    deleteTask,
    moveTask,
  } = useTaskViewState({ base, scope, defaultView, defaultGroup, defaultPreset });

  // a task made here starts out matching the filters, so typing a title is all it takes
  const effectiveCreateDefaults: TaskCreateInput = useMemo(
    () => ({ title: '', ...createDefaultsFor(effectiveFilters, istDate(), addDays), ...createDefaults }),
    [effectiveFilters, createDefaults],
  );

  // the filter bar stays tucked away until asked for, and remembers that choice per view
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => {
    try { setShowFilters(localStorage.getItem(`lifeos:filters-open:${scope}`) === '1'); } catch {}
  }, [scope]);
  const toggleFilters = () => setShowFilters((v) => { const n = !v; try { localStorage.setItem(`lifeos:filters-open:${scope}`, n ? '1' : '0'); } catch {} return n; });
  const activeFilters = Object.entries(state.filters).filter(([k, v]) => !(k in base) && v != null && !(Array.isArray(v) && v.length === 0) && v !== '' && k !== 'include_done' && k !== 'limit').length;

  // search sits in the toolbar (always visible) and feeds the same `q` filter the list is queried with
  const [search, setSearch] = useState(state.filters.q ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setSearch(state.filters.q ?? ''); }, [state.filters.q]);
  const onSearch = (v: string) => {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilters({ ...state.filters, q: v || undefined }), 350);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* the controls stay put; only the cards below scroll */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-col gap-3 bg-[var(--sticky-bg,var(--background))] px-1 pb-2">
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
        <div className="flex items-center gap-2">
          <ClearableInput value={search} onChange={(e) => onSearch(e.target.value)} onClear={() => { if (searchTimer.current) clearTimeout(searchTimer.current); setSearch(''); setFilters({ ...state.filters, q: undefined }); }} clearLabel="Clear the search" placeholder="Search tasks…" aria-label="Search tasks" className="h-8 w-36 sm:w-48" />
          {state.view === 'list' && <GroupBySelect value={state.group} onChange={setGroup} />}
          <Button size="sm" variant={showFilters || activeFilters ? 'secondary' : 'outline'} onClick={toggleFilters} aria-expanded={showFilters} aria-controls="task-filters">
            <Filter className="size-3.5" />
            Filters
            {activeFilters > 0 && <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{activeFilters}</span>}
          </Button>
          {activeFilters > 0 && !showFilters && <button type="button" onClick={clearFilters} className="text-xs text-muted-foreground hover:underline">Clear</button>}
        </div>
      </div>
      {!hidePresets && state.preset === 'range' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due between</span>
          <ClearableInput type="date" className="h-8 w-40" aria-label="From date" value={state.filters.due_from ?? ''} max={state.filters.due_to ?? undefined} onChange={(e) => setFilters({ ...state.filters, due_from: e.target.value || undefined })} onClear={() => setFilters({ ...state.filters, due_from: undefined })} clearLabel="Clear the start date" />
          <span className="text-xs text-muted-foreground">and</span>
          <ClearableInput type="date" className="h-8 w-40" aria-label="To date" value={state.filters.due_to ?? ''} min={state.filters.due_from ?? undefined} onChange={(e) => setFilters({ ...state.filters, due_to: e.target.value || undefined })} onClear={() => setFilters({ ...state.filters, due_to: undefined })} clearLabel="Clear the end date" />
        </div>
      )}
      {showFilters && <div id="task-filters"><FilterBar filters={state.filters} base={base} onChange={setFilters} onClear={clearFilters} /></div>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <ViewSkeleton view={state.view} />
      ) : (
      <div className={fetching ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={fetching}>
      {state.view === 'board' ? (
        <Board
          tasks={tasks}
          onMove={moveTask}
          onComplete={completeTask}
          onDelete={(id) => void deleteTask(id)}
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
          onDelete={(id) => void deleteTask(id)}
          onCreate={createTask}
          createDefaults={effectiveCreateDefaults}
        />
      )}
      </div>
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
