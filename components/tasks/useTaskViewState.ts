'use client';
// Core state hook behind TaskViews: URL + localStorage persisted filter/view
// state, plus data fetching and optimistic mutations through the server
// actions in app/actions/tasks.ts (spec section 6, docs/CONTRACTS.md).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DEFAULT_VIEW_STATE,
  type GroupByKey,
  type TaskFilters,
  type TaskSortKey,
  type TaskViewState,
  paramsToViewState,
  presetFilters,
  viewStateToParams,
} from '@/lib/types/filters';
import type { Priority, TaskStatus } from '@/lib/types/db';
import {
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
  listTasksAction,
  moveTaskAction,
  reopenTaskAction,
  updateTaskAction,
  type TaskListItem,
} from '@/app/actions/tasks';

/** Lightweight subset of lib/domain/tasks.ts's TaskInput, safe to use client-side. */
export type TaskCreateInput = {
  title: string;
  project_id?: string | null;
  goal_id?: string | null;
  parent_task_id?: string | null;
  area_id?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  due_date?: string | null;
  estimate_min?: number | null;
};

export type TaskPatchLite = Partial<{
  title: string;
  area_id: string | null;
  goal_id: string | null;
  project_id: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  estimate_min: number | null;
  tags: string[];
  sort_order: number;
}>;

function storageKey(scope: string): string {
  return `lifeos:view:${scope}`;
}

function stripBase(filters: TaskFilters, base: TaskFilters): TaskFilters {
  const out: TaskFilters = { ...filters };
  for (const k of Object.keys(base)) delete (out as Record<string, unknown>)[k];
  return out;
}

export function useTaskViewState(opts: {
  base: TaskFilters;
  scope: string;
  defaultView?: 'board' | 'list';
  defaultGroup?: GroupByKey;
  defaultPreset?: TaskViewState['preset'];
}) {
  const { base, scope, defaultView, defaultGroup, defaultPreset } = opts;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<TaskViewState>(() => {
    const baseState: Partial<TaskViewState> = {
      filters: base,
      ...(defaultView ? { view: defaultView } : {}),
      ...(defaultGroup ? { group: defaultGroup } : {}),
      ...(defaultPreset ? { preset: defaultPreset } : {}),
    };
    return paramsToViewState(searchParams, baseState);
  });

  const restored = useRef(false);
  // Restore the last-used view from localStorage on first mount, only when
  // the URL itself carried no state (so a bookmarked/shared URL always wins).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (searchParams.toString()) return;
    try {
      const raw = localStorage.getItem(storageKey(scope));
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<TaskViewState>;
      setState((prev) => ({
        ...prev,
        ...saved,
        filters: { ...(saved.filters ?? {}), ...base },
      }));
    } catch {
      // corrupt or unavailable storage: ignore and keep defaults
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effective filters actually sent to the server: preset defaults, then the
  // user's own filter picks, then the page's locked base (base always wins).
  const effectiveFilters = useMemo<TaskFilters>(
    () => ({ ...presetFilters(state.preset), ...state.filters, ...base }),
    [state.preset, state.filters, base],
  );

  // Mirror state to the URL (minus locked base keys) and to localStorage.
  useEffect(() => {
    const urlState: TaskViewState = { ...state, filters: stripBase(state.filters, base) };
    const qs = viewStateToParams(urlState).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    try {
      localStorage.setItem(storageKey(scope), JSON.stringify(urlState));
    } catch {
      // private mode / quota exceeded: view state just won't persist
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, scope, pathname]);

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtersKey = JSON.stringify(effectiveFilters);
  const refetch = useCallback(() => {
    setLoading(true);
    listTasksAction(JSON.parse(filtersKey) as TaskFilters).then((res) => {
      if (res.ok) {
        setTasks(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
  }, [filtersKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const patchLocal = useCallback((id: string, patch: Partial<TaskListItem>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const createTask = useCallback(
    async (input: TaskCreateInput) => {
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const optimistic: TaskListItem = {
        id: tempId,
        task_no: 0,
        title: input.title,
        goal_id: input.goal_id ?? null,
        project_id: input.project_id ?? null,
        parent_task_id: input.parent_task_id ?? null,
        area_id: input.area_id ?? null,
        status: input.status ?? 'todo',
        priority: input.priority ?? 'P2',
        due_date: input.due_date ?? null,
        due_at: null,
        duration_min: null,
        estimate_min: input.estimate_min ?? null,
        notes_md: '',
        tags: [],
        sort_order: Date.now() / 1000,
        completed_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        area_name: null,
        area_color: '#94a3b8',
        goal_title: null,
        project_title: null,
        subtask_total: 0,
        subtask_done: 0,
      };
      setTasks((prev) => [...prev, optimistic]);
      const res = await createTaskAction(input);
      refetch();
      return res;
    },
    [refetch],
  );

  const updateTask = useCallback(
    async (id: string, patch: TaskPatchLite) => {
      patchLocal(id, patch as Partial<TaskListItem>);
      const res = await updateTaskAction(id, patch);
      refetch();
      return res;
    },
    [patchLocal, refetch],
  );

  const completeTask = useCallback(
    async (id: string) => {
      patchLocal(id, { status: 'done', completed_at: new Date().toISOString() });
      const res = await completeTaskAction(id);
      refetch();
      return res;
    },
    [patchLocal, refetch],
  );

  const reopenTask = useCallback(
    async (id: string) => {
      patchLocal(id, { status: 'todo', completed_at: null });
      const res = await reopenTaskAction(id);
      refetch();
      return res;
    },
    [patchLocal, refetch],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      const res = await deleteTaskAction(id);
      refetch();
      return res;
    },
    [refetch],
  );

  const moveTask = useCallback(
    async (id: string, status: TaskStatus, sortOrder?: number) => {
      patchLocal(id, { status, ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}) });
      const res = await moveTaskAction(id, status, sortOrder);
      refetch();
      return res;
    },
    [patchLocal, refetch],
  );

  const setPreset = useCallback((preset: TaskViewState['preset']) => {
    setState((s) => ({ ...s, preset }));
  }, []);
  const setView = useCallback((view: TaskViewState['view']) => {
    setState((s) => ({ ...s, view }));
  }, []);
  const setGroup = useCallback((group: GroupByKey) => {
    setState((s) => ({ ...s, group }));
  }, []);
  const setSort = useCallback((sort: TaskSortKey, dir: 'asc' | 'desc') => {
    setState((s) => ({ ...s, sort, dir }));
  }, []);
  const setFilters = useCallback((next: TaskFilters) => {
    setState((s) => ({ ...s, filters: next }));
  }, []);
  const clearFilters = useCallback(() => {
    setState((s) => ({ ...s, filters: {} }));
  }, []);

  return {
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
    refetch,
    createTask,
    updateTask,
    completeTask,
    reopenTask,
    deleteTask,
    moveTask,
  };
}

export const DEFAULT_TASK_VIEW_STATE = DEFAULT_VIEW_STATE;
