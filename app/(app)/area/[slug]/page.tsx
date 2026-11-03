import Link from 'next/link';
import { notFound } from 'next/navigation';
import { areaBySlug, areaColor } from '@/lib/domain/areas';
import { listGoals } from '@/lib/domain/goals';
import { listProjects } from '@/lib/domain/projects';
import { listTasks } from '@/lib/domain/tasks';
import { goalForecasts, projectProgressRows } from '@/lib/domain/analytics';
import { SetPageContext } from '@/components/chat/page-context';
import { PropertiesHeader } from '@/components/entity/PropertiesHeader';
import { ProgressBar } from '@/components/entity/ProgressBar';
import { AddGoal } from '@/components/entity/AddGoal';
import { ProgressChart, type ProgressRow } from '@/components/entity/ProgressChart';
import { EntityGroup } from '@/components/entity/EntityGroup';
import { TaskViews } from '@/components/tasks/TaskViews';
import { StatusLabel } from '@/components/status/StatusLabel';
import { dueLabel } from '@/lib/time';
import { getOrder } from '@/lib/domain/order';
import { Reorderable } from '@/components/widgets/Reorderable';
import type { Task } from '@/lib/types/db';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const area = await areaBySlug(slug);
  if (!area) notFound();

  const [goals, forecasts, projectRows, openTasks] = await Promise.all([
    listGoals({ area_id: area.id }),
    goalForecasts(),
    projectProgressRows(),
    listTasks({ area_id: area.id, top_level_only: true, include_done: false, limit: 1000 }),
  ]);

  const areaForecasts = forecasts.filter((f) => f.area_id === area.id);
  const doneMin = areaForecasts.reduce((s, f) => s + f.done_min, 0);
  const totalMin = areaForecasts.reduce((s, f) => s + f.total_min, 0);
  const pct = totalMin ? Math.round((doneMin / totalMin) * 100) : 0;

  const hrs = (m: number) => Math.round((m / 60) * 10) / 10;
  const chartRows: ProgressRow[] = areaForecasts.flatMap((g) => [
    { id: g.goal_id, name: g.title, kind: 'goal' as const, pct: g.total_min ? Math.round((g.done_min / g.total_min) * 100) : 0, doneH: hrs(g.done_min), totalH: hrs(g.total_min) },
    ...projectRows.filter((p) => p.goal_id === g.goal_id).map((p) => ({ id: p.project_id, name: `  ${p.title}`, kind: 'project' as const, pct: p.total_min ? Math.round((p.done_min / p.total_min) * 100) : 0, doneH: hrs(p.done_min), totalH: hrs(p.total_min) })),
  ]);

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

  const [groupOrder, itemOrders] = await Promise.all([getOrder(`area-goals-${area.id}`), Promise.all(groups.map((g) => getOrder(`goal-items-${g.goal.id}`)))]);
  const color = areaColor(area);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <SetPageContext ctx={{ route: `/area/${slug}`, entity_type: 'area', entity_id: area.id, area_id: area.id }} />

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

      {chartRows.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Progress against goals and projects</h2>
          <ProgressChart rows={chartRows} color={color} />
          <p className="text-xs text-muted-foreground">Share of estimated effort completed. Lighter bars are projects.</p>
        </section>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Goals</h2>
        <AddGoal areaId={area.id} />
      </div>

      {groups.length === 0 && <p className="text-sm text-muted-foreground">No goals in this Area yet.</p>}
      <Reorderable orderKey={`area-goals-${area.id}`} order={groupOrder} className="space-y-3" items={
        groups.map(({ goal, projects, unsorted }, gi) => ({ id: goal.id, node: (
          <EntityGroup
            href={`/goals/${goal.id}`}
            title={`${goal.emoji ? `${goal.emoji} ` : ''}${goal.title}`}
            meta={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'} · ${unsorted.length} open`}
          >
            {projects.length === 0 && unsorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <Reorderable orderKey={`goal-items-${goal.id}`} order={itemOrders[gi]} className="space-y-1" items={[
                ...projects.map((p) => ({ id: p.id, node: (
                  <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
                    <span className="truncate">
                      {p.emoji ? `${p.emoji} ` : ''}
                      {p.title}
                    </span>
                    <StatusLabel status={p.status} compact />
                  </Link>
                ) })),
                ...unsorted.map((t) => ({ id: t.id, node: <TaskRow task={t} /> })),
              ]} />
            )}
          </EntityGroup>
        ) }))} />

      <TaskViews base={{ area_id: area.id }} scope={`area:${area.id}`} title="All tasks in this Area" />
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const due = dueLabel(task.due_date);
  return (
    <Link href={`/tasks/${task.id}`} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
      <span className="truncate">{task.title}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <StatusLabel status={task.status} compact />
        {due ? ` · ${due}` : ''}
      </span>
    </Link>
  );
}
