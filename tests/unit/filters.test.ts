import { describe, it, expect } from 'vitest';
import {
  viewStateToParams,
  paramsToViewState,
  presetFilters,
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
        status: ['todo', 'doing'],
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

  it('open: todo/doing statuses, excludes done', () => {
    expect(presetFilters('open')).toEqual({ status: ['todo', 'doing'], include_done: false });
  });

  it('all: includes done', () => {
    expect(presetFilters('all')).toEqual({ include_done: true });
  });
});
