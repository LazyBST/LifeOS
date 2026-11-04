// Pure Pomodoro maths: the timer is built from timestamps (never from counting ticks), so it stays right when the
// tab sleeps or the page is reloaded. No Supabase, no server-only: the browser timer and the day summary share it.

const MIN_MS = 60_000;
export type Phase = 'work' | 'break';
export type PomoStep = { workMin: number; breakMin: number };
export type PomoConfig = {
  workMin: number; breakMin: number; /** null = keep going until stopped */ repeats: number | null;
  /** a sequence of different sessions (50/10, 25/5, ...); when present, `repeats` is its length and workMin/breakMin mirror the first step */
  plan?: PomoStep[];
};

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
  /** minutes added to the current break with "extend break" */
  extraMs?: number;
  /** a break taken on the spot: its own length, and the focus time left to come back to (same session) */
  inserted?: boolean;
  breakOverrideMs?: number;
  workOverrideMs?: number;
};

export type Segment = {
  run_id: string; kind: Phase; label: string; planned_sec: number; actual_sec: number;
  paused_sec: number; pauses: number; completed: boolean; started_at: string; ended_at: string;
};

/** The lengths for the session the timer is on: the plan's step for this cycle, or the single work/break pair. */
export const stepOf = (t: PomoTimer): PomoStep => t.cfg.plan?.length ? t.cfg.plan[Math.min(t.cycle, t.cfg.plan.length) - 1] : { workMin: t.cfg.workMin, breakMin: t.cfg.breakMin };
export const phaseMs = (t: PomoTimer): number =>
  t.phase === 'work' ? t.workOverrideMs ?? stepOf(t).workMin * 60_000 : (t.breakOverrideMs ?? stepOf(t).breakMin * 60_000) + (t.extraMs ?? 0);

/** Turn a list of steps into a config that runs each once, in order. */
export const planConfig = (plan: PomoStep[]): PomoConfig => ({ workMin: plan[0].workMin, breakMin: plan[0].breakMin, repeats: plan.length, plan });
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
  const fresh = (phase: Phase, cycle: number, keepWork = false): PomoTimer => ({
    ...t, phase, cycle, phaseStartedAt: now, pausedAt: null, pausedMs: 0, pauses: 0, label, status: 'running',
    extraMs: 0, inserted: false, breakOverrideMs: undefined, workOverrideMs: keepWork ? t.workOverrideMs : undefined,
  });
  const lastWork = t.cfg.repeats !== null && t.cycle >= t.cfg.repeats;
  if (t.phase === 'work') {
    if (lastWork) return { segment, next: { ...t, status: 'done' } }; // no break needed after the last session
    const next = fresh('break', t.cycle);
    return { segment, next: stepOf(t).breakMin > 0 ? next : fresh('work', t.cycle + 1) };
  }
  if (t.inserted) return { segment, next: fresh('work', t.cycle, true) }; // an unplanned break: back to the same session
  return { segment, next: lastWork ? { ...t, status: 'done' } : fresh('work', t.cycle + 1) };
}

/** Break now: end focus early (what was done is logged by the caller) and rest `min` minutes, then pick the same session back up. */
export function breakNow(t: PomoTimer, now: number, min: number, label = 'Break'): { segment: Segment; next: PomoTimer } | null {
  if (t.status === 'done' || t.phase !== 'work' || !(min > 0)) return null;
  const segment = segmentOf(t, now, false);
  const left = Math.max(60_000, remainingMs(t, now));
  return { segment, next: { ...t, phase: 'break', phaseStartedAt: now, pausedAt: null, pausedMs: 0, pauses: 0, label, status: 'running', extraMs: 0, inserted: true, breakOverrideMs: min * MIN_MS, workOverrideMs: left } };
}

/** Add 5, 10, 15 or 20 minutes to the break that is running. */
export function extendBreak(t: PomoTimer, min: number): PomoTimer {
  if (t.phase !== 'break' || t.status === 'done' || ![5, 10, 15, 20].includes(min)) return t;
  return { ...t, extraMs: (t.extraMs ?? 0) + min * MIN_MS };
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

export type Celebration = 'sparkle' | 'funny' | 'productive' | 'motivate' | 'rocket' | 'mega';
export type CelebrationMode = 'random' | 'sparkle' | 'off';

/**
 * What to show when a phase finishes. After an ordinary work session: a short surprise (sparkles, something funny,
 * productive or motivational, or a rocket to the moon). After the whole set you chose is finished, or every 4th
 * session of a run that has no end: the big one.
 */
export function celebrationFor(finished: PomoTimer, next: PomoTimer, rand: () => number = Math.random, mode: CelebrationMode = 'random'): Celebration | null {
  if (finished.phase !== 'work' || mode === 'off') return null;
  if (mode === 'sparkle') return 'sparkle';
  const sessions = (finished.doneWork ?? 0) + 1;
  const setDone = next.status === 'done' || (finished.cfg.repeats === null && sessions % 4 === 0);
  if (setDone) return 'mega';
  const pool: Celebration[] = ['sparkle', 'funny', 'productive', 'motivate', 'rocket'];
  return pool[Math.floor(rand() * pool.length)];
}
