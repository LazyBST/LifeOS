'use server';

import { requireUser } from '@/lib/auth';
import { focusDay, focusWeek, logSegment, type FocusDay } from '@/lib/domain/pomodoro';
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
