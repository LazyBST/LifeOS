// Weekly trend helpers shared by the life-areas report and the money trend.
import { addDays } from '@/lib/time';
import { weekStart } from './lifecal-math';

/** Mondays of the last `n` weeks, oldest first, ending with the week containing `today`. */
export function lastWeeks(today: string, n: number): string[] {
  const cur = weekStart(today);
  return Array.from({ length: n }, (_, i) => addDays(cur, -7 * (n - 1 - i)));
}

/** Least-squares line through the last `lookback` points, extended `ahead` steps; never below `floor`. */
export function linearForecast(values: number[], ahead: number, lookback = 6, floor = 0): number[] {
  const ys = values.slice(-lookback);
  const n = ys.length;
  if (n === 0) return Array(ahead).fill(floor);
  if (n === 1) return Array(ahead).fill(Math.max(floor, ys[0]));
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  return Array.from({ length: ahead }, (_, k) => Math.max(floor, Math.round((my + slope * (n - 1 + (k + 1) - mx)) * 100) / 100));
}

/** Index of the Monday bucket a date falls in, or -1. */
export function bucketIndex(weeks: string[], date: string): number {
  const ws = weekStart(date);
  return weeks.indexOf(ws);
}
