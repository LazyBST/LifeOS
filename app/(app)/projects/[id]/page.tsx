import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/domain/projects';
import { getGoal } from '@/lib/domain/goals';
import { listAreas, areaSlug } from '@/lib/domain/areas';
import { projectForecasts } from '@/lib/domain/analytics';
import { readNotes } from '@/lib/domain/notes';
import { Trail } from '@/components/entity/Trail';
import { areaColor } from '@/lib/domain/areas-colors';
import { SetPageContext } from '@/components/chat/page-context';
import { PropertiesHeader } from '@/components/entity/PropertiesHeader';
import { ProgressBar } from '@/components/entity/ProgressBar';
import { InlineText } from '@/components/entity/InlineText';
import { InlineSelect } from '@/components/entity/InlineSelect';
import { InlineDate } from '@/components/entity/InlineDate';
import { NotesEditor } from '@/components/notes/NotesEditor';
import { TaskViews } from '@/components/tasks/TaskViews';
import { ledgerForProject, slipCount } from '@/lib/domain/ledger';
import { LinkedHabits } from '@/components/habits/LinkedHabits';
import { LinkedBooks } from '@/components/books/LinkedBooks';
import { LedgerSection } from '@/components/ledger/LedgerSection';
import { PRIORITIES } from '@/lib/types/db';
import { listStatuses } from '@/lib/domain/statuses';
import { statusesFor } from '@/lib/types/statuses';
import { formatDate } from '@/lib/time';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const statusOptions = statusesFor(await listStatuses(), 'project').map((s) => ({ value: s.key, label: s.label }));
  const { id } = await params;
  const [project, areas] = await Promise.all([getProject(id), listAreas()]);
  if (!project) notFound();

  const [ledger, slips] = await Promise.all([ledgerForProject(id), slipCount('project', id)]);
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
      <PropertiesHeader
        trail={<Trail items={[...(area ? [{ kind: 'area' as const, label: area.name, href: `/area/${areaSlug(area.name)}`, color: areaColor(area) }] : []), ...(goal ? [{ kind: 'goal' as const, label: goal.title, href: `/goals/${goal.id}` }] : [])]} />}
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
            save={{ entity: 'project', id: project.id, field: 'emoji', mode: 'nullable' }}
            className="w-10 text-center text-2xl"
          />
        }
        title={
          <InlineText
            value={project.title}
            placeholder="Untitled project"
            save={{ entity: 'project', id: project.id, field: 'title' }}
            textClassName="text-xl font-semibold"
          />
        }
        meta={
          <>
            <InlineSelect
              value={project.status}
              options={statusOptions}
              save={{ entity: 'project', id: project.id, field: 'status' }}
            />
            <InlineSelect
              value={project.priority}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              save={{ entity: 'project', id: project.id, field: 'priority' }}
            />
            <InlineSelect
              value={project.area_id}
              clearable
              options={areas.map((a) => ({ value: a.id, label: a.name }))}
              save={{ entity: 'project', id: project.id, field: 'area_id', mode: 'nullable' }}
            />
            <span className="field">
              Start
              <InlineDate value={project.start_date} save={{ entity: 'project', id: project.id, field: 'start_date', mode: 'nullable' }} />
            </span>
            <span className="field">
              Target
              <InlineDate value={project.target_date} save={{ entity: 'project', id: project.id, field: 'target_date', mode: 'nullable' }} />
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

      <LedgerSection name={project.title} agreed={project.original_target_date ?? project.target_date} current={project.target_date} completedOn={project.completed_on ?? null} ledger={ledger} slips={slips} agreedSave={{ entity: 'project', id: project.id, field: 'original_target_date', mode: 'nullable' }} completedSave={{ entity: 'project', id: project.id, field: 'completed_on', mode: 'nullable' }} />

      <TaskViews
              defaultPreset="all"
        base={{ project_id: project.id }}
        scope={`project:${project.id}`}
        defaultView="board"
        defaultGroup="priority"
      />

      <LinkedHabits entityType="project" entityId={project.id} areaId={project.area_id} title="Habits for this project" />

      <LinkedBooks entityType="project" entityId={project.id} title="Books for this project" />

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Notes</h2>
        <NotesEditor type="project" id={project.id} initial={notes} />
      </section>
    </div>
  );
}
