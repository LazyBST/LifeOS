// What happened to a thing that was scheduled on a given day (the life calendar's logic, kept pure for tests).
//
// Per scheduled day an item is one of:
//   done    finished on or before that day
//   pushed  not finished that day: moved to another date, left overdue, finished late, or a habit not ticked
//   pending it is today and still open
// A future day is not counted yet.
export type Outcome = 'done' | 'pushed' | 'pending';

export type TaskTimeline = {
  status: string;
  /** current deadline */
  due_date: string | null;
  /** IST day it was completed, if it was */
  completed_day: string | null;
  /** deadline moves, oldest first */
  changes: { old_date: string | null; new_date: string | null }[];
  original_due_date?: string | null;
};

/** Every day this task has been scheduled on, oldest first, ending with the current deadline. */
export function scheduledDays(t: Pick<TaskTimeline, 'due_date' | 'changes' | 'original_due_date'>): string[] {
  const days: string[] = [];
  const push = (d: string | null | undefined) => { if (d && days[days.length - 1] !== d) days.push(d); };
  if (t.changes.length) { push(t.changes[0].old_date ?? t.original_due_date); for (const c of t.changes) push(c.new_date); }
  else push(t.original_due_date ?? t.due_date);
  push(t.due_date);
  return days;
}

export function taskOutcomes(t: TaskTimeline, today: string): { date: string; outcome: Outcome }[] {
  const days = scheduledDays(t);
  const out: { date: string; outcome: Outcome }[] = [];
  days.forEach((d, k) => {
    if (d > today) return; // not counted yet
    const final = k === days.length - 1 && d === t.due_date;
    const isDone = t.status === 'done';
    if (final && isDone && (!t.completed_day || t.completed_day <= d)) out.push({ date: d, outcome: 'done' });
    else if (final && !isDone && d === today) out.push({ date: d, outcome: 'pending' });
    else out.push({ date: d, outcome: 'pushed' });
  });
  return out;
}

/** value: the day's check-in; -1 means you marked it missed. */
export function habitOutcome(value: number | undefined, target: number, date: string, today: string): Outcome | null {
  if (date > today) return null;
  if ((value ?? 0) >= target) return 'done';
  if (value !== undefined && value < 0) return 'pushed';
  return date === today ? 'pending' : 'pushed';
}

export type DayScore = { total: number; done: number; pushed: number };

/** (finished − pushed) ÷ scheduled, never below zero; null when nothing was scheduled. */
export function dayScore(s: DayScore | undefined): number | null {
  if (!s || s.total <= 0) return null;
  return Math.max(0, (s.done - s.pushed) / s.total);
}
