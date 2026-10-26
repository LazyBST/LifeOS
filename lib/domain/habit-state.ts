// A habit's day, as the one circle shows it. Client-safe.
//   none -> done -> missed -> skipped -> none
// Stored in habit_checkins.value: >= target is done, -1 missed, -2 skipped, anything else is undecided.

export type DayMark = 'none' | 'done' | 'missed' | 'skipped';
export const MISSED = -1;
export const SKIPPED = -2;

export function markOf(value: number | undefined | null, target: number): DayMark {
  if (value === undefined || value === null) return 'none';
  if (value === SKIPPED) return 'skipped';
  if (value < 0) return 'missed';
  return value >= target && target > 0 ? 'done' : 'none';
}

/** What one more click on the circle does. */
export const nextMark = (m: DayMark): DayMark => (m === 'none' ? 'done' : m === 'done' ? 'missed' : m === 'missed' ? 'skipped' : 'none');

export const MARK_LABEL: Record<DayMark, string> = { none: 'Not decided', done: 'Done', missed: 'Missed', skipped: 'Skipped' };
