// Pure maths for the life calendar widget. One dot per day, week or month; its colour is the
// share of that period's scheduled items that got done (green >= 70%, yellow 50-70%, red < 50%).
import { addDays, daysBetween } from '@/lib/time';
import { dayScore } from './schedule-math';

/** pushed = scheduled that day but not finished that day (moved, overdue, finished late, habit not ticked): it counts as −1 */
export type DayStat = { total: number; done: number; pushed?: number };
export type DotColor = 'green' | 'yellow' | 'red' | 'empty';
export const GREEN_MIN = 0.7;
export const YELLOW_MIN = 0.5;

export function pct(s: DayStat | undefined): number | null {
  return dayScore(s ? { total: s.total, done: s.done, pushed: s.pushed ?? 0 } : undefined);
}

/** Empty when there is no data, or the period is entirely in the future. */
export function classify(s: DayStat | undefined): DotColor {
  const p = pct(s);
  if (p === null) return 'empty';
  if (p >= GREEN_MIN) return 'green';
  if (p >= YELLOW_MIN) return 'yellow';
  return 'red';
}

export function sumStats(stats: (DayStat | undefined)[]): DayStat {
  return stats.reduce<DayStat>((a, s) => (s ? { total: a.total + s.total, done: a.done + s.done, pushed: (a.pushed ?? 0) + (s.pushed ?? 0) } : a), { total: 0, done: 0, pushed: 0 });
}

export type View = 'life' | 'year' | 'month' | 'week';
export type Gran = 'day' | 'sub'; // 'sub' = months in a year view, weeks in a month view

export type Cell = { key: string; label: string; from: string; to: string };
export type Row = { label: string; cells: Cell[] };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const monthStart = (y: number, m: number) => ymd(y, m, 1);
export const monthEnd = (y: number, m: number) => ymd(y, m, daysInMonth(y, m));
export const monthName = (m: number) => MONTHS[m - 1];

/** Monday of the week containing the date. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun
  return addDays(date, -((dow + 6) % 7));
}

/** Same month/day `years` later; Feb 29 falls back to Feb 28. */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const ny = y + years;
  return ymd(ny, m, Math.min(d, daysInMonth(ny, m)));
}

function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const dayCell = (d: string): Cell => ({ key: d, label: `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`, from: d, to: d });

/**
 * Life view: one row per year of life, 52 weekly dots each. Year n starts on the nth birthday; the
 * last dot of a row absorbs the 1-2 leftover days so rows tile the whole life.
 */
export function lifeRows(birth: string, lifespanYears: number): Row[] {
  const rows: Row[] = [];
  for (let age = 0; age < lifespanYears; age++) {
    const start = addYears(birth, age);
    const nextBirthday = addYears(birth, age + 1);
    const cells: Cell[] = [];
    for (let w = 0; w < 52; w++) {
      const from = addDays(start, w * 7);
      const to = w === 51 ? addDays(nextBirthday, -1) : addDays(from, 6);
      cells.push({ key: from, label: `Age ${age}, week ${w + 1}`, from, to });
    }
    rows.push({ label: String(age), cells });
  }
  return rows;
}

export function yearRows(year: number, gran: Gran): Row[] {
  if (gran === 'sub') {
    return [{ label: String(year), cells: Array.from({ length: 12 }, (_, i) => ({ key: `${year}-${pad(i + 1)}`, label: `${MONTHS[i]} ${year}`, from: monthStart(year, i + 1), to: monthEnd(year, i + 1) })) }];
  }
  return Array.from({ length: 12 }, (_, i) => ({ label: MONTHS[i], cells: dayRange(monthStart(year, i + 1), monthEnd(year, i + 1)).map(dayCell) }));
}

export function monthRows(year: number, month: number, gran: Gran): Row[] {
  const from = monthStart(year, month), to = monthEnd(year, month);
  if (gran === 'day') return [{ label: `${MONTHS[month - 1]} ${year}`, cells: dayRange(from, to).map(dayCell) }];
  const cells: Cell[] = [];
  for (let ws = weekStart(from); ws <= to; ws = addDays(ws, 7)) {
    const f = ws < from ? from : ws;
    const t = addDays(ws, 6) > to ? to : addDays(ws, 6);
    cells.push({ key: ws, label: `${dayCell(f).label} – ${dayCell(t).label}`, from: f, to: t });
  }
  return [{ label: `${MONTHS[month - 1]} ${year}`, cells }];
}

export function weekRows(anyDate: string): Row[] {
  const ws = weekStart(anyDate);
  return [{ label: 'Week', cells: dayRange(ws, addDays(ws, 6)).map(dayCell) }];
}

export function rowsFor(view: View, gran: Gran, cursor: string, birth: string | null, lifespan: number): Row[] {
  const [y, m] = cursor.split('-').map(Number);
  if (view === 'life') return birth ? lifeRows(birth, lifespan) : [];
  if (view === 'year') return yearRows(y, gran);
  if (view === 'month') return monthRows(y, m, gran);
  return weekRows(cursor);
}

/** Date span that must be loaded to colour a set of rows. */
export function spanOf(rows: Row[]): { from: string; to: string } | null {
  const cells = rows.flatMap((r) => r.cells);
  if (!cells.length) return null;
  return { from: cells[0].from, to: cells[cells.length - 1].to };
}

export function cellStat(c: Cell, days: Record<string, DayStat>, today: string): DayStat | undefined {
  if (c.from > today) return undefined; // future: empty
  const to = c.to > today ? today : c.to;
  const n = daysBetween(c.from, to);
  const stats: DayStat[] = [];
  for (let i = 0; i <= n; i++) { const s = days[addDays(c.from, i)]; if (s) stats.push(s); }
  const sum = sumStats(stats);
  return sum.total > 0 ? sum : undefined;
}

export function weeksLived(birth: string, today: string): number {
  return Math.max(0, Math.floor(daysBetween(birth, today) / 7));
}
