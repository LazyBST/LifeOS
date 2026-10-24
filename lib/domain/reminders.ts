import 'server-only';
import { admin } from '@/lib/supabase/admin';
import type { Reminder, UUID } from '@/lib/types/db';

export type ReminderInput = {
  text: string;
  remind_at: string;
  task_id?: UUID | null;
  habit_id?: UUID | null;
  recurrence?: 'daily' | 'weekdays' | 'weekly' | null;
};

export async function createReminder(input: ReminderInput): Promise<Reminder> {
  const { data, error } = await admin()
    .from('reminders')
    .insert({
      text: input.text,
      remind_at: input.remind_at,
      task_id: input.task_id ?? null,
      habit_id: input.habit_id ?? null,
      recurrence: input.recurrence ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`reminder_create: ${error.message}`);
  return data as Reminder;
}

export async function listReminders(opts: { pending?: boolean; task_id?: UUID } = {}): Promise<Reminder[]> {
  let q = admin().from('reminders').select('*');
  if (opts.pending !== false) q = q.is('sent_at', null).is('cancelled_at', null);
  if (opts.task_id) q = q.eq('task_id', opts.task_id);
  const { data, error } = await q.order('remind_at');
  if (error) throw new Error(`reminders: ${error.message}`);
  return data as Reminder[];
}

export async function cancelReminder(id: UUID): Promise<Reminder> {
  const { data, error } = await admin()
    .from('reminders')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`reminder_cancel: ${error.message}`);
  return data as Reminder;
}

/** Reminders that are due now and have not been sent or cancelled. */
export async function dueReminders(now = new Date()): Promise<Reminder[]> {
  const { data, error } = await admin()
    .from('reminders')
    .select('*')
    .lte('remind_at', now.toISOString())
    .is('sent_at', null)
    .is('cancelled_at', null)
    .order('remind_at')
    .limit(50);
  if (error) throw new Error(`reminders due: ${error.message}`);
  return data as Reminder[];
}

export async function markSent(id: UUID): Promise<void> {
  await admin().from('reminders').update({ sent_at: new Date().toISOString() }).eq('id', id);
}

/** Next occurrence for a recurring reminder, or null for a one-off. */
export function nextOccurrence(remindAt: string, recurrence: Reminder['recurrence']): string | null {
  if (!recurrence) return null;
  const d = new Date(remindAt);
  const add = (days: number) => new Date(d.getTime() + days * 86_400_000);
  switch (recurrence) {
    case 'daily':
      return add(1).toISOString();
    case 'weekly':
      return add(7).toISOString();
    case 'weekdays': {
      let next = add(1);
      // skip Saturday and Sunday in IST
      for (let i = 0; i < 7; i++) {
        const ist = new Date(next.getTime() + 330 * 60_000).getUTCDay();
        if (ist !== 0 && ist !== 6) break;
        next = new Date(next.getTime() + 86_400_000);
      }
      return next.toISOString();
    }
  }
}

export async function rollForward(r: Reminder): Promise<void> {
  const next = nextOccurrence(r.remind_at, r.recurrence);
  await markSent(r.id);
  if (next) {
    await createReminder({
      text: r.text,
      remind_at: next,
      task_id: r.task_id,
      habit_id: r.habit_id,
      recurrence: r.recurrence,
    });
  }
}

/**
 * Keeps a task's clock-time reminders in step with the task (spec section 8):
 * one at `due_at` and one 15 minutes before. Cancels the old pair first, so
 * moving or clearing `due_at` updates them.
 */
export async function syncTaskReminders(task: {
  id: UUID;
  title: string;
  due_at: string | null;
  status: string;
  deleted_at: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await admin()
    .from('reminders')
    .update({ cancelled_at: now })
    .eq('task_id', task.id)
    .is('sent_at', null)
    .is('cancelled_at', null);
  if (!task.due_at || task.status === 'done' || task.deleted_at) return;
  const at = new Date(task.due_at);
  const before = new Date(at.getTime() - 15 * 60_000);
  if (before.getTime() > Date.now()) {
    await createReminder({ text: `In 15 minutes: ${task.title}`, remind_at: before.toISOString(), task_id: task.id });
  }
  if (at.getTime() > Date.now()) {
    await createReminder({ text: `Now: ${task.title}`, remind_at: at.toISOString(), task_id: task.id });
  }
}
