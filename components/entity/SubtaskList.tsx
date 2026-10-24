'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { completeTaskAction, createTaskAction, reopenTaskAction } from '@/app/actions/tasks';
import type { Task } from '@/lib/types/db';

type SubtaskListProps = {
  parentTaskId: string;
  initial: Task[];
  /** Linkage for a new subtask; inherited from the parent task server-side too. */
  areaId?: string | null;
  goalId?: string | null;
  projectId?: string | null;
};

/** Checkbox list of subtasks plus an "Add subtask" row, used on the Task page. */
export function SubtaskList({ parentTaskId, initial, areaId, goalId, projectId }: SubtaskListProps) {
  const [tasks, setTasks] = useState(initial);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();

  async function toggle(task: Task) {
    const willBeDone = task.status !== 'done';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: willBeDone ? 'done' : 'todo' } : t)));
    const res = willBeDone ? await completeTaskAction(task.id) : await reopenTaskAction(task.id);
    if (!res.ok) {
      toast.error(res.error || 'Could not update subtask');
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? res.data : t)));
  }

  function addSubtask() {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    startTransition(async () => {
      const res = await createTaskAction({
        title,
        parent_task_id: parentTaskId,
        area_id: areaId ?? null,
        goal_id: goalId ?? null,
        project_id: projectId ?? null,
      });
      if (!res.ok) {
        toast.error(res.error || 'Could not add subtask');
        return;
      }
      setTasks((prev) => [...prev, res.data]);
    });
  }

  return (
    <div className="space-y-1">
      {tasks.length === 0 && <p className="py-1 text-sm text-muted-foreground">No subtasks yet.</p>}
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
          <Checkbox checked={task.status === 'done'} onCheckedChange={() => toggle(task)} />
          <Link
            href={`/tasks/${task.id}`}
            className={cn('flex-1 truncate text-sm', task.status === 'done' && 'text-muted-foreground line-through')}
          >
            {task.title}
          </Link>
        </div>
      ))}
      <div className="flex items-center gap-2 px-1.5 pt-1">
        <Plus className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={draft}
          placeholder="Add subtask"
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addSubtask();
          }}
          className="h-7 border-none bg-transparent px-1 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

export default SubtaskList;
