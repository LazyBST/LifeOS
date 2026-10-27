'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClearableInput } from '@/components/ui/clearable-input';
import { Badge } from '@/components/ui/badge';
import { PRIORITIES, type Area, type Goal, type Priority, type Project, type TaskStatus } from '@/lib/types/db';
import { statusesFor } from '@/lib/types/statuses';
import { useStatuses } from '@/components/status/StatusProvider';
import type { DuePreset, TaskFilters } from '@/lib/types/filters';
import { listAreasAction, listGoalsAction, listProjectsAction } from '@/app/actions/lookup';

export type FilterBarProps = {
  /** the user's own filter picks (not merged with preset or base) */
  filters: TaskFilters;
  /** page-locked filters: rendered disabled/hidden, cannot be cleared here */
  base: TaskFilters;
  onChange: (next: TaskFilters) => void;
  onClear: () => void;
};

const DUE_OPTIONS: { value: DuePreset | ''; label: string }[] = [
  { value: '', label: 'Any due date' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'today_tomorrow', label: 'Today + tomorrow' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'none', label: 'No date' },
  { value: 'custom', label: 'Custom range' },
];

// the lookups rarely change, so every filter bar after the first one starts with them already in hand
const cache: { areas?: Area[]; goals?: Goal[]; projects: Map<string, Project[]> } = { projects: new Map() };

export function FilterBar({ filters, base, onChange, onClear }: FilterBarProps) {
  const statusOptions = statusesFor(useStatuses(), 'task');
  const [areas, setAreas] = useState<Area[]>(cache.areas ?? []);
  const [goals, setGoals] = useState<Goal[]>(cache.goals ?? []);
  const effectiveGoalId = filters.goal_id ?? base.goal_id ?? undefined;
  const [projects, setProjects] = useState<Project[]>(cache.projects.get(effectiveGoalId ?? '') ?? []);

  useEffect(() => {
    if (!cache.areas) listAreasAction().then((r) => { if (r.ok) { cache.areas = r.data; setAreas(r.data); } });
    if (!cache.goals) listGoalsAction().then((r) => { if (r.ok) { cache.goals = r.data; setGoals(r.data); } });
  }, []);

  useEffect(() => {
    const key = effectiveGoalId ?? '';
    const hit = cache.projects.get(key);
    if (hit) setProjects(hit);
    listProjectsAction(effectiveGoalId ?? undefined).then((r) => {
      if (r.ok) { cache.projects.set(key, r.data); setProjects(r.data); }
    });
  }, [effectiveGoalId]);

  function patch(next: Partial<TaskFilters>) {
    onChange({ ...filters, ...next });
  }

  function togglePriority(p: Priority) {
    const cur = filters.priority ?? [];
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    patch({ priority: next.length ? next : undefined });
  }

  function toggleStatus(s: TaskStatus) {
    const cur = filters.status ?? [];
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    patch({ status: next.length ? next : undefined });
  }

  const lockedArea = 'area_id' in base;
  const lockedGoal = 'goal_id' in base;
  const lockedProject = 'project_id' in base;

  const sel = 'h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring';
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!lockedArea && (
          <Field label="Area">
            <select className={sel} value={filters.area_id ?? ''} onChange={(e) => patch({ area_id: e.target.value || undefined })} aria-label="Area">
              <option value="">All areas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}
        {!lockedGoal && (
          <Field label="Goal">
            <select className={sel} value={filters.goal_id ?? ''} onChange={(e) => patch({ goal_id: e.target.value || undefined, project_id: undefined })} aria-label="Goal">
              <option value="">All goals</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.emoji ? `${g.emoji} ` : ''}{g.title}</option>)}
            </select>
          </Field>
        )}
        {!lockedProject && (
          <Field label="Project">
            <select className={sel} value={filters.project_id ?? ''} onChange={(e) => patch({ project_id: e.target.value || undefined })} aria-label="Project">
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
        )}
        <Field label="Due">
          <select
            className={sel}
            value={filters.due ?? ''}
            onChange={(e) => { const value = e.target.value as DuePreset | ''; patch({ due: value || undefined, due_from: undefined, due_to: undefined }); }}
            aria-label="Due"
          >
            {DUE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {filters.due === 'custom' && (
          <Field label="Between">
            <div className="flex items-center gap-1.5">
              <ClearableInput type="date" className="h-9" value={filters.due_from ?? ''} onChange={(e) => patch({ due_from: e.target.value || undefined })} onClear={() => patch({ due_from: undefined })} />
              <span className="text-xs text-muted-foreground">to</span>
              <ClearableInput type="date" className="h-9" value={filters.due_to ?? ''} onChange={(e) => patch({ due_to: e.target.value || undefined })} onClear={() => patch({ due_to: undefined })} />
            </div>
          </Field>
        )}
        <Field label="Subtasks">
          <select className={sel} value={filters.subtasks ?? 'nested'} onChange={(e) => patch({ subtasks: e.target.value === 'nested' ? undefined : (e.target.value as 'all' | 'only') })} aria-label="Subtasks">
            <option value="nested">Inside their parent task</option>
            <option value="all">As separate tasks</option>
            <option value="only">Hide parents that have subtasks</option>
          </select>
        </Field>
        <Field label="Tag">
          <Input placeholder="e.g. urgent" className="h-9" value={filters.tag ?? ''} onChange={(e) => patch({ tag: e.target.value || undefined })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Field label="Priority">
          <div className="flex items-center gap-1">
            {PRIORITIES.map((p) => (
              <Badge key={p} variant={filters.priority?.includes(p) ? 'default' : 'outline'} className="h-7 cursor-pointer select-none px-2.5" onClick={() => togglePriority(p)}>{p}</Badge>
            ))}
          </div>
        </Field>
        <Field label="Status">
          <div className="flex flex-wrap items-center gap-1">
            {statusOptions.map((s) => (
              <Badge key={s.key} variant={filters.status?.includes(s.key) ? 'default' : 'outline'} className="h-7 cursor-pointer select-none px-2.5" onClick={() => toggleStatus(s.key)}>{s.label}</Badge>
            ))}
          </div>
        </Field>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>Clear all</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default FilterBar;
