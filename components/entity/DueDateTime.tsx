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
  /** length of the time block in minutes (start = due time, end = start + duration) */
  durationMin?: number | null;
};

/**
 * Combined due-date + clock-time editor for the Task page. Kept as one
 * component (rather than two independent InlineDate fields) so a time edit
 * always has the matching date to build `due_at` from.
 */
export function DueDateTime({ taskId, dueDate, dueAt, durationMin }: DueDateTimeProps) {
  const timeFromDueAt = (at: string | null) => (at ? istParts(new Date(at)).time : '');

  const [date, setDate] = useState(dueDate ?? '');
  const [time, setTime] = useState(timeFromDueAt(dueAt));
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const endFrom = (t: string, dur: number | null | undefined) => {
    if (!t) return '';
    const e = toMin(t) + (dur ?? 30);
    return e >= 24 * 60 ? '23:59' : `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`;
  };
  const [end, setEnd] = useState(endFrom(timeFromDueAt(dueAt), durationMin));
  const [saving, setSaving] = useState(false);

  useEffect(() => setDate(dueDate ?? ''), [dueDate]);
  useEffect(() => setTime(timeFromDueAt(dueAt)), [dueAt]);
  useEffect(() => setEnd(endFrom(timeFromDueAt(dueAt), durationMin)), [dueAt, durationMin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function commit(nextDate: string, nextTime: string, nextEnd: string = end) {
    const due_date = nextDate || null;
    const due_at = nextDate && nextTime ? istInstant(nextDate, nextTime).toISOString() : null;
    // the end time is stored as a duration, so Start, End and "Duration (min)" always agree
    const endMin = nextTime && nextEnd ? toMin(nextEnd) - toMin(nextTime) : null;
    if (endMin !== null && endMin <= 0) { toast.error('The end time must be after the start time.'); setEnd(endFrom(nextTime, durationMin)); return; }
    const duration_min = due_at && endMin !== null ? endMin : undefined;
    if (due_date === (dueDate ?? null) && due_at === (dueAt ?? null) && (duration_min === undefined || duration_min === (durationMin ?? 30))) return;
    setSaving(true);
    const res = await updateTaskAction(taskId, { due_date, due_at, ...(duration_min !== undefined ? { duration_min } : {}) });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || 'Could not save due date');
      setDate(dueDate ?? '');
      setTime(timeFromDueAt(dueAt));
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
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
        onChange={(e) => { setTime(e.target.value); setEnd(endFrom(e.target.value, durationMin)); }}
        onBlur={() => commit(date, time, endFrom(time, durationMin))}
        className="h-7 w-auto text-sm"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="time"
        value={end}
        disabled={saving || !date || !time}
        onChange={(e) => setEnd(e.target.value)}
        onBlur={() => commit(date, time, end)}
        className="h-7 w-auto text-sm"
        aria-label="End time"
      />
    </span>
  );
}

export default DueDateTime;
