// The single cron entry point (spec section 8): converts `now` to IST and
// runs whatever job is due this minute. Every job is wrapped in its own
// try/catch so one broken job never stops the others.
import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { addDays, istParts } from '@/lib/time';
import { getConfig } from '@/lib/domain/config';
import { notify } from '@/lib/notify';
import { claim } from './idempotency';
import { runHabitNudges, runReminders, runTaskReminderSafetyNet } from './reminders';
import { runMorningPlan } from './morning';
import { runNightlyReview } from './nightly';
import type { OwedByLabel, Wallet } from '@/lib/types/db';
import { drainOutbox, pollCalendar } from '@/lib/google/sync';
import { pullHabitCheckins } from '@/lib/google/habit-sync';

export type TickError = { job: string; error: string };
export type TickResult = { ran: string[]; skipped: string[]; errors: TickError[] };

/** HH:MM from a 'HH:MM:SS' app_config column, for a minute-level match. */
function hhmm(configTime: string): string {
  return configTime.slice(0, 5);
}

function isLastDayOfMonth(date: string): boolean {
  const [y, m] = date.split('-').map(Number);
  const tomorrow = addDays(date, 1);
  const [ty, tm] = tomorrow.split('-').map(Number);
  return ty !== y || tm !== m;
}

async function owedRowsDefensive(): Promise<OwedByLabel[]> {
  try {
    const { data, error } = await admin().from('v_owed_by_label').select('*');
    if (error) return [];
    return (data ?? []) as OwedByLabel[];
  } catch {
    return [];
  }
}

async function walletDefensive(): Promise<Wallet | null> {
  try {
    const { data, error } = await admin().from('v_wallet').select('*').maybeSingle();
    if (error) return null;
    return (data as Wallet) ?? null;
  } catch {
    return null;
  }
}

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
}

async function sendOwedSummary(tag: string): Promise<boolean> {
  const rows = await owedRowsDefensive();
  const wallet = await walletDefensive();
  const owedToMe = rows.filter((r) => r.owed > 0);
  const iOwe = rows.filter((r) => r.owed < 0);
  if (rows.length === 0 && !wallet) return false;
  const lines: string[] = ['## Month-end settle'];
  if (owedToMe.length) {
    lines.push('', '**Owed to me:**');
    for (const r of owedToMe) lines.push(`- ${r.label}: ${money(r.owed)}`);
  }
  if (iOwe.length) {
    lines.push('', '**I owe:**');
    for (const r of iOwe) lines.push(`- ${r.label}: ${money(-r.owed)}`);
  }
  lines.push('', `**Net:** ${money(wallet?.net ?? 0)}`);
  await notify({ title: 'Month-end settle', body: lines.join('\n'), tag, url: '/money' });
  return rows.some((r) => r.owed !== 0);
}

/** Runs one job, recording it in `ran`/`skipped`/`errors` regardless of
 * whether it threw. `fn` returns false when it decided to skip (e.g. the
 * idempotency key was already claimed by an earlier tick). */
async function runJob(
  name: string,
  result: TickResult,
  fn: () => Promise<boolean>,
): Promise<void> {
  try {
    const ran = await fn();
    (ran ? result.ran : result.skipped).push(name);
  } catch (e) {
    result.errors.push({ job: name, error: e instanceof Error ? e.message : String(e) });
  }
}

export async function runTick(now: Date = new Date()): Promise<TickResult> {
  const result: TickResult = { ran: [], skipped: [], errors: [] };
  const { date, time } = istParts(now);

  await runJob('reminders', result, async () => {
    const { sent } = await runReminders(now);
    return sent > 0;
  });

  await runJob('habit-nudges', result, async () => {
    const { sent } = await runHabitNudges(now);
    return sent > 0;
  });

  await runJob('task-reminder-safety-net', result, async () => {
    const { synced } = await runTaskReminderSafetyNet(now);
    return synced > 0;
  });

  const cfg = await getConfig();

  if (hhmm(cfg.morning_time) === time) {
    await runJob('morning', result, async () => {
      const jobErrors: TickError[] = [];
      const { ran } = await runMorningPlan(now, jobErrors);
      result.errors.push(...jobErrors);
      return ran;
    });
  }

  if (hhmm(cfg.night_time) === time) {
    await runJob('nightly', result, async () => {
      const jobErrors: TickError[] = [];
      const { ran } = await runNightlyReview(now, jobErrors);
      result.errors.push(...jobErrors);
      return ran;
    });
  }

  // Month-end settle: last day of the month, 20:00 IST.
  if (isLastDayOfMonth(date) && time === '20:00') {
    await runJob('settle', result, async () => {
      const jobKey = `settle:${date.slice(0, 7)}`;
      if (!(await claim(jobKey))) return false;
      await sendOwedSummary(jobKey);
      return true;
    });
  }

  // Settle follow-up: the morning after month-end, same morning_time slot,
  // repeated while any label is still non-zero.
  const yesterday = addDays(date, -1);
  if (isLastDayOfMonth(yesterday) && hhmm(cfg.morning_time) === time) {
    await runJob('settle-followup', result, async () => {
      const jobKey = `settle-followup:${date}`;
      if (!(await claim(jobKey))) return false;
      const stillOwed = await sendOwedSummary(jobKey);
      return stillOwed;
    });
  }

  // Calendar poll: every 10 minutes. drainOutbox/pollCalendar already return
  // zero-values without throwing when Google is unconfigured or not
  // connected, so the tick keeps working either way.
  if (Number(time.slice(3)) % 10 === 0) {
    await runJob('calendar-poll', result, async () => {
      const [{ changed }, { pushed }] = await Promise.all([pollCalendar(), drainOutbox()]);
      return changed > 0 || pushed > 0;
    });
  }

  // Google Tasks -> habits: same cadence, so a task ticked on the phone checks the habit in.
  if (Number(time.slice(3)) % 10 === 5) {
    await runJob('gtasks-pull', result, async () => (await pullHabitCheckins()).pulled > 0);
  }

  return result;
}
