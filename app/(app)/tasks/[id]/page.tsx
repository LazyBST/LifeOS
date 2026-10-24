import { notFound } from 'next/navigation';
import { getTask, breadcrumbFor } from '@/lib/domain/tasks';
import { areaSlug, listAreas } from '@/lib/domain/areas';
import { readNotes } from '@/lib/domain/notes';
import { admin } from '@/lib/supabase/admin';
import { DeleteTaskButton } from '@/components/entity/DeleteTaskButton';
import { Trail, type TrailItem } from '@/components/entity/Trail';
import { areaColor } from '@/lib/domain/areas-colors';
import { SetPageContext } from '@/components/chat/page-context';
import { PropertiesHeader } from '@/components/entity/PropertiesHeader';
import { InlineText } from '@/components/entity/InlineText';
import { InlineSelect } from '@/components/entity/InlineSelect';
import { DueDateTime } from '@/components/entity/DueDateTime';
import { TaskViews } from '@/components/tasks/TaskViews';
import { NotesEditor } from '@/components/notes/NotesEditor';
import { ledgerForTask, slipCount } from '@/lib/domain/ledger';
import { istDay } from '@/lib/domain/ledger-math';
import { LinkedHabits } from '@/components/habits/LinkedHabits';
import { LinkedBooks } from '@/components/books/LinkedBooks';
import { LedgerSection } from '@/components/ledger/LedgerSection';
import { PRIORITIES } from '@/lib/types/db';
import { listStatuses } from '@/lib/domain/statuses';
import { statusesFor } from '@/lib/types/statuses';
import { formatDate } from '@/lib/time';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const statusOptions = statusesFor(await listStatuses(), 'task').map((s) => ({ value: s.key, label: s.label }));
  const { id } = await params;
  const [task, areas] = await Promise.all([getTask(id), listAreas()]);
  if (!task) notFound();

  const [breadcrumb, notes, ledger, slips] = await Promise.all([
    breadcrumbFor(task),
    readNotes('task', task.id),
    ledgerForTask(task),
    slipCount('task', task.id),
  ]);

  let reminder: { text: string; remind_at: string } | null = null;
  try {
    const { data } = await admin()
      .from('reminders')
      .select('text,remind_at')
      .eq('task_id', task.id)
      .is('cancelled_at', null)
      .is('sent_at', null)
      .order('remind_at')
      .limit(1)
      .maybeSingle();
    reminder = (data as { text: string; remind_at: string } | null) ?? null;
  } catch {
    reminder = null;
  }

  let gcalEventId: string | null = null;
  try {
    const { data } = await admin()
      .from('gcal_links')
      .select('google_event_id')
      .eq('task_id', task.id)
      .maybeSingle();
    gcalEventId = (data as { google_event_id: string } | null)?.google_event_id ?? null;
  } catch {
    gcalEventId = null;
  }

  const area = areas.find((a) => a.id === task.area_id) ?? null;
  const trailItems: TrailItem[] = [
    ...(area ? [{ kind: 'area' as const, label: area.name, href: `/area/${areaSlug(area.name)}`, color: areaColor(area) }] : []),
    ...(breadcrumb.goal ? [{ kind: 'goal' as const, href: `/goals/${breadcrumb.goal.id}`, label: breadcrumb.goal.title }] : []),
    ...(breadcrumb.project ? [{ kind: 'project' as const, href: `/projects/${breadcrumb.project.id}`, label: breadcrumb.project.title }] : []),
    ...breadcrumb.parents.map((p) => ({ kind: 'task' as const, href: `/tasks/${p.id}`, label: p.title })),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <SetPageContext
        ctx={{ route: `/tasks/${task.id}`, entity_type: 'task', entity_id: task.id, area_id: task.area_id }}
      />
      <PropertiesHeader
        actions={<DeleteTaskButton id={task.id} title={task.title} backTo={task.parent_task_id ? `/tasks/${task.parent_task_id}` : task.project_id ? `/projects/${task.project_id}` : task.goal_id ? `/goals/${task.goal_id}` : '/'} />}
        trail={<Trail items={trailItems} />}
        title={
          <InlineText
            value={task.title}
            placeholder="Untitled task"
            save={{ entity: 'task', id: task.id, field: 'title' }}
            textClassName="text-xl font-semibold"
          />
        }
        meta={
          <>
            <InlineSelect
              value={task.status}
              options={statusOptions}
              save={{ entity: 'task', id: task.id, field: 'status' }}
            />
            <InlineSelect
              value={task.priority}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              save={{ entity: 'task', id: task.id, field: 'priority' }}
            />
            <InlineSelect
              value={task.area_id}
              clearable
              options={areas.map((a) => ({ value: a.id, label: a.name }))}
              save={{ entity: 'task', id: task.id, field: 'area_id', mode: 'nullable' }}
            />
            <span className="field">
              Due
              <DueDateTime taskId={task.id} dueDate={task.due_date} dueAt={task.due_at} durationMin={task.duration_min} />
            </span>
            <span className="field">
              Duration (min)
              <InlineText
                value={task.duration_min != null ? String(task.duration_min) : ''}
                placeholder="—"
                save={{ entity: 'task', id: task.id, field: 'duration_min', mode: 'int' }}
                className="w-16"
              />
            </span>
            <span className="field">
              Estimate (min)
              <InlineText
                value={task.estimate_min != null ? String(task.estimate_min) : ''}
                placeholder="30"
                save={{ entity: 'task', id: task.id, field: 'estimate_min', mode: 'int' }}
                className="w-16"
              />
            </span>
            <span className="field">
              Tags
              <InlineText
                value={task.tags.join(', ')}
                placeholder="tag1, tag2"
                save={{ entity: 'task', id: task.id, field: 'tags', mode: 'tags' }}
                className="w-40"
              />
            </span>
          </>
        }
      />

      <LedgerSection name={task.title} agreed={task.original_due_date ?? task.due_date} current={task.due_date} completedOn={task.completed_at ? istDay(task.completed_at) : null} ledger={ledger} slips={slips} />

      <LinkedHabits entityType="task" entityId={task.id} areaId={task.area_id} title="Habits for this task" />

      <LinkedBooks entityType="task" entityId={task.id} title="Books for this task" />

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Subtasks</h2>
        <TaskViews base={{ parent_task_id: task.id }} scope={`subtasks:${task.id}`} createDefaults={{ parent_task_id: task.id }} defaultView="board" defaultPreset="all" hidePresets />
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Notes</h2>
        <NotesEditor type="task" id={task.id} initial={notes} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reminder</h3>
          <p className="mt-1 text-sm">
            {reminder ? `${reminder.text} · ${formatDate(reminder.remind_at.slice(0, 10))}` : 'None'}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Calendar event</h3>
          <p className="mt-1 text-sm">{gcalEventId ? `Linked (${gcalEventId})` : 'None'}</p>
        </div>
      </section>
    </div>
  );
}
