'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { istInstant, istParts } from '@/lib/time';
import { Input } from '@/components/ui/input';
import { updateTaskAction } from '@/app/actions/tasks';

type DueDateTimeProps = {
  taskId: string;
  dueDate: string | null;
  dueAt: string | null;
};

/**
 * Combined due-date + clock-time editor for the Task page. Kept as one
 * component (rather than two independent InlineDate fields) so a time edit
 * always has the matching date to build `due_at` from.
 */
export function DueDateTime({ taskId, dueDate, dueAt }: DueDateTimeProps) {
  const timeFromDueAt = (at: string | null) => (at ? istParts(new Date(at)).time : '');

  const [date, setDate] = useState(dueDate ?? '');
  const [time, setTime] = useState(timeFromDueAt(dueAt));
  const [saving, setSaving] = useState(false);

  useEffect(() => setDate(dueDate ?? ''), [dueDate]);
  useEffect(() => setTime(timeFromDueAt(dueAt)), [dueAt]);

  async function commit(nextDate: string, nextTime: string) {
    const due_date = nextDate || null;
    const due_at = nextDate && nextTime ? istInstant(nextDate, nextTime).toISOString() : null;
    if (due_date === (dueDate ?? null) && due_at === (dueAt ?? null)) return;
    setSaving(true);
    const res = await updateTaskAction(taskId, { due_date, due_at });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || 'Could not save due date');
      setDate(dueDate ?? '');
      setTime(timeFromDueAt(dueAt));
    }
  }

  return (
    <span className="flex items-center gap-1.5">
      <Input
        type="date"
        value={date}
        disabled={saving}
        onChange={(e) => setDate(e.target.value)}
        onBlur={() => commit(date, time)}
        className="h-7 w-auto text-sm"
      />
      <Input
        type="time"
        value={time}
        disabled={saving || !date}
        onChange={(e) => setTime(e.target.value)}
        onBlur={() => commit(date, time)}
        className="h-7 w-auto text-sm"
      />
    </span>
  );
}

export default DueDateTime;
