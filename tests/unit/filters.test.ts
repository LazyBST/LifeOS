import { describe, it, expect } from 'vitest';
import {
  viewStateToParams,
  paramsToViewState,
  presetFilters, dueWindow,
  DEFAULT_VIEW_STATE,
  type TaskViewState,
} from '@/lib/types/filters';

describe('viewStateToParams / paramsToViewState round-trip', () => {
  it('round-trips a non-default state', () => {
    const state: TaskViewState = {
      view: 'list',
      preset: 'week',
      filters: {
        area_id: 'area-1',
        goal_id: 'goal-1',
        project_id: 'project-1',
        priority: ['P0', 'P1'],
        status: ['todo', 'doing', 'review'],
        due: 'overdue',
        due_from: '2026-10-01',
        due_to: '2026-10-31',
        tag: 'urgent',
        q: 'login',
      },
      sort: 'due_date',
      dir: 'desc',
      group: 'area',
    };
    const params = viewStateToParams(state);
    const back = paramsToViewState(params);
    expect(back).toEqual(state);
  });

  it('omits defaults from the query string', () => {
    const params = viewStateToParams(DEFAULT_VIEW_STATE);
    expect(params.toString()).toBe('');
  });

  it('only non-default top-level fields are written', () => {
    const state: TaskViewState = { ...DEFAULT_VIEW_STATE, view: 'list' };
    const params = viewStateToParams(state);
    expect(params.get('view')).toBe('list');
    expect(params.has('preset')).toBe(false);
    expect(params.has('sort')).toBe(false);
    expect(params.has('dir')).toBe(false);
    expect(params.has('group')).toBe(false);
  });

  it('parsing an empty query string yields the default state (merged with base)', () => {
    const params = new URLSearchParams();
    expect(paramsToViewState(params)).toEqual(DEFAULT_VIEW_STATE);
  });

  it('applies a locked base filter under the parsed state', () => {
    const params = new URLSearchParams('view=list');
    const state = paramsToViewState(params, { filters: { project_id: 'locked-project' } });
    expect(state.view).toBe('list');
    expect(state.filters.project_id).toBe('locked-project');
  });
});

describe('presetFilters (spec section 6)', () => {
  it('today: due today, excludes done', () => {
    expect(presetFilters('today')).toEqual({ due: 'today', include_done: false });
  });

  it('week: due within the week, excludes done', () => {
    expect(presetFilters('week')).toEqual({ due: 'week', include_done: false });
  });

  it('overdue: excludes done', () => {
    expect(presetFilters('overdue')).toEqual({ due: 'overdue', include_done: false });
  });

  it('open: everything not done, so review counts too', () => {
    expect(presetFilters('open')).toEqual({ include_done: false });
  });

  it('all: includes done', () => {
    expect(presetFilters('all')).toEqual({ include_done: true });
  });
});

describe('dueWindow', () => {
  const add = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  it('knows tomorrow and today + tomorrow', () => {
    expect(dueWindow({ due: 'tomorrow' }, '2026-10-27', add)).toEqual({ gte: '2026-10-28', lte: '2026-10-28' });
    expect(dueWindow({ due: 'today_tomorrow' }, '2026-10-27', add)).toEqual({ gte: '2026-10-27', lte: '2026-10-28' });
  });
  it('a custom range may be open at either end', () => {
    expect(dueWindow({ due: 'custom', due_from: '2026-11-01' }, '2026-10-27', add)).toEqual({ gte: '2026-11-01' });
    expect(dueWindow({ due: 'custom', due_to: '2026-11-05' }, '2026-10-27', add)).toEqual({ lte: '2026-11-05' });
  });
  it('overdue is anything before today', () => {
    expect(dueWindow({ due: 'overdue' }, '2026-10-27', add)).toEqual({ lt: '2026-10-27' });
  });
});
