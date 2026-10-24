// IST date/time helpers and natural-language date parsing (spec sections 3, 7).
// Pure module: no server-only imports, so both the UI and the agent can use it.
import * as chrono from 'chrono-node';

export const TZ = 'Asia/Kolkata';
/** IST is a fixed +05:30 offset with no DST, which keeps this arithmetic exact. */
export const IST_OFFSET_MIN = 330;

/** 'YYYY-MM-DD' for the given instant, in IST. */
export function istDate(at: Date = new Date()): string {
  return istParts(at).date;
}

/** 'HH:MM' for the given instant, in IST. */
export function istTime(at: Date = new Date()): string {
  return istParts(at).time;
}

export function istParts(at: Date = new Date()): {
  date: string;
  time: string;
  hour: number;
  minute: number;
  /** 1 = Monday .. 7 = Sunday, matching habits.days_of_week */
  isoDow: number;
} {
  const shifted = new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
  const date = shifted.toISOString().slice(0, 10);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const dow = shifted.getUTCDay(); // 0 = Sunday
  return {
    date,
    time: `${pad(hour)}:${pad(minute)}`,
    hour,
    minute,
    isoDow: dow === 0 ? 7 : dow,
  };
}

/** Instant for an IST wall-clock date and time. */
export function istInstant(date: string, time = '00:00'): Date {
  const [h, m] = time.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h || 0, m || 0) - IST_OFFSET_MIN * 60_000);
}

/** Add whole days to a 'YYYY-MM-DD' string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export type ParsedDate = {
  /** 'YYYY-MM-DD' in IST */
  date: string;
  /** ISO instant, only when the text carried a clock time */
  at: string | null;
  /** true when the text specified an hour */
  hasTime: boolean;
  /** how it should be echoed back to the user */
  text: string;
};

/**
 * Parse natural language ("tomorrow 4pm", "next Friday") relative to now in IST.
 * Returns null when nothing date-like is found (spec section 7).
 */
export function parseDateIST(input: string, now: Date = new Date()): ParsedDate | null {
  const text = input.trim();
  if (!text) return null;
  // Parse against an explicit IST reference so the result does not depend on
  // the server process's own timezone.
  const results = chrono.parse(
    text,
    { instant: now, timezone: IST_OFFSET_MIN },
    { forwardDate: true },
  );
  if (results.length === 0) return null;
  const { start } = results[0];
  const y = start.get('year');
  const mo = start.get('month');
  const d = start.get('day');
  if (y == null || mo == null || d == null) return null;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  if (!start.isCertain('hour')) {
    return { date, at: null, hasTime: false, text: formatDate(date) };
  }
  const time = `${pad(start.get('hour') ?? 0)}:${pad(start.get('minute') ?? 0)}`;
  return {
    date,
    at: istInstant(date, time).toISOString(),
    hasTime: true,
    text: `${formatDate(date)} ${time} IST`,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-10-25' -> '25 Oct 2026' */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** A short human label used on cards: Today, Tomorrow, Overdue dates, else '25 Oct'. */
export function dueLabel(date: string | null, today = istDate()): string | null {
  if (!date) return null;
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return y === Number(today.slice(0, 4)) ? base : `${base} ${y}`;
}

export function isOverdue(date: string | null, today = istDate()): boolean {
  return !!date && date < today;
}
