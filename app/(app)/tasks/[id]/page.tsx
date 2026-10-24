import { notFound } from 'next/navigation';
import { getTask, breadcrumbFor, listSubtasks } from '@/lib/domain/tasks';
import { listAreas } from '@/lib/domain/areas';
import { readNotes } from '@/lib/domain/notes';
import { admin } from '@/lib/supabase/admin';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/shell/Breadcrumbs';
import { SetPageContext } from '@/components/chat/page-context';
import { PropertiesHeader } from '@/components/entity/PropertiesHeader';
import { InlineText } from '@/components/entity/InlineText';
import { InlineSelect } from '@/components/entity/InlineSelect';
import { DueDateTime } from '@/components/entity/DueDateTime';
import { SubtaskList } from '@/components/entity/SubtaskList';
import { NotesEditor } from '@/components/notes/NotesEditor';
import { updateTaskAction } from '@/app/actions/tasks';
import { ledgerForTask, slipCount } from '@/lib/domain/ledger';
import { istDay } from '@/lib/domain/ledger-math';
import { LedgerSection } from '@/components/ledger/LedgerSection';
import { PRIORITIES } from '@/lib/types/db';
import { listStatuses } from '@/lib/domain/statuses';
import { statusesFor } from '@/lib/types/statuses';
import { formatDate } from '@/lib/time';
import type { Priority, TaskStatus } from '@/lib/types/db';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const statusOptions = statusesFor(await listStatuses(), 'task').map((s) => ({ value: s.key, label: s.label }));
  const { id } = await params;
  const [task, areas] = await Promise.all([getTask(id), listAreas()]);
  if (!task) notFound();

  const [breadcrumb, subtasks, notes, ledger, slips] = await Promise.all([
    breadcrumbFor(task),
    listSubtasks(task.id),
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

  const breadcrumbItems: BreadcrumbItem[] = [
    ...(breadcrumb.goal ? [{ href: `/goals/${breadcrumb.goal.id}`, label: breadcrumb.goal.title }] : []),
    ...(breadcrumb.project ? [{ href: `/projects/${breadcrumb.project.id}`, label: breadcrumb.project.title }] : []),
    ...breadcrumb.parents.map((p) => ({ href: `/tasks/${p.id}`, label: p.title })),
    { label: task.title },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <SetPageContext
        ctx={{ route: `/tasks/${task.id}`, entity_type: 'task', entity_id: task.id, area_id: task.area_id }}
      />
      <Breadcrumbs items={breadcrumbItems} />

      <PropertiesHeader
        title={
          <InlineText
            value={task.title}
            placeholder="Untitled task"
            onSave={(v) => updateTaskAction(task.id, { title: v })}
            textClassName="text-xl font-semibold"
          />
        }
        meta={
          <>
            <InlineSelect
              value={task.status}
              options={statusOptions}
              onSave={(v) => updateTaskAction(task.id, { status: v as TaskStatus })}
            />
            <InlineSelect
              value={task.priority}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              onSave={(v) => updateTaskAction(task.id, { priority: v as Priority })}
            />
            <InlineSelect
              value={task.area_id}
              clearable
              options={areas.map((a) => ({ value: a.id, label: a.name }))}
              onSave={(v) => updateTaskAction(task.id, { area_id: v || null })}
            />
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Due
              <DueDateTime taskId={task.id} dueDate={task.due_date} dueAt={task.due_at} />
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Duration (min)
              <InlineText
                value={task.duration_min != null ? String(task.duration_min) : ''}
                placeholder="—"
                onSave={(v) =>
                  updateTaskAction(task.id, {
                    duration_min: v.trim() === '' ? null : Math.max(0, parseInt(v, 10) || 0),
                  })
                }
                className="w-16"
              />
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Estimate (min)
              <InlineText
                value={task.estimate_min != null ? String(task.estimate_min) : ''}
                placeholder="30"
                onSave={(v) =>
                  updateTaskAction(task.id, {
                    estimate_min: v.trim() === '' ? null : Math.max(0, parseInt(v, 10) || 0),
                  })
                }
                className="w-16"
              />
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Tags
              <InlineText
                value={task.tags.join(', ')}
                placeholder="tag1, tag2"
                onSave={(v) =>
                  updateTaskAction(task.id, {
                    tags: v
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                className="w-40"
              />
            </span>
          </>
        }
      />

      <LedgerSection name={task.title} agreed={task.original_due_date ?? task.due_date} current={task.due_date} completedOn={task.completed_at ? istDay(task.completed_at) : null} ledger={ledger} slips={slips} />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Subtasks</h2>
        <SubtaskList
          parentTaskId={task.id}
          initial={subtasks}
          areaId={task.area_id}
          goalId={task.goal_id}
          projectId={task.project_id}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Notes</h2>
        <NotesEditor type="task" id={task.id} initial={notes} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg ring-1 ring-foreground/10 p-3">
          <h3 className="text-xs font-medium text-muted-foreground">Reminder</h3>
          <p className="mt-1 text-sm">
            {reminder ? `${reminder.text} · ${formatDate(reminder.remind_at.slice(0, 10))}` : 'None'}
          </p>
        </div>
        <div className="rounded-lg ring-1 ring-foreground/10 p-3">
          <h3 className="text-xs font-medium text-muted-foreground">Calendar event</h3>
          <p className="mt-1 text-sm">{gcalEventId ? `Linked (${gcalEventId})` : 'None'}</p>
        </div>
      </section>
    </div>
  );
}
