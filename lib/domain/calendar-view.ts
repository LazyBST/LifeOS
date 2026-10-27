import type { UntimedItem, WeekBlock, WeekData } from './calweek';

/** What the calendar shows: everything, only what was finished, or without what slipped. */
export type CalShow = 'all' | 'done' | 'hide-missed';

export const CAL_SHOW_LABEL: Record<CalShow, string> = {
  all: 'Everything',
  done: 'Only completed',
  'hide-missed': 'Hide not done / missed',
};

/**
 * Tasks and habits are filtered; events, all-day items and goal/project bars always stay.
 * "Not done / missed" is anything not done that was marked missed or skipped, or whose time has already passed.
 */
export function applyShow(data: WeekData, show: CalShow, today: string, nowIso: string): WeekData {
  if (show === 'all') return data;
  const keepBlock = (b: WeekBlock) => {
    if (b.kind === 'event') return true;
    if (show === 'done') return !!b.done;
    const slipped = !b.done && (b.habit?.missed || b.habit?.skipped || b.end < nowIso);
    return !slipped;
  };
  const keepUntimed = (u: UntimedItem) => {
    if (show === 'done') return u.done;
    return u.done || !(u.missed || u.skipped || u.date < today);
  };
  return { ...data, blocks: data.blocks.filter(keepBlock), untimed: data.untimed.filter(keepUntimed) };
}
