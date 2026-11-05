// The period the Money dashboard looks at: a preset ("past 7 days", "this quarter") or any custom dates, plus the
// period just before it to compare against. Pure, so the server page and the picker share it.
import { addDays } from '@/lib/time';

export type RangePreset = 'week' | '7d' | '14d' | '30d' | '90d' | 'month' | 'last_month' | 'quarter' | 'last_quarter' | 'year' | 'custom';

export const RANGE_PRESETS: { id: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: '7d', label: 'Past 7 days' },
  { id: '14d', label: 'Past 14 days' },
  { id: '30d', label: 'Past 30 days' },
  { id: '90d', label: 'Past 90 days' },
  { id: 'month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'last_quarter', label: 'Last quarter' },
  { id: 'year', label: 'This year' },
];

export type MoneyRange = {
  key: RangePreset;
  from: string;
  to: string;
  label: string;
  days: number;
  /** the period just before, the same length (or the previous month / quarter / year when the range is one) */
  prevFrom: string;
  prevTo: string;
  prevLabel: string;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from) + 1;
const short = (d: string) => `${Number(d.slice(8))} ${SHORT[Number(d.slice(5, 7)) - 1]}`;

/** First day of the month `delta` months from the month of `date`. */
function monthStart(date: string, delta: number): { y: number; m: number } {
  const i = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 + delta;
  return { y: Math.floor(i / 12), m: (i % 12) + 1 };
}

function labelFor(from: string, to: string): string {
  const [fy, fm] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const [ty, tm] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];
  if (fy === ty && fm === tm && Number(from.slice(8)) === 1 && Number(to.slice(8)) === lastDay(ty, tm)) return `${MONTHS[fm - 1]} ${fy}`;
  if (fy === ty && Number(from.slice(8)) === 1 && fm % 3 === 1 && tm === fm + 2 && Number(to.slice(8)) === lastDay(ty, tm)) return `Q${(fm - 1) / 3 + 1} ${fy}`;
  return from === to ? `${short(from)} ${fy}` : `${short(from)}${fy === ty ? '' : ` ${fy}`} – ${short(to)} ${ty}`;
}

/** Turn what the URL says into a period. Anything unreadable falls back to this month. */
export function resolveRange(params: { range?: string; from?: string; to?: string; month?: string }, today: string): MoneyRange {
  const valid = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  let key: RangePreset = 'month';
  let from: string, to: string;
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const preset = params.range ?? (params.month === 'last' ? 'last_month' : params.month === 'this' ? 'month' : undefined);

  if (valid(params.from) && valid(params.to)) {
    [from, to] = params.from! <= params.to! ? [params.from!, params.to!] : [params.to!, params.from!];
    key = 'custom';
  } else {
    switch (preset) {
      case 'week': { const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; from = addDays(today, -dow); to = addDays(from, 6); key = 'week'; break; }
      case '7d': from = addDays(today, -6); to = today; key = '7d'; break;
      case '14d': from = addDays(today, -13); to = today; key = '14d'; break;
      case '30d': from = addDays(today, -29); to = today; key = '30d'; break;
      case '90d': from = addDays(today, -89); to = today; key = '90d'; break;
      case 'last_month': { const s = monthStart(today, -1); from = ymd(s.y, s.m, 1); to = ymd(s.y, s.m, lastDay(s.y, s.m)); key = 'last_month'; break; }
      case 'quarter': { const q = Math.floor((m - 1) / 3) * 3 + 1; from = ymd(y, q, 1); to = ymd(y, q + 2, lastDay(y, q + 2)); key = 'quarter'; break; }
      case 'last_quarter': { const q = Math.floor((m - 1) / 3) * 3 + 1; const s = monthStart(ymd(y, q, 1), -3); from = ymd(s.y, s.m, 1); const e = monthStart(from, 2); to = ymd(e.y, e.m, lastDay(e.y, e.m)); key = 'last_quarter'; break; }
      case 'year': from = ymd(y, 1, 1); to = ymd(y, 12, 31); key = 'year'; break;
      default: from = ymd(y, m, 1); to = ymd(y, m, lastDay(y, m)); key = 'month';
    }
  }

  const days = daysBetween(from, to);
  let prevFrom: string, prevTo: string;
  if (key === 'month' || key === 'last_month') { const s = monthStart(from, -1); prevFrom = ymd(s.y, s.m, 1); prevTo = ymd(s.y, s.m, lastDay(s.y, s.m)); }
  else if (key === 'quarter' || key === 'last_quarter') { const s = monthStart(from, -3); prevFrom = ymd(s.y, s.m, 1); const e = monthStart(prevFrom, 2); prevTo = ymd(e.y, e.m, lastDay(e.y, e.m)); }
  else if (key === 'year') { prevFrom = ymd(y - 1, 1, 1); prevTo = ymd(y - 1, 12, 31); }
  else { prevTo = addDays(from, -1); prevFrom = addDays(prevTo, -(days - 1)); }
  return { key, from, to, label: labelFor(from, to), days, prevFrom, prevTo, prevLabel: labelFor(prevFrom, prevTo) };
}

/** The query string that gives this period back. */
export function rangeQuery(r: Pick<MoneyRange, 'key' | 'from' | 'to'>): string {
  return r.key === 'custom' ? `?from=${r.from}&to=${r.to}` : `?range=${r.key}`;
}
