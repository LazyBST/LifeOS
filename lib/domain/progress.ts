// Progress and forecast maths (spec section 10). Pure functions so they are
// unit-testable and identical in the UI, the chat `report` tool and the
// nightly review.

export type ProgressInput = {
  done_min: number;
  total_min: number;
  remaining_min: number;
  unestimated: number;
};

export type Forecast = {
  progressPct: number;
  remainingHours: number;
  /** minutes completed per day, over the last 14 days */
  velocity: number;
  /** true when velocity fell back to a fraction of the global rate */
  rough: boolean;
  projectedDays: number | null;
  projectedDate: string | null;
  onTrack: boolean | null;
  unestimated: number;
};

/** Progress % by effort, not task count. */
export function progressPct(p: Pick<ProgressInput, 'done_min' | 'total_min'>): number {
  if (!p.total_min) return 0;
  return Math.round((p.done_min / p.total_min) * 100);
}

export function remainingHours(remainingMin: number): number {
  return Math.round((remainingMin / 60) * 10) / 10;
}

/**
 * Velocity in minutes per day. A goal with no completions in the window falls
 * back to a quarter of the global velocity and is labelled "rough".
 */
export function velocityFor(
  goalMinPerDay: number | null | undefined,
  globalMinPerDay: number,
): { velocity: number; rough: boolean } {
  if (goalMinPerDay && goalMinPerDay > 0) return { velocity: goalMinPerDay, rough: false };
  return { velocity: globalMinPerDay * 0.25, rough: true };
}

export function forecast(
  p: ProgressInput,
  opts: {
    goalVelocity?: number | null;
    globalVelocity?: number;
    today: string;
    targetDate?: string | null;
  },
): Forecast {
  const { velocity, rough } = velocityFor(opts.goalVelocity, opts.globalVelocity ?? 0);
  const projectedDays = velocity > 0 ? Math.ceil(p.remaining_min / velocity) : null;
  const projectedDate = projectedDays === null ? null : addDays(opts.today, projectedDays);
  const onTrack =
    projectedDate && opts.targetDate ? projectedDate <= opts.targetDate : null;
  return {
    progressPct: progressPct(p),
    remainingHours: remainingHours(p.remaining_min),
    velocity,
    rough,
    projectedDays,
    projectedDate,
    onTrack,
    unestimated: p.unestimated,
  };
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Habit streak: consecutive days, walking back from `today`, on which the habit
 * was due and the check-in value met the target. Days the habit was not due are
 * skipped and neither extend nor break the streak (spec section 10).
 */
export function habitStreak(args: {
  today: string;
  daysOfWeek: number[] | null;
  target: number;
  /** date -> value */
  checkins: Record<string, number>;
  /** stop after this many days of history */
  maxDays?: number;
}): { current: number; longest: number } {
  const { today, daysOfWeek, target, checkins } = args;
  const maxDays = args.maxDays ?? 400;
  const due = (date: string) => !daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.includes(isoDow(date));
  const met = (date: string) => (checkins[date] ?? 0) >= target;

  // skipped days (-2) neither extend nor break a streak. A day that was not scheduled but was done anyway (a habit
  // moved to another day of the week) counts like any other done day; a not-scheduled day left alone is ignored.
  let current = 0;
  for (let i = 0; i < maxDays; i++) {
    const d = addDays(today, i * -1);
    const v = checkins[d];
    if (v === -2) continue;
    if (!due(d)) { if (met(d)) current += 1; continue; }
    if (met(d)) current += 1;
    // today not yet checked in does not break a streak that is otherwise alive
    else if (i === 0 && v === undefined) continue; // an explicit miss (-1) today does break it
    else break;
  }

  let longest = 0;
  let run = 0;
  const dates = Object.keys(checkins).sort();
  const from = dates[0] ?? today;
  const span = Math.min(maxDays, Math.max(0, daysBetween(from, today)));
  for (let i = span; i >= 0; i--) {
    const d = addDays(today, -i);
    if (checkins[d] === -2) continue;
    if (!due(d)) { if (met(d)) { run += 1; longest = Math.max(longest, run); } continue; }
    if (met(d)) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return { current, longest: Math.max(longest, current) };
}

function isoDow(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
