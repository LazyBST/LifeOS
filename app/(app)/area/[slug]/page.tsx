import Link from 'next/link';
import { notFound } from 'next/navigation';
import { areaBySlug, areaColor } from '@/lib/domain/areas';
import { listGoals } from '@/lib/domain/goals';
import { listProjects } from '@/lib/domain/projects';
import { listTasks } from '@/lib/domain/tasks';
import { goalForecasts } from '@/lib/domain/analytics';
import { Breadcrumbs } from '@/components/shell/Breadcrumbs';
import { SetPageContext } from '@/components/chat/page-context';
import { PropertiesHeader } from '@/components/entity/PropertiesHeader';
import { ProgressBar } from '@/components/entity/ProgressBar';
import { EntityGroup } from '@/components/entity/EntityGroup';
import { TaskViews } from '@/components/tasks/TaskViews';
import { TASK_STATUS_LABEL } from '@/lib/types/db';
import { dueLabel } from '@/lib/time';
import type { Task } from '@/lib/types/db';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const area = await areaBySlug(slug);
  if (!area) notFound();

  const [goals, forecasts, openTasks] = await Promise.all([
    listGoals({ area_id: area.id }),
    goalForecasts(),
    listTasks({ area_id: area.id, top_level_only: true, include_done: false, limit: 1000 }),
  ]);

  const areaForecasts = forecasts.filter((f) => f.area_id === area.id);
  const doneMin = areaForecasts.reduce((s, f) => s + f.done_min, 0);
  const totalMin = areaForecasts.reduce((s, f) => s + f.total_min, 0);
  const pct = totalMin ? Math.round((doneMin / totalMin) * 100) : 0;

  const groups = await Promise.all(
    goals.map(async (goal) => {
      const [projects, tasks] = await Promise.all([
        listProjects({ goal_id: goal.id }),
        listTasks({ goal_id: goal.id, top_level_only: true, include_done: false, limit: 500 }),
      ]);
      const unsorted = tasks.filter((t) => !t.project_id);
      return { goal, projects, unsorted };
    }),
  );

  const color = areaColor(area);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <SetPageContext ctx={{ route: `/area/${slug}`, entity_type: 'area', entity_id: area.id, area_id: area.id }} />
      <Breadcrumbs items={[{ label: area.name }]} />

      <PropertiesHeader
        icon={<span className="inline-block size-3 rounded-full" style={{ background: color }} />}
        title={area.name}
        meta={
          <span className="text-sm text-muted-foreground">
            {goals.length} {goals.length === 1 ? 'goal' : 'goals'} · {openTasks.length} open tasks
          </span>
        }
      >
        <ProgressBar pct={pct} label="Overall progress" />
      </PropertiesHeader>

      <div className="space-y-3">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">No goals in this Area yet.</p>}
        {groups.map(({ goal, projects, unsorted }) => (
          <EntityGroup
            key={goal.id}
            href={`/goals/${goal.id}`}
            title={`${goal.emoji ? `${goal.emoji} ` : ''}${goal.title}`}
            meta={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'} · ${unsorted.length} open`}
          >
            {projects.length === 0 && unsorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <div className="space-y-1">
                {projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
                  >
                    <span className="truncate">
                      {p.emoji ? `${p.emoji} ` : ''}
                      {p.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.status}</span>
                  </Link>
                ))}
                {unsorted.map((t) => <TaskRow key={t.id} task={t} />)}
              </div>
            )}
          </EntityGroup>
        ))}
      </div>

      <TaskViews base={{ area_id: area.id }} scope={`area:${area.id}`} title="All tasks in this Area" />
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const due = dueLabel(task.due_date);
  return (
    <Link href={`/tasks/${task.id}`} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
      <span className="truncate">{task.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {TASK_STATUS_LABEL[task.status]}
        {due ? ` · ${due}` : ''}
      </span>
    </Link>
  );
}
