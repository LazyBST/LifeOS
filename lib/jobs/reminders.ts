// Reminder-shaped cron jobs (spec section 8): explicit reminders, habit
// nudges, and a safety net that creates task reminders for timed tasks whose
// write path (lib/domain/tasks.ts createTask/updateTask) does not yet call
// `syncTaskReminders` itself.
import 'server-only';
import { notify } from '@/lib/notify';
import { admin } from '@/lib/supabase/admin';
import { istParts } from '@/lib/time';
import { dueReminders, listReminders, rollForward, syncTaskReminders } from '@/lib/domain/reminders';
import { habitsNeedingNudge } from '@/lib/domain/habits';
import { claim } from './idempotency';
import type { Task } from '@/lib/types/db';

const DONE_ACTIONS = [
  { action: 'done', title: 'Done' },
  { action: 'snooze1h', title: 'Snooze 1h' },
  { action: 'tomorrow', title: 'Tomorrow' },
];

/** Every tick: send reminders due now, bypassing quiet hours (spec section 8
 * — explicit reminders are one of the two exceptions). */
export async function runReminders(now: Date): Promise<{ sent: number }> {
  const due = await dueReminders(now);
  let sent = 0;
  for (const r of due) {
    await notify({
      title: 'Reminder',
      body: r.text,
      tag: `reminder:${r.id}`,
      url: r.task_id ? `/tasks/${r.task_id}` : undefined,
      actions: DONE_ACTIONS,
      id: r.task_id ?? r.id,
      bypassQuietHours: true,
    });
    await rollForward(r);
    sent += 1;
  }
  return { sent };
}

/** Every tick: nudge habits whose reminder_time matches this minute and are
 * not yet checked in. Claims `habit:<id>:<date>` so a habit fires once a
 * day even if several ticks land on the same minute. */
export async function runHabitNudges(now: Date): Promise<{ sent: number }> {
  const { date } = istParts(now);
  const due = await habitsNeedingNudge(now);
  let sent = 0;
  for (const h of due) {
    const ok = await claim(`habit:${h.id}:${date}`);
    if (!ok) continue;
    await notify({
      title: `${h.emoji ?? ''} ${h.name}`.trim(),
      body: 'Due today — tap to check in.',
      tag: `habit:${h.id}:${date}`,
      url: '/habits',
    });
    sent += 1;
  }
  return { sent };
}

/**
 * Safety net (spec section 8 / CONTRACTS.md task 6): the reminder rows for a
 * timed task are meant to be created when the task is saved
 * (`lib/domain/tasks.ts` should call `syncTaskReminders`, but does not yet),
 * so this re-derives them here for any task due within the next 24h that has
 * no pending reminder rows at all.
 */
export async function runTaskReminderSafetyNet(now: Date): Promise<{ synced: number }> {
  const horizon = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
  const { data, error } = await admin()
    .from('tasks')
    .select('*')
    .not('due_at', 'is', null)
    .lte('due_at', horizon)
    .gte('due_at', now.toISOString())
    .neq('status', 'done')
    .is('deleted_at', null)
    .limit(200);
  if (error) throw new Error(`task reminder safety net: ${error.message}`);
  const tasks = (data ?? []) as Task[];
  let synced = 0;
  for (const t of tasks) {
    const pending = await listReminders({ task_id: t.id });
    if (pending.length > 0) continue;
    await syncTaskReminders(t);
    synced += 1;
  }
  return { synced };
}
