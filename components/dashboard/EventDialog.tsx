'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createEventAction, deleteEventAction, undoEventEditAction, updateEventAction } from '@/app/actions/calevents';
import type { EditableEvent } from '@/lib/domain/calweek';
import type { EventInput } from '@/lib/google/events-math';
import { addDays, istInstant, istParts } from '@/lib/time';
import { TaskCreateForm } from './TaskCreateForm';

export type DialogTarget = { mode: 'create'; date: string; hour: number } | { mode: 'edit'; event: EditableEvent } | null;

type Form = { summary: string; allDay: boolean; sDate: string; sTime: string; eDate: string; eTime: string; location: string; description: string };
const pad = (n: number) => String(n).padStart(2, '0');

function initial(t: NonNullable<DialogTarget>): Form {
  if (t.mode === 'create') return { summary: '', allDay: false, sDate: t.date, sTime: `${pad(t.hour)}:00`, eDate: t.date, eTime: `${pad(Math.min(23, t.hour + 1))}:00`, location: '', description: '' };
  const e = t.event;
  if (e.allDay) {
    const s = e.start.slice(0, 10), endEx = e.end.slice(0, 10);
    return { summary: e.summary, allDay: true, sDate: s, sTime: '09:00', eDate: endEx > s ? addDays(endEx, -1) : s, eTime: '10:00', location: e.location ?? '', description: e.description ?? '' };
  }
  const s = istParts(new Date(e.start)), en = istParts(new Date(e.end));
  return { summary: e.summary, allDay: false, sDate: s.date, sTime: s.time, eDate: en.date, eTime: en.time, location: e.location ?? '', description: e.description ?? '' };
}

function toInput(f: Form): EventInput {
  return f.allDay
    ? { summary: f.summary, start: f.sDate, end: f.eDate, allDay: true, location: f.location, description: f.description }
    : { summary: f.summary, start: istInstant(f.sDate, f.sTime).toISOString(), end: istInstant(f.eDate, f.eTime).toISOString(), allDay: false, location: f.location, description: f.description };
}

/** Create, edit or delete an event on your real Google Calendar. Every change can be undone from the toast. */
export function EventDialog({ target, onClose, onChanged }: { target: DialogTarget; onClose: () => void; onChanged: () => void }) {
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'event' | 'task'>('event'); // a new calendar item is an event or a task
  useEffect(() => { try { if (localStorage.getItem('lifeos:cal:newkind') === 'task') setKind('task'); } catch {} }, []);
  const pick = (k: 'event' | 'task') => { setKind(k); try { localStorage.setItem('lifeos:cal:newkind', k); } catch {} };
  useEffect(() => { setF(target ? initial(target) : null); }, [target]);
  if (!target || !f) return null;
  const readOnly = target.mode === 'edit' && !target.event.canEdit;
  const set = (p: Partial<Form>) => setF({ ...f, ...p });

  const done = (msg: string, logId: number | null) => {
    toast.success(msg, logId ? { duration: 10000, action: { label: 'Undo', onClick: async () => { const u = await undoEventEditAction(logId); if (u.ok) toast.success(u.data); else toast.error(u.error); onChanged(); } } } : undefined);
    onChanged(); onClose();
  };
  async function save() {
    setBusy(true);
    const input = toInput(f!);
    const r = target!.mode === 'create' ? await createEventAction(input) : await updateEventAction(target!.event.id, input);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); onChanged(); return; }
    done(target!.mode === 'create' ? 'Event added to Google Calendar.' : 'Event updated on Google Calendar.', r.data.logId);
  }
  async function remove() {
    if (target!.mode !== 'edit' || !confirm(`Delete “${target!.event.summary}” from your Google Calendar?`)) return;
    setBusy(true);
    const r = await deleteEventAction(target!.event.id);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); onChanged(); return; }
    done('Event deleted.', r.data.logId);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{target.mode === 'create' ? (kind === 'task' ? 'New task' : 'New event') : readOnly ? 'Event (read only)' : 'Edit event'}</DialogTitle></DialogHeader>
        {target.mode === 'create' && (
          <div className="flex rounded-lg bg-muted p-0.5 text-xs" role="tablist" aria-label="What to add">
            {(['event', 'task'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => pick(k)} className={`flex-1 rounded-md px-3 py-1.5 font-medium capitalize ${kind === k ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{k}</button>)}
          </div>
        )}
        {target.mode === 'create' && kind === 'task' ? (
          <TaskCreateForm date={target.date} hour={target.hour} onCreated={() => { onChanged(); onClose(); }} onCancel={onClose} />
        ) : (<>
        <div className="flex flex-col gap-3 text-sm">
          <Input placeholder="Title" value={f.summary} disabled={readOnly} onChange={(e) => set({ summary: e.target.value })} autoFocus />
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.allDay} disabled={readOnly} onChange={(e) => set({ allDay: e.target.checked })} /> All day</label>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={f.sDate} disabled={readOnly} onChange={(e) => set({ sDate: e.target.value, eDate: f.eDate < e.target.value ? e.target.value : f.eDate })} />
            {!f.allDay && <Input type="time" value={f.sTime} disabled={readOnly} onChange={(e) => set({ sTime: e.target.value })} />}
            <Input type="date" value={f.eDate} disabled={readOnly} onChange={(e) => set({ eDate: e.target.value })} />
            {!f.allDay && <Input type="time" value={f.eTime} disabled={readOnly} onChange={(e) => set({ eTime: e.target.value })} />}
          </div>
          <Input placeholder="Location" value={f.location} disabled={readOnly} onChange={(e) => set({ location: e.target.value })} />
          <textarea placeholder="Description" rows={3} value={f.description} disabled={readOnly} onChange={(e) => set({ description: e.target.value })} className="rounded-lg border border-input bg-transparent px-3 py-2 outline-none focus:border-ring disabled:opacity-60" />
          {target.mode === 'edit' && target.event.recurring && <p className="text-xs text-muted-foreground">↻ Part of a repeating series: only this occurrence changes.</p>}
          {readOnly && <p className="text-xs text-muted-foreground">You are not the organiser of this event, so Google will not let LifeOS change it.</p>}
          <p className="text-xs text-muted-foreground">Times are India time (IST). Changes go straight to your Google Calendar and appear on your phone.</p>
        </div>
        <DialogFooter>
          {target.mode === 'edit' && !readOnly && <Button variant="destructive" onClick={remove} disabled={busy}>Delete</Button>}
          <Button variant="outline" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && <Button onClick={save} disabled={busy || !f.summary.trim()}>{busy ? 'Saving…' : 'Save'}</Button>}
        </DialogFooter>
        </>)}
      </DialogContent>
    </Dialog>
  );
}
