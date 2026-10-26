'use server';

import { requireUser } from '@/lib/auth';
import { focusDay, focusWeek, getRun, logSegment, saveRun, type FocusDay, type RunDoc } from '@/lib/domain/pomodoro';
import type { Segment } from '@/lib/domain/pomodoro-math';
import { istDate } from '@/lib/time';
import { type ActionResult, run } from './_result';

export async function logPomodoroSegmentAction(seg: Segment): Promise<ActionResult<null>> {
  return run(async () => { await requireUser(); await logSegment(seg); return null; });
}

export async function focusDayAction(date?: string): Promise<ActionResult<FocusDay & { week: { date: string; workMin: number; sessions: number }[] }>> {
  return run(async () => {
    await requireUser();
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : istDate();
    const [d, week] = await Promise.all([focusDay(day), focusWeek(day).catch(() => [])]);
    return { ...d, week };
  });
}

/** The timer that is running (or not) for this account, with the server's clock so every device agrees on the time. */
export async function pomodoroGetRunAction(): Promise<ActionResult<RunDoc & { now: number }>> {
  return run(async () => { await requireUser(); return { ...(await getRun()), now: Date.now() }; });
}

export async function pomodoroSaveRunAction(timer: Record<string, unknown> | null, rev: number): Promise<ActionResult<RunDoc>> {
  return run(async () => { await requireUser(); return saveRun(timer, rev); });
}
