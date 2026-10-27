'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ClearableInput } from '@/components/ui/clearable-input';
import { useStatuses } from '@/components/status/StatusProvider';
import { createTaskAction } from '@/app/actions/tasks';
import { listAreasAction, listGoalsAction, listProjectsAction } from '@/app/actions/lookup';
import { statusesFor } from '@/lib/types/statuses';
import { PRIORITIES, type Area, type Goal, type Priority, type Project } from '@/lib/types/db';
import { istInstant } from '@/lib/time';

const pad = (n: number) => String(n).padStart(2, '0');
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const sel = 'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus:border-ring';
const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`}><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>
);

/** A task, filled in like a calendar event: when it is, how long, where it belongs, how important, and notes. */
export function TaskCreateForm({ date, hour, onCreated, onCancel }: { date: string; hour: number; onCreated: () => void; onCancel: () => void }) {
  const statuses = statusesFor(useStatuses(), 'task');
  const [areas, setAreas] = useState<Area[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [f, setF] = useState({
    title: '', date, start: `${pad(hour)}:00`, end: `${pad(Math.min(23, hour + 1))}:00`, area_id: '', goal_id: '', project_id: '',
    priority: 'P2' as Priority, status: '', estimate: '', tags: '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((c) => ({ ...c, ...p }));

  useEffect(() => {
    void listAreasAction().then((r) => r.ok && setAreas(r.data));
    void listGoalsAction().then((r) => r.ok && setGoals(r.data));
  }, []);
  useEffect(() => { void listProjectsAction(f.goal_id || undefined).then((r) => r.ok && setProjects(r.data)); }, [f.goal_id]);

  const goalsShown = useMemo(() => goals.filter((g) => !f.area_id || g.area_id === f.area_id), [goals, f.area_id]);
  const problem = !f.title.trim() ? 'Give the task a title.' : f.start && f.end && toMin(f.end) <= toMin(f.start) ? 'The end time must be after the start time.' : f.start && !f.date ? 'Pick a date for the time.' : null;

  async function save() {
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    const timed = !!(f.date && f.start);
    const res = await createTaskAction({
      title: f.title.trim(),
      due_date: f.date || null,
      due_at: timed ? istInstant(f.date, f.start).toISOString() : null,
      duration_min: timed && f.end ? toMin(f.end) - toMin(f.start) : null,
      area_id: f.area_id || null, goal_id: f.goal_id || null, project_id: f.project_id || null,
      priority: f.priority, ...(f.status ? { status: f.status } : {}),
      estimate_min: f.estimate.trim() ? Math.max(0, Math.round(Number(f.estimate)) || 0) : null,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      notes_md: f.notes,
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || 'Could not create the task'); return; }
    toast.success('Task added to your calendar.');
    window.dispatchEvent(new Event('lifeos:changed'));
    onCreated();
  }

  return (
    <>
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1 text-sm">
        <Input placeholder="Task title" value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">When</div>
          <div className="flex flex-col gap-3">
            <Field label="Date"><ClearableInput wrapperClassName="w-full" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} onClear={() => set({ date: '', start: '', end: '' })} clearLabel="Remove the date" /></Field>
            <div className="grid grid-cols-2 gap-2">
            <Field label="Starts"><ClearableInput wrapperClassName="w-full" type="time" value={f.start} disabled={!f.date} onChange={(e) => set({ start: e.target.value })} onClear={() => set({ start: '', end: '' })} clearLabel="Remove the start time" /></Field>
            <Field label="Ends"><ClearableInput wrapperClassName="w-full" type="time" value={f.end} disabled={!f.date || !f.start} onChange={(e) => set({ end: e.target.value })} onClear={() => set({ end: '' })} clearLabel="Remove the end time" /></Field>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">With a start time it shows as a block on the calendar and on Google Calendar. Without one it sits in the “anytime” row.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Area">
            <select className={sel} value={f.area_id} onChange={(e) => set({ area_id: e.target.value, goal_id: '', project_id: '' })}><option value="">No area</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
          <Field label="Priority">
            <select className={sel} value={f.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          </Field>
          <Field label="Goal">
            <select className={sel} value={f.goal_id} onChange={(e) => { const g = goals.find((x) => x.id === e.target.value); set({ goal_id: e.target.value, project_id: '', area_id: f.area_id || g?.area_id || '' }); }}><option value="">No goal</option>{goalsShown.map((g) => <option key={g.id} value={g.id}>{g.emoji ? `${g.emoji} ` : ''}{g.title}</option>)}</select>
          </Field>
          <Field label="Project">
            <select className={sel} value={f.project_id} onChange={(e) => set({ project_id: e.target.value })}><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.emoji ? `${p.emoji} ` : ''}{p.title}</option>)}</select>
          </Field>
          <Field label="Status">
            <select className={sel} value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">Default</option>{statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          </Field>
          <Field label="Estimate (minutes)"><Input type="number" min={0} inputMode="numeric" placeholder="30" value={f.estimate} onChange={(e) => set({ estimate: e.target.value })} /></Field>
        </div>
        <Field label="Tags"><Input placeholder="tag1, tag2" value={f.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
        <Field label="Notes"><textarea rows={3} placeholder="Notes" value={f.notes} onChange={(e) => set({ notes: e.target.value })} className="rounded-lg border border-input bg-transparent px-3 py-2 outline-none focus:border-ring" /></Field>
        {problem && f.title.trim() && <p className="text-xs text-red-600">{problem}</p>}
        <p className="text-xs text-muted-foreground">Times are India time (IST).</p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => void save()} disabled={busy || !!problem}>{busy ? 'Saving…' : 'Add task'}</Button>
      </DialogFooter>
    </>
  );
}
