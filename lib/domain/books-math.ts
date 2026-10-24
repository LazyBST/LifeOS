// Pure reading maths: progress, pace, finish estimate, and the pace needed to hit a target date.
import { addDays, daysBetween } from '@/lib/time';

export function progressPct(current: number, total: number | null | undefined): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((current / total) * 100));
}

export type Session = { read_on: string; pages: number };

/** Average pages per calendar day over the last `windowDays` days (days without reading count as zero). */
export function pagesPerDay(sessions: Session[], today: string, windowDays = 14): number {
  const from = addDays(today, -(windowDays - 1));
  const pages = sessions.filter((s) => s.read_on >= from && s.read_on <= today).reduce((n, s) => n + s.pages, 0);
  return pages / windowDays;
}

/** Date the book will be finished at the current pace; null when there is no pace or no page count. */
export function estimatedFinish(current: number, total: number | null | undefined, pace: number, today: string): string | null {
  if (!total || current >= total) return null;
  if (pace <= 0) return null;
  return addDays(today, Math.ceil((total - current) / pace));
}

/** Pages per day needed from today to finish on `target`; null when it cannot be computed. */
export function pagesNeededPerDay(current: number, total: number | null | undefined, target: string | null | undefined, today: string): number | null {
  if (!total || !target || current >= total) return null;
  const days = Math.max(1, daysBetween(today, target) + 1);
  return Math.ceil((total - current) / days);
}

export type Verdict = 'finished' | 'on_track' | 'behind' | 'no_pace' | 'no_target';

/** On track when the estimated finish is on or before the target. */
export function verdict(args: { current: number; total: number | null; target: string | null; pace: number; today: string }): Verdict {
  const { current, total, target, pace, today } = args;
  if (total && current >= total) return 'finished';
  if (!target) return 'no_target';
  const eta = estimatedFinish(current, total, pace, today);
  if (!eta) return 'no_pace';
  return eta <= target ? 'on_track' : 'behind';
}

/** Clamp a page update: never negative, never past the total. */
export function clampPage(page: number, total: number | null | undefined): number {
  const p = Math.max(0, Math.floor(page));
  return total ? Math.min(p, total) : p;
}
