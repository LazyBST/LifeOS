import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGoal } from '@/lib/domain/goals';
import { listAreas, areaSlug } from '@/lib/domain/areas';
import { listProjects } from '@/lib/domain/projects';
import { listTasks } from '@/lib/domain/tasks';
import { goalForecast } from '@/lib/domain/analytics';
import { readNotes } from '@/lib/domain/notes';
import { Breadcrumbs } from '@/components/shell/Breadcrumbs';
import { SetPageContext } from '@/components/chat/page-context';
import { PropertiesHeader } from '@/components/entity/PropertiesHeader';
import { ProgressBar } from '@/components/entity/ProgressBar';
import { EntityGroup } from '@/components/entity/EntityGroup';
import { InlineText } from '@/components/entity/InlineText';
import { InlineSelect } from '@/components/entity/InlineSelect';
import { InlineDate } from '@/components/entity/InlineDate';
import { AddProject } from '@/components/entity/AddProject';
import { NotesEditor } from '@/components/notes/NotesEditor';
import { TaskViews } from '@/components/tasks/TaskViews';
import { updateGoalAction } from '@/app/actions/goals';
import { PRIORITIES, TASK_STATUS_LABEL } from '@/lib/types/db';
import { formatDate, dueLabel } from '@/lib/time';
import type { EntityStatus, Priority, Task } from '@/lib/types/db';

const STATUS_OPTIONS: { value: EntityStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
  { value: 'dropped', label: 'Dropped' },
];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [goal, areas] = await Promise.all([getGoal(id), listAreas()]);
  if (!goal) notFound();

  const [projects, forecast, notes, goalTasks] = await Promise.all([
    listProjects({ goal_id: goal.id }),
    goalForecast(goal.id),
    readNotes('goal', goal.id),
    listTasks({ goal_id: goal.id, top_level_only: true, include_done: false, limit: 500 }),
  ]);

  const area = areas.find((a) => a.id === goal.area_id) ?? null;
  const unsorted = goalTasks.filter((t) => !t.project_id);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <SetPageContext
        ctx={{ route: `/goals/${goal.id}`, entity_type: 'goal', entity_id: goal.id, area_id: goal.area_id }}
      />
      <Breadcrumbs
        items={[
          ...(area ? [{ href: `/area/${areaSlug(area.name)}`, label: area.name }] : []),
          { label: goal.title },
        ]}
      />

      <PropertiesHeader
        icon={
          <InlineText
            value={goal.emoji ?? ''}
            placeholder="🎯"
            onSave={(v) => updateGoalAction(goal.id, { emoji: v || null })}
            className="w-10 text-center text-2xl"
          />
        }
        title={
          <InlineText
            value={goal.title}
            placeholder="Untitled goal"
            onSave={(v) => updateGoalAction(goal.id, { title: v })}
            textClassName="text-xl font-semibold"
          />
        }
        meta={
          <>
            <InlineSelect
              value={goal.status}
              options={STATUS_OPTIONS}
              onSave={(v) => updateGoalAction(goal.id, { status: v as EntityStatus })}
            />
            <InlineSelect
              value={goal.priority}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              onSave={(v) => updateGoalAction(goal.id, { priority: v as Priority })}
            />
            <InlineSelect
              value={goal.area_id}
              clearable
              options={areas.map((a) => ({ value: a.id, label: a.name }))}
              onSave={(v) => updateGoalAction(goal.id, { area_id: v || null })}
            />
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Start
              <InlineDate value={goal.start_date} onSave={(v) => updateGoalAction(goal.id, { start_date: v })} />
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Target
              <InlineDate value={goal.target_date} onSave={(v) => updateGoalAction(goal.id, { target_date: v })} />
            </span>
          </>
        }
      >
        <ProgressBar
          pct={forecast?.progressPct ?? 0}
          label="Progress"
          sublabel={
            forecast
              ? `${forecast.remainingHours}h left${
                  forecast.projectedDate ? ` · projected ${formatDate(forecast.projectedDate)}` : ''
                }${forecast.rough ? ' (rough)' : ''}`
              : undefined
          }
        />
        {forecast?.onTrack === false && (
          <p className="text-xs text-destructive">Projected finish is after the target date.</p>
        )}
      </PropertiesHeader>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
        <AddProject goalId={goal.id} />
      </div>

      <div className="space-y-3">
        {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
        {projects.map((p) => (
          <EntityGroup key={p.id} href={`/projects/${p.id}`} title={`${p.emoji ? `${p.emoji} ` : ''}${p.title}`} meta={p.status}>
            <TaskViews
              base={{ project_id: p.id }}
              scope={`goal:${goal.id}:project:${p.id}`}
              hidePresets
              defaultView="list"
              defaultGroup="status"
            />
          </EntityGroup>
        ))}

        <EntityGroup title="Unsorted" meta={`${unsorted.length} open`}>
          {unsorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks directly on this goal.</p>
          ) : (
            <div className="space-y-1">
              {unsorted.map((t) => <TaskRow key={t.id} task={t} />)}
            </div>
          )}
        </EntityGroup>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Notes</h2>
        <NotesEditor type="goal" id={goal.id} initial={notes} />
      </section>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const due = dueLabel(task.due_date);
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
    >
      <span className="truncate">{task.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {TASK_STATUS_LABEL[task.status]}
        {due ? ` · ${due}` : ''}
      </span>
    </Link>
  );
}
