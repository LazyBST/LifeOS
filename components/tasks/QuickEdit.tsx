'use client';
import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ClearableInput } from '@/components/ui/clearable-input';
import { listAreasAction } from '@/app/actions/lookup';
import { addDays, dueLabel, istDate, istInstant, istParts } from '@/lib/time';
import { PRIORITIES, type Area, type Priority } from '@/lib/types/db';
import { PriorityIcon } from './PriorityIcon';
import type { TaskListItem } from '@/app/actions/tasks';
import type { TaskPatchLite } from './useTaskViewState';

export type QuickUpdate = (id: string, patch: TaskPatchLite) => void;

// areas rarely change: every chip on the page shares one fetch
let areaCache: Area[] | null = null;
let areaPending: Promise<void> | null = null;
function useAreas(): Area[] {
  const [areas, setAreas] = useState<Area[]>(areaCache ?? []);
  useEffect(() => {
    if (areaCache) return;
    areaPending ??= listAreasAction().then((r) => { if (r.ok) areaCache = r.data; });
    void areaPending.then(() => areaCache && setAreas(areaCache));
  }, []);
  return areas;
}

// a chip sits inside a draggable card: taps on it must not start a drag or follow the card's link
const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onClick: (e: React.MouseEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() };
const chipBase = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px text-[12px] font-semibold transition-colors hover:ring-2 hover:ring-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60';
const pill = 'rounded-md px-2 py-1 text-xs hover:bg-muted';

export function PriorityChip({ task, onUpdate }: { task: TaskListItem; onUpdate: QuickUpdate }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger {...stop} aria-label={`Priority ${task.priority}: change`} title="Change priority" className={`${chipBase} px-0.5`}><PriorityIcon priority={task.priority} /></PopoverTrigger>
      <PopoverContent align="end" className="w-44 gap-0.5 p-1" {...stop}>
        {PRIORITIES.map((p) => (
          <button key={p} type="button" onClick={() => { setOpen(false); if (p !== task.priority) onUpdate(task.id, { priority: p as Priority }); }} className={`flex items-center gap-2 ${pill} ${p === task.priority ? 'bg-muted font-medium' : ''}`}>
            <PriorityIcon priority={p} /> {p} · {{ P0: 'Highest', P1: 'High', P2: 'Medium', P3: 'Low' }[p]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function AreaChip({ task, onUpdate, children }: { task: TaskListItem; onUpdate: QuickUpdate; children?: React.ReactNode }) {
  const areas = useAreas();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger {...stop} aria-label="Change area" title="Change area" className={`${chipBase} max-w-full shrink ${task.area_name ? '' : 'border border-dashed text-muted-foreground'}`} style={task.area_name ? { backgroundColor: `${task.area_color}29`, color: task.area_color } : undefined}>
        {children ?? <span className="truncate">{task.area_name ?? '+ area'}</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-64 w-48 gap-0.5 overflow-y-auto p-1" {...stop}>
        {areas.map((a) => (
          <button key={a.id} type="button" onClick={() => { setOpen(false); if (a.id !== task.area_id) onUpdate(task.id, { area_id: a.id }); }} className={`flex items-center gap-2 ${pill} ${a.id === task.area_id ? 'bg-muted font-medium' : ''}`}>
            <span className="size-2.5 rounded-full" style={{ background: a.color ?? '#94a3b8' }} /> <span className="truncate">{a.name}</span>
          </button>
        ))}
        {task.area_id && <button type="button" onClick={() => { setOpen(false); onUpdate(task.id, { area_id: null }); }} className={`${pill} text-left text-muted-foreground`}>No area</button>}
      </PopoverContent>
    </Popover>
  );
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const timeOf = (at: string | null) => (at ? istParts(new Date(at)).time : '');
const endOf = (start: string, dur: number | null) => {
  if (!start) return '';
  const e = Math.min(23 * 60 + 59, toMin(start) + (dur ?? 30));
  return `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`;
};

/** "Today", "Tomorrow · 9:30–10:30", or a plain "+ date". */
export function dueText(task: Pick<TaskListItem, 'due_date' | 'due_at' | 'duration_min'>): string | null {
  const d = dueLabel(task.due_date);
  if (!d) return null;
  const s = timeOf(task.due_at);
  return s ? `${d} · ${s}${task.duration_min ? `–${endOf(s, task.duration_min)}` : ''}` : d;
}

/** Date, start and end in one small popover. Quick picks for the common days; every change saves at once. */
export function DueChip({ task, overdue, onUpdate }: { task: TaskListItem; overdue: boolean; onUpdate: QuickUpdate }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(task.due_date ?? '');
  const [start, setStart] = useState(timeOf(task.due_at));
  const [end, setEnd] = useState(task.due_at && task.duration_min ? endOf(timeOf(task.due_at), task.duration_min) : '');
  useEffect(() => {
    if (open) return;
    setDate(task.due_date ?? ''); setStart(timeOf(task.due_at)); setEnd(task.due_at && task.duration_min ? endOf(timeOf(task.due_at), task.duration_min) : '');
  }, [open, task.due_date, task.due_at, task.duration_min]);

  function save(d: string, s: string, e: string) {
    if (s && e && toMin(e) <= toMin(start || s)) return; // an end before the start waits until it makes sense
    const due_at = d && s ? istInstant(d, s).toISOString() : null;
    onUpdate(task.id, { due_date: d || null, due_at, duration_min: due_at && s && e ? toMin(e) - toMin(s) : null });
  }
  const today = istDate();
  const text = dueText(task);
  const tone = overdue ? 'bg-[#ffebe6] text-[#bf2600] dark:bg-red-500/20 dark:text-red-400' : 'bg-[#dfe1e6] text-[#42526e] dark:bg-muted dark:text-muted-foreground';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger {...stop} aria-label="Change due date and time" title="Change due date and time" className={`${chipBase} ${text ? tone : 'border border-dashed text-muted-foreground'}`}>{text ?? '+ date'}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-2" {...stop}>
        <div className="flex flex-wrap gap-1">
          {[['Today', today], ['Tomorrow', addDays(today, 1)], ['Next week', addDays(today, 7)]].map(([l, d]) => (
            <button key={l} type="button" onClick={() => { setDate(d); save(d, start, end); }} className={`rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted ${date === d ? 'border-primary bg-primary/10 font-semibold' : ''}`}>{l}</button>
          ))}
        </div>
        <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date
          <ClearableInput type="date" value={date} className="h-8 text-sm font-normal normal-case text-foreground" onChange={(e) => { setDate(e.target.value); save(e.target.value, start, end); }} onClear={() => { setDate(''); setStart(''); setEnd(''); save('', '', ''); }} clearLabel="Remove the due date" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Starts
            <ClearableInput type="time" value={start} disabled={!date} className="h-8 text-sm font-normal text-foreground" onChange={(e) => { setStart(e.target.value); const ne = e.target.value ? endOf(e.target.value, 60) : ''; setEnd(ne); save(date, e.target.value, ne); }} onClear={() => { setStart(''); setEnd(''); save(date, '', ''); }} clearLabel="Remove the start time" />
          </label>
          <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ends
            <ClearableInput type="time" value={end} disabled={!date || !start} className="h-8 text-sm font-normal text-foreground" onChange={(e) => { setEnd(e.target.value); save(date, start, e.target.value); }} onClear={() => { setEnd(''); save(date, start, ''); }} clearLabel="Remove the end time" />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
