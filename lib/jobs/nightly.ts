// Nightly review (spec section 8): done vs planned, unfinished tasks, habits
// missed, today's sync conflicts, then asks for a journal entry + mood. The
// next free-text reply is picked up by lib/jobs/pending-reply.ts.
import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { istInstant, istParts } from '@/lib/time';
import { habitStatuses } from '@/lib/domain/habits';
import { notify } from '@/lib/notify';
import { claim } from './idempotency';
import { openPendingJournal } from './pending-reply';
import type { DailyPlan, TaskEvent } from '@/lib/types/db';

export type NightlyJobError = { job: string; error: string };
export type NightlyResult = { ran: boolean; errors: NightlyJobError[] };

async function syncConflictsToday(date: string): Promise<{ task_id: string | null; field: string }[]> {
  try {
    const from = istInstant(date, '00:00').toISOString();
    const to = istInstant(date, '23:59').toISOString();
    const { data, error } = await admin()
      .from('sync_conflicts')
      .select('task_id, field')
      .gte('at', from)
      .lte('at', to);
    if (error) return [];
    return (data ?? []) as { task_id: string | null; field: string }[];
  } catch {
    return [];
  }
}

export async function runNightlyReview(now: Date, errors: NightlyJobError[]): Promise<NightlyResult> {
  const { date } = istParts(now);
  const jobKey = `nightly:${date}`;
  if (!(await claim(jobKey))) return { ran: false, errors };

  const { data: planRow } = await admin().from('daily_plans').select('*').eq('plan_date', date).maybeSingle();
  const plan = (planRow as DailyPlan | null) ?? null;
  const plannedIds = new Set(plan?.task_ids ?? []);

  const { data: completedRows, error: eventsError } = await admin()
    .from('task_events')
    .select('task_id')
    .eq('event', 'completed')
    .gte('at', istInstant(date, '00:00').toISOString())
    .lte('at', istInstant(date, '23:59').toISOString());
  if (eventsError) errors.push({ job: 'nightly', error: `task_events: ${eventsError.message}` });
  const completedIds = new Set(((completedRows ?? []) as Pick<TaskEvent, 'task_id'>[]).map((r) => r.task_id));

  const plannedDone = [...plannedIds].filter((id) => completedIds.has(id)).length;

  // listTasks has no "by id list" filter, so fetch directly for the small
  // set of planned task ids instead.
  let unfinishedTasks: { id: string; title: string }[] = [];
  if (plan && plannedIds.size > 0) {
    const { data } = await admin()
      .from('tasks')
      .select('id, title')
      .in('id', [...plannedIds])
      .is('deleted_at', null)
      .neq('status', 'done');
    unfinishedTasks = (data ?? []) as { id: string; title: string }[];
  }

  const habits = await habitStatuses(date);
  const missedHabits = habits.filter((h) => h.due && !h.done && !h.skipped);

  const conflicts = await syncConflictsToday(date);

  const lines: string[] = ['## Nightly review'];
  if (plan) {
    lines.push(`- Planned ${plannedIds.size}, done ${plannedDone}.`);
  } else {
    lines.push('- No plan was recorded today.');
  }
  if (unfinishedTasks.length) {
    lines.push('', '**Unfinished:**');
    for (const t of unfinishedTasks) lines.push(`- ${t.title}`);
  }
  if (missedHabits.length) {
    lines.push('', '**Habits missed:**');
    for (const h of missedHabits) lines.push(`- ${h.emoji ?? ''} ${h.name}`.trim());
  }
  if (conflicts.length) {
    lines.push('', `**Sync conflicts today:** ${conflicts.length}`);
  }
  lines.push('', 'How was your day? A few lines, and a mood 1 to 5.');

  // Push action buttons carry one `id`, so Tomorrow/Next week/Drop (which
  // target a single task each) are offered per task from the chat feed's
  // card list rather than as buttons on this one aggregate notification —
  // the single unfinished task case still gets real buttons.
  const singleUnfinished = unfinishedTasks.length === 1 ? unfinishedTasks[0] : null;
  await notify({
    title: 'Nightly review',
    body: lines.join('\n'),
    tag: `nightly:${date}`,
    url: '/',
    id: singleUnfinished?.id,
    actions: singleUnfinished
      ? [
          { action: 'tomorrow', title: 'Tomorrow' },
          { action: 'next_week', title: 'Next week' },
          { action: 'drop', title: 'Drop' },
        ]
      : undefined,
    bypassQuietHours: true,
  });

  await openPendingJournal(date);

  return { ran: true, errors };
}
