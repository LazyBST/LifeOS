// Pure Pomodoro maths: the timer is built from timestamps (never from counting ticks), so it stays right when the
// tab sleeps or the page is reloaded. No Supabase, no server-only: the browser timer and the day summary share it.

export type Phase = 'work' | 'break';
export type PomoConfig = { workMin: number; breakMin: number; /** null = keep going until stopped */ repeats: number | null };

export type PomoTimer = {
  runId: string;
  cfg: PomoConfig;
  phase: Phase;
  /** which work session this is, from 1 */
  cycle: number;
  phaseStartedAt: number;
  pausedAt: number | null;
  /** total time spent paused within this phase */
  pausedMs: number;
  pauses: number;
  label: string;
  status: 'running' | 'paused' | 'done';
  /** work sessions finished in this run, and the focused seconds they added up to */
  doneWork?: number;
  focusedSec?: number;
};

export type Segment = {
  run_id: string; kind: Phase; label: string; planned_sec: number; actual_sec: number;
  paused_sec: number; pauses: number; completed: boolean; started_at: string; ended_at: string;
};

export const phaseMs = (t: PomoTimer): number => (t.phase === 'work' ? t.cfg.workMin : t.cfg.breakMin) * 60_000;
export const elapsedMs = (t: PomoTimer, now: number): number => Math.max(0, (t.pausedAt ?? now) - t.phaseStartedAt - t.pausedMs);
export const remainingMs = (t: PomoTimer, now: number): number => Math.max(0, phaseMs(t) - elapsedMs(t, now));
/** The instant this phase finishes (or finished), pauses included. */
export const endInstant = (t: PomoTimer): number => t.phaseStartedAt + t.pausedMs + phaseMs(t);

export function startRun(cfg: PomoConfig, now: number, runId: string, label: string): PomoTimer {
  return { runId, cfg, phase: 'work', cycle: 1, phaseStartedAt: now, pausedAt: null, pausedMs: 0, pauses: 0, label, status: 'running', doneWork: 0, focusedSec: 0 };
}

export function pause(t: PomoTimer, now: number): PomoTimer {
  return t.status !== 'running' ? t : { ...t, status: 'paused', pausedAt: now, pauses: t.pauses + 1 };
}

export function resume(t: PomoTimer, now: number): PomoTimer {
  return t.status !== 'paused' || t.pausedAt === null ? t : { ...t, status: 'running', pausedMs: t.pausedMs + (now - t.pausedAt), pausedAt: null };
}

/** The segment the current phase has produced so far. */
export function segmentOf(t: PomoTimer, now: number, completed: boolean): Segment {
  const pausedMs = t.pausedMs + (t.pausedAt !== null ? now - t.pausedAt : 0);
  return {
    run_id: t.runId, kind: t.phase, label: t.label, planned_sec: Math.round(phaseMs(t) / 1000),
    actual_sec: Math.round(Math.min(elapsedMs(t, now), phaseMs(t)) / 1000), paused_sec: Math.round(pausedMs / 1000), pauses: t.pauses,
    completed, started_at: new Date(t.phaseStartedAt).toISOString(), ended_at: new Date(now).toISOString(),
  };
}

/** Close the current phase (finished, or skipped when `completed` is false) and start whatever comes next. */
export function advance(t: PomoTimer, now: number, label: string, completed = true): { segment: Segment; next: PomoTimer } {
  const segment = segmentOf(t, now, completed);
  if (t.phase === 'work' && completed) t = { ...t, doneWork: (t.doneWork ?? 0) + 1, focusedSec: (t.focusedSec ?? 0) + segment.actual_sec };
  const fresh = (phase: Phase, cycle: number): PomoTimer => ({ ...t, phase, cycle, phaseStartedAt: now, pausedAt: null, pausedMs: 0, pauses: 0, label, status: 'running' });
  const lastWork = t.cfg.repeats !== null && t.cycle >= t.cfg.repeats;
  if (t.phase === 'work') {
    if (lastWork) return { segment, next: { ...t, status: 'done' } }; // no break needed after the last session
    return { segment, next: t.cfg.breakMin > 0 ? fresh('break', t.cycle) : fresh('work', t.cycle + 1) };
  }
  return { segment, next: lastWork ? { ...t, status: 'done' } : fresh('work', t.cycle + 1) };
}

export const clock = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export type DaySummary = {
  workSessions: number; workStarted: number; pauses: number; pausedSec: number;
  workSec: number; breakSec: number; allottedSec: number;
  /** work time against the work planned on the calendar, or null when nothing was planned */
  coverage: number | null; focusShare: number | null;
};

export function summariseDay(segments: Pick<Segment, 'kind' | 'planned_sec' | 'actual_sec' | 'paused_sec' | 'pauses' | 'completed'>[], plannedWorkMin: number): DaySummary {
  const work = segments.filter((s) => s.kind === 'work'), brk = segments.filter((s) => s.kind === 'break');
  const sum = (xs: { [k: string]: unknown }[], k: string) => xs.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const workSec = sum(work, 'actual_sec'), breakSec = sum(brk, 'actual_sec');
  return {
    workSessions: work.filter((s) => s.completed).length, workStarted: work.length,
    pauses: sum(segments, 'pauses'), pausedSec: sum(segments, 'paused_sec'),
    workSec, breakSec, allottedSec: sum(segments, 'planned_sec'),
    coverage: plannedWorkMin > 0 ? workSec / 60 / plannedWorkMin : null,
    focusShare: workSec + breakSec > 0 ? workSec / (workSec + breakSec) : null,
  };
}

export type Celebration = 'sparkle' | 'confetti' | 'lanterns' | 'rocket' | 'diwali';

/**
 * What to show when a phase finishes. Every finished work session sparkles. Finishing the set you decided on, or
 * every 4th session in a row, is a big win: the longer you focused in the run, the bigger the show.
 */
export function celebrationFor(finished: PomoTimer, next: PomoTimer, rand: () => number = Math.random): Celebration | null {
  if (finished.phase !== 'work') return null;
  const sessions = (finished.doneWork ?? 0) + 1;
  const big = next.status === 'done' || sessions % 4 === 0;
  if (!big) return 'sparkle';
  const minutes = ((next.focusedSec ?? 0) || 0) / 60;
  const pool: Celebration[] = minutes < 60 ? ['confetti', 'lanterns'] : minutes < 120 ? ['rocket', 'confetti', 'lanterns'] : ['diwali', 'rocket'];
  return pool[Math.floor(rand() * pool.length)];
}
