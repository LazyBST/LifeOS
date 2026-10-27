// Shared task filter contract. Used by the TaskViews UI, the URL query string,
// the server actions and the agent's task_list tool (spec section 6).
import type { Priority, TaskStatus, UUID } from './db';

export type DuePreset = 'today' | 'tomorrow' | 'today_tomorrow' | 'week' | 'overdue' | 'none' | 'custom';

export type TaskFilters = {
  area_id?: UUID | null;
  goal_id?: UUID | null;
  project_id?: UUID | null;
  parent_task_id?: UUID | null;
  /** only direct children of parent_task_id; otherwise subtasks are included */
  top_level_only?: boolean;
  priority?: Priority[];
  status?: TaskStatus[];
  due?: DuePreset | null;
  due_from?: string | null;
  due_to?: string | null;
  tag?: string | null;
  q?: string | null;
  include_done?: boolean;
  limit?: number;
};

export type TaskSortKey = 'sort_order' | 'due_date' | 'priority' | 'title' | 'status' | 'updated_at';
export type GroupByKey = 'none' | 'area' | 'goal' | 'project' | 'priority' | 'due' | 'status';

export type TaskViewState = {
  view: 'board' | 'list';
  preset: 'today' | 'tomorrow' | 'today_tomorrow' | 'week' | 'overdue' | 'open' | 'range' | 'all';
  filters: TaskFilters;
  sort: TaskSortKey;
  dir: 'asc' | 'desc';
  group: GroupByKey;
};

export const DEFAULT_VIEW_STATE: TaskViewState = {
  view: 'board',
  preset: 'open',
  filters: {},
  sort: 'sort_order',
  dir: 'asc',
  group: 'none',
};

const PRESETS = ['today', 'tomorrow', 'today_tomorrow', 'week', 'overdue', 'open', 'range', 'all'];

/** Presets from the dashboard tabs (spec section 6). */
export function presetFilters(preset: TaskViewState['preset']): TaskFilters {
  switch (preset) {
    case 'today':
      return { due: 'today', include_done: false };
    case 'tomorrow':
      return { due: 'tomorrow', include_done: false };
    case 'today_tomorrow':
      return { due: 'today_tomorrow', include_done: false };
    case 'week':
      return { due: 'week', include_done: false };
    case 'range':
      return { due: 'custom', include_done: false };
    case 'overdue':
      return { due: 'overdue', include_done: false };
    case 'open':
      return { include_done: false };
    case 'all':
    default:
      return { include_done: true };
  }
}

/** URL query string <-> view state, so every view is bookmarkable. */
export function viewStateToParams(s: TaskViewState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.view !== DEFAULT_VIEW_STATE.view) p.set('view', s.view);
  if (s.preset !== DEFAULT_VIEW_STATE.preset) p.set('preset', s.preset);
  if (s.sort !== DEFAULT_VIEW_STATE.sort) p.set('sort', s.sort);
  if (s.dir !== DEFAULT_VIEW_STATE.dir) p.set('dir', s.dir);
  if (s.group !== DEFAULT_VIEW_STATE.group) p.set('group', s.group);
  const f = s.filters;
  if (f.area_id) p.set('area', f.area_id);
  if (f.goal_id) p.set('goal', f.goal_id);
  if (f.project_id) p.set('project', f.project_id);
  if (f.priority?.length) p.set('priority', f.priority.join(','));
  if (f.status?.length) p.set('status', f.status.join(','));
  if (f.due) p.set('due', f.due);
  if (f.due_from) p.set('from', f.due_from);
  if (f.due_to) p.set('to', f.due_to);
  if (f.tag) p.set('tag', f.tag);
  if (f.q) p.set('q', f.q);
  return p;
}

export function paramsToViewState(
  p: URLSearchParams,
  base: Partial<TaskViewState> = {},
): TaskViewState {
  const s: TaskViewState = {
    ...DEFAULT_VIEW_STATE,
    ...base,
    filters: { ...(base.filters ?? {}) },
  };
  const view = p.get('view');
  if (view === 'board' || view === 'list') s.view = view;
  const preset = p.get('preset');
  if (preset && PRESETS.includes(preset)) {
    s.preset = preset as TaskViewState['preset'];
  }
  const sort = p.get('sort');
  if (sort) s.sort = sort as TaskSortKey;
  const dir = p.get('dir');
  if (dir === 'asc' || dir === 'desc') s.dir = dir;
  const group = p.get('group');
  if (group) s.group = group as GroupByKey;
  const f = s.filters;
  if (p.get('area')) f.area_id = p.get('area');
  if (p.get('goal')) f.goal_id = p.get('goal');
  if (p.get('project')) f.project_id = p.get('project');
  if (p.get('priority')) f.priority = p.get('priority')!.split(',') as Priority[];
  if (p.get('status')) f.status = p.get('status')!.split(',') as TaskStatus[];
  if (p.get('due')) f.due = p.get('due') as DuePreset;
  if (p.get('from')) f.due_from = p.get('from');
  if (p.get('to')) f.due_to = p.get('to');
  if (p.get('tag')) f.tag = p.get('tag');
  if (p.get('q')) f.q = p.get('q');
  return s;
}

/** The due_date window a filter means, as inclusive bounds (`today` is the IST date). */
export function dueWindow(
  f: Pick<TaskFilters, 'due' | 'due_from' | 'due_to'>,
  today: string,
  addDays: (d: string, n: number) => string,
): { gte?: string; lte?: string; lt?: string; none?: boolean } | null {
  switch (f.due) {
    case 'today': return { gte: today, lte: today };
    case 'tomorrow': { const t = addDays(today, 1); return { gte: t, lte: t }; }
    case 'today_tomorrow': return { gte: today, lte: addDays(today, 1) };
    case 'week': return { gte: today, lte: addDays(today, 7) };
    case 'overdue': return { lt: today };
    case 'none': return { none: true };
    case 'custom': return { ...(f.due_from ? { gte: f.due_from } : {}), ...(f.due_to ? { lte: f.due_to } : {}) };
    default: return null;
  }
}
