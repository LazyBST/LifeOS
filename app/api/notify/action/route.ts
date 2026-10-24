// POST /api/notify/action — push notification action buttons (Done, Snooze
// 1h, Tomorrow, Next week, Drop, mood:1-5) call this directly, without the
// LLM (spec section 8, CONTRACTS.md "Part 2 contracts"). Called from the
// service worker, so auth rides on the request's cookies.
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { addDays, istDate } from '@/lib/time';
import { completeTask, deleteTask, getTaskOrThrow, updateTask } from '@/lib/domain/tasks';
import { createReminder } from '@/lib/domain/reminders';
import { setMood } from '@/lib/domain/journal';

const SIMPLE_ACTIONS = ['done', 'snooze1h', 'tomorrow', 'next_week', 'drop'] as const;
type SimpleAction = (typeof SIMPLE_ACTIONS)[number];
const MOOD_RE = /^mood:([1-5])$/;

function isSimpleAction(a: string): a is SimpleAction {
  return (SIMPLE_ACTIONS as readonly string[]).includes(a);
}

function shiftDueDate(dueAt: string | null, days: number): string | null {
  if (!dueAt) return null;
  return new Date(new Date(dueAt).getTime() + days * 86_400_000).toISOString();
}

async function shiftTask(id: string, days: number): Promise<string> {
  const task = await getTaskOrThrow(id);
  const due_date = addDays(istDate(), days);
  const due_at = shiftDueDate(task.due_at, days);
  await updateTask(id, { due_date, due_at });
  return `Moved "${task.title}" to ${due_date}.`;
}

/** Dispatches an allowlisted action to its domain function. Never evals or
 * otherwise interprets `action` as code — every branch is a fixed case. */
async function dispatch(action: string, id: string): Promise<string> {
  const moodMatch = MOOD_RE.exec(action);
  if (moodMatch) {
    await setMood(istDate(), Number(moodMatch[1]));
    return `Mood logged: ${moodMatch[1]}/5.`;
  }
  if (!isSimpleAction(action)) {
    throw new Error(`Unknown action "${action}"`);
  }
  switch (action) {
    case 'done': {
      const task = await completeTask(id);
      return `Done: ${task.title}.`;
    }
    case 'snooze1h': {
      const task = await getTaskOrThrow(id);
      const remind_at = new Date(Date.now() + 60 * 60_000).toISOString();
      await createReminder({ text: `Reminder: ${task.title}`, remind_at, task_id: task.id });
      return `Snoozed "${task.title}" for 1 hour.`;
    }
    case 'tomorrow':
      return shiftTask(id, 1);
    case 'next_week':
      return shiftTask(id, 7);
    case 'drop': {
      const task = await deleteTask(id);
      return `Dropped "${task.title}".`;
    }
  }
}

function parseBody(value: unknown): { action: string; id: string } | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.action !== 'string' || !v.action) return null;
  if (typeof v.id !== 'string' || !v.id) return null;
  return { action: v.action, id: v.id };
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body = parseBody(json);
  if (!body) {
    return NextResponse.json({ error: 'Expected {action, id}' }, { status: 400 });
  }

  try {
    const message = await dispatch(body.action, body.id);
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
