'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  { value: 'week', label: 'Within 7 days' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'none', label: 'No date' },
  { value: 'custom', label: 'Custom range' },
];

export function FilterBar({ filters, base, onChange, onClear }: FilterBarProps) {
  const statusOptions = statusesFor(useStatuses(), 'task');
  const [areas, setAreas] = useState<Area[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState(filters.q ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listAreasAction().then((r) => {
      if (r.ok) setAreas(r.data);
    });
    listGoalsAction().then((r) => {
      if (r.ok) setGoals(r.data);
    });
  }, []);

  const effectiveGoalId = filters.goal_id ?? base.goal_id ?? undefined;
  useEffect(() => {
    listProjectsAction(effectiveGoalId ?? undefined).then((r) => {
      if (r.ok) setProjects(r.data);
    });
  }, [effectiveGoalId]);

  useEffect(() => {
    setSearch(filters.q ?? '');
  }, [filters.q]);

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

  function onSearchChange(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => patch({ q: value || undefined }), 350);
  }

  const lockedArea = 'area_id' in base;
  const lockedGoal = 'goal_id' in base;
  const lockedProject = 'project_id' in base;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
      {!lockedArea && (
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={filters.area_id ?? ''}
          onChange={(e) => patch({ area_id: e.target.value || undefined })}
          aria-label="Area"
        >
          <option value="">All areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      {!lockedGoal && (
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={filters.goal_id ?? ''}
          onChange={(e) => patch({ goal_id: e.target.value || undefined, project_id: undefined })}
          aria-label="Goal"
        >
          <option value="">All goals</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.emoji ? `${g.emoji} ` : ''}
              {g.title}
            </option>
          ))}
        </select>
      )}
      {!lockedProject && (
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={filters.project_id ?? ''}
          onChange={(e) => patch({ project_id: e.target.value || undefined })}
          aria-label="Project"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-1">
        {PRIORITIES.map((p) => (
          <Badge
            key={p}
            variant={filters.priority?.includes(p) ? 'default' : 'outline'}
            className="h-7 cursor-pointer select-none px-2"
            onClick={() => togglePriority(p)}
          >
            {p}
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {statusOptions.map((s) => (
          <Badge
            key={s.key}
            variant={filters.status?.includes(s.key) ? 'default' : 'outline'}
            className="h-7 cursor-pointer select-none px-2"
            onClick={() => toggleStatus(s.key)}
          >
            {s.label}
          </Badge>
        ))}
      </div>
      <select
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        value={filters.due ?? ''}
        onChange={(e) => {
          const value = e.target.value as DuePreset | '';
          patch({ due: value || undefined, due_from: undefined, due_to: undefined });
        }}
        aria-label="Due"
      >
        {DUE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {filters.due === 'custom' && (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            className="h-8 w-32"
            value={filters.due_from ?? ''}
            onChange={(e) => patch({ due_from: e.target.value || undefined })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            className="h-8 w-32"
            value={filters.due_to ?? ''}
            onChange={(e) => patch({ due_to: e.target.value || undefined })}
          />
        </div>
      )}
      <Input
        placeholder="Tag"
        className="h-8 w-24"
        value={filters.tag ?? ''}
        onChange={(e) => patch({ tag: e.target.value || undefined })}
      />
      <Input placeholder="Search..." className="h-8 w-40" value={search} onChange={(e) => onSearchChange(e.target.value)} />
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

export default FilterBar;
