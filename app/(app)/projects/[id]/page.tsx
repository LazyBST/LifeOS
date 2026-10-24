import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/domain/projects';
import { getGoal } from '@/lib/domain/goals';
import { listAreas, areaSlug } from '@/lib/domain/areas';
import { projectForecasts } from '@/lib/domain/analytics';
import { readNotes } from '@/lib/domain/notes';
import { Breadcrumbs } from '@/components/shell/Breadcrumbs';
import { SetPageContext } from '@/components/chat/page-context';
import { PropertiesHeader } from '@/components/entity/PropertiesHeader';
import { ProgressBar } from '@/components/entity/ProgressBar';
import { InlineText } from '@/components/entity/InlineText';
import { InlineSelect } from '@/components/entity/InlineSelect';
import { InlineDate } from '@/components/entity/InlineDate';
import { NotesEditor } from '@/components/notes/NotesEditor';
import { TaskViews } from '@/components/tasks/TaskViews';
import { updateProjectAction } from '@/app/actions/projects';
import { PRIORITIES } from '@/lib/types/db';
import { listStatuses } from '@/lib/domain/statuses';
import { statusesFor } from '@/lib/types/statuses';
import { formatDate } from '@/lib/time';
import type { EntityStatus, Priority } from '@/lib/types/db';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const statusOptions = statusesFor(await listStatuses(), 'project').map((s) => ({ value: s.key, label: s.label }));
  const { id } = await params;
  const [project, areas] = await Promise.all([getProject(id), listAreas()]);
  if (!project) notFound();

  const [goal, notes, forecasts] = await Promise.all([
    getGoal(project.goal_id),
    readNotes('project', project.id),
    projectForecasts(project.goal_id),
  ]);

  const forecast = forecasts.find((f) => f.project_id === project.id) ?? null;
  const area = areas.find((a) => a.id === project.area_id) ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <SetPageContext
        ctx={{ route: `/projects/${project.id}`, entity_type: 'project', entity_id: project.id, area_id: project.area_id }}
      />
      <Breadcrumbs
        items={[
          ...(area ? [{ href: `/area/${areaSlug(area.name)}`, label: area.name }] : []),
          ...(goal ? [{ href: `/goals/${goal.id}`, label: goal.title }] : []),
          { label: project.title },
        ]}
      />

      <PropertiesHeader
        eyebrow={
          goal && (
            <>
              Goal: <Link href={`/goals/${goal.id}`} className="hover:underline">{goal.title}</Link>
            </>
          )
        }
        icon={
          <InlineText
            value={project.emoji ?? ''}
            placeholder="📁"
            onSave={(v) => updateProjectAction(project.id, { emoji: v || null })}
            className="w-10 text-center text-2xl"
          />
        }
        title={
          <InlineText
            value={project.title}
            placeholder="Untitled project"
            onSave={(v) => updateProjectAction(project.id, { title: v })}
            textClassName="text-xl font-semibold"
          />
        }
        meta={
          <>
            <InlineSelect
              value={project.status}
              options={statusOptions}
              onSave={(v) => updateProjectAction(project.id, { status: v as EntityStatus })}
            />
            <InlineSelect
              value={project.priority}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              onSave={(v) => updateProjectAction(project.id, { priority: v as Priority })}
            />
            <InlineSelect
              value={project.area_id}
              clearable
              options={areas.map((a) => ({ value: a.id, label: a.name }))}
              onSave={(v) => updateProjectAction(project.id, { area_id: v || null })}
            />
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Start
              <InlineDate value={project.start_date} onSave={(v) => updateProjectAction(project.id, { start_date: v })} />
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Target
              <InlineDate value={project.target_date} onSave={(v) => updateProjectAction(project.id, { target_date: v })} />
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
      </PropertiesHeader>

      <TaskViews
        base={{ project_id: project.id }}
        scope={`project:${project.id}`}
        defaultView="board"
        defaultGroup="priority"
      />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Notes</h2>
        <NotesEditor type="project" id={project.id} initial={notes} />
      </section>
    </div>
  );
}
