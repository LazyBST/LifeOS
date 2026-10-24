// undo_last (spec section 7 tool table): reverses the latest `agent_actions`
// rows using their stored `before` state. Exempt from audit logging itself
// (see lib/agent/registry.ts READONLY_TOOLS) so undoing never creates a new
// undoable action.
import 'server-only';
import { z } from 'zod';
import type { ToolDef } from '../types';
import { latestActions, markUndone } from '../audit';
import { deleteGoal, restoreGoal, updateGoal, type GoalPatch } from '@/lib/domain/goals';
import { deleteProject, restoreProject, updateProject, type ProjectPatch } from '@/lib/domain/projects';
import { deleteTask, restoreTask, updateTask, type TaskPatch } from '@/lib/domain/tasks';
import { setNotes } from '@/lib/domain/notes';
import { archiveHabit, updateHabit, type HabitPatch } from '@/lib/domain/habits';
import { writeJournal } from '@/lib/domain/journal';
import { undoLogReading } from '@/lib/domain/books';
import type { Book } from '@/lib/types/db';
import { setPriority } from '@/lib/domain/priorities';
import { setImprovement } from '@/lib/domain/improvement';
import { cancelReminder } from '@/lib/domain/reminders';
import { deleteTransaction } from '@/lib/domain/money';
import { admin } from '@/lib/supabase/admin';
import type { AgentAction, Goal, Habit, HabitCheckin, Project, Reminder, Task, Transaction } from '@/lib/types/db';

function goalPatch(g: Goal): GoalPatch {
  return {
    title: g.title, emoji: g.emoji, description: g.description, area_id: g.area_id,
    status: g.status, priority: g.priority, start_date: g.start_date, target_date: g.target_date,
    notes_md: g.notes_md,
  };
}

function projectPatch(p: Project): ProjectPatch {
  return {
    goal_id: p.goal_id, title: p.title, emoji: p.emoji, description: p.description, area_id: p.area_id,
    status: p.status, priority: p.priority, start_date: p.start_date, target_date: p.target_date,
    notes_md: p.notes_md,
  };
}

function habitPatch(h: Habit): HabitPatch {
  return {
    name: h.name, emoji: h.emoji, time_of_day: h.time_of_day, kind: h.kind, target_value: h.target_value,
    unit: h.unit, days_of_week: h.days_of_week, reminder_time: h.reminder_time, area_id: h.area_id,
    goal_id: h.goal_id, archived_at: h.archived_at,
  };
}

function taskPatch(t: Task): TaskPatch {
  return {
    title: t.title, project_id: t.project_id, goal_id: t.goal_id, parent_task_id: t.parent_task_id,
    area_id: t.area_id, status: t.status, priority: t.priority, due_date: t.due_date, due_at: t.due_at,
    duration_min: t.duration_min, estimate_min: t.estimate_min, notes_md: t.notes_md, tags: t.tags,
    completed_at: t.completed_at,
  };
}

async function reverseOne(action: AgentAction): Promise<string> {
  switch (action.tool) {
    case 'goal_create': {
      const after = action.after as Goal;
      await deleteGoal(after.id);
      return `Removed goal "${after.title}"`;
    }
    case 'goal_update': {
      const before = action.before as Goal;
      await updateGoal(before.id, goalPatch(before));
      return `Reverted goal "${before.title}"`;
    }
    case 'goal_delete': {
      const before = action.before as Goal;
      await restoreGoal(before.id);
      return `Restored goal "${before.title}"`;
    }
    case 'project_create': {
      const after = action.after as Project;
      await deleteProject(after.id);
      return `Removed project "${after.title}"`;
    }
    case 'project_update': {
      const before = action.before as Project;
      await updateProject(before.id, projectPatch(before));
      return `Reverted project "${before.title}"`;
    }
    case 'project_delete': {
      const before = action.before as Project;
      await restoreProject(before.id);
      return `Restored project "${before.title}"`;
    }
    case 'task_create': {
      const after = action.after as Task;
      await deleteTask(after.id);
      return `Removed task "${after.title}"`;
    }
    case 'task_update':
    case 'task_complete':
    case 'task_reopen': {
      const before = action.before as Task;
      await updateTask(before.id, taskPatch(before));
      return `Reverted "${before.title}"`;
    }
    case 'task_delete': {
      const before = action.before as Task;
      await restoreTask(before.id);
      return `Restored "${before.title}"`;
    }
    case 'notes_append': {
      const before = action.before as { type: 'goal' | 'project' | 'task'; id: string; before: string };
      await setNotes(before.type, before.id, before.before);
      return 'Reverted a note';
    }
    case 'habit_create': {
      const after = action.after as Habit;
      await archiveHabit(after.id);
      return `Archived habit "${after.name}"`;
    }
    case 'habit_update': {
      const before = action.before as Habit;
      await updateHabit(before.id, habitPatch(before));
      return `Reverted habit "${before.name}"`;
    }
    case 'habit_checkin': {
      const before = action.before as HabitCheckin | null;
      const after = action.after as HabitCheckin;
      if (before) {
        await admin().from('habit_checkins').update({ value: before.value, note: before.note }).eq('id', after.id);
        return 'Reverted a habit check-in';
      }
      await admin().from('habit_checkins').delete().eq('id', after.id);
      return 'Removed a habit check-in';
    }
    case 'journal_write': {
      const before = action.before as { date: string; before: string | null; mood: number | null };
      if (before.before === null) {
        await admin().from('journal_entries').delete().eq('entry_date', before.date);
        return 'Removed a journal entry';
      }
      await writeJournal({ date: before.date, body_md: before.before, mood: before.mood, mode: 'replace' });
      return 'Reverted a journal entry';
    }
    case 'book_add': {
      const after = action.after as { id: string };
      await admin().from('books').update({ deleted_at: new Date().toISOString() }).eq('id', after.id);
      return 'Removed the book you added';
    }
    case 'book_update': {
      const before = action.before as Book;
      await admin().from('books').update({ title: before.title, author: before.author, status: before.status, rating: before.rating, total_pages: before.total_pages, current_page: before.current_page, target_date: before.target_date, area_id: before.area_id, started_on: before.started_on, finished_on: before.finished_on }).eq('id', before.id);
      return `Reverted "${before.title}"`;
    }
    case 'book_log_reading': {
      const logId = (action.after as { logId?: string } | null)?.logId;
      const before = action.before as Book;
      if (logId) await undoLogReading(logId);
      await admin().from('books').update({ status: before.status, current_page: before.current_page, started_on: before.started_on, finished_on: before.finished_on }).eq('id', before.id);
      return 'Took back the pages you logged';
    }
    case 'book_link': {
      const after = action.after as { book_id: string; type: 'goal' | 'project' | 'task' | 'habit'; entity_id: string };
      await admin().from('book_links').delete().eq('book_id', after.book_id).eq('entity_type', after.type).eq('entity_id', after.entity_id);
      return 'Removed the book link';
    }
    case 'top3_set':
    case 'top3_toggle': {
      const before = action.before as { date: string; items: ({ position: number; text: string; task_id: string | null; done: boolean } | null)[] };
      for (let i = 0; i < 3; i++) {
        const it = before.items[i];
        await setPriority(before.date, (i + 1) as 1 | 2 | 3, it?.text ?? '', it?.task_id);
        if (it?.done) await admin().from('daily_priorities').update({ done_at: new Date().toISOString() }).eq('plan_date', before.date).eq('position', i + 1);
      }
      return 'Restored the top 3';
    }
    case 'improvement_set': {
      const before = action.before as { date: string; improvement: string | null };
      await setImprovement(before.date, before.improvement ?? '');
      return 'Reverted the improvement';
    }
    case 'reminder_create': {
      const after = action.after as Reminder;
      await cancelReminder(after.id);
      return `Cancelled reminder "${after.text}"`;
    }
    case 'expense_add':
    case 'income_add':
    case 'settle': {
      const after = action.after as Transaction;
      await deleteTransaction(after.id);
      return `Removed ${action.tool === 'expense_add' ? 'expense' : action.tool === 'income_add' ? 'income' : 'settlement'} of ${after.amount}`;
    }
    default:
      return `Nothing to undo for "${action.tool}"`;
  }
}

const undoLastSchema = z.object({ count: z.number().int().positive().max(10).optional() });

const undoLast: ToolDef<typeof undoLastSchema> = {
  name: 'undo_last',
  description: 'Reverts the most recent action(s) the agent took, using the audit trail.',
  schema: undoLastSchema,
  part: 1,
  handler: async (input) => {
    const actions = await latestActions(input.count ?? 1);
    if (actions.length === 0) return { message: 'Nothing to undo.' };
    const lines: string[] = [];
    for (const action of actions) {
      try {
        lines.push(await reverseOne(action));
      } catch (e) {
        lines.push(`Could not undo "${action.tool}": ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await markUndone(action.id);
      }
    }
    return { message: lines.join('\n'), data: { undone: actions.length } };
  },
};

export const undoTools: ToolDef[] = [undoLast];
