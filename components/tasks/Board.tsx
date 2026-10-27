'use client';
import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StatusIcon, statusVars } from '@/components/status/StatusBadge';
import { useStatuses } from '@/components/status/StatusProvider';
import { boardColumns, isDone, type StatusDef } from '@/lib/types/statuses';
import type { TaskStatus } from '@/lib/types/db';
import type { TaskListItem } from '@/app/actions/tasks';
import { TaskCard } from './TaskCard';
import type { QuickUpdate } from './QuickEdit';
import { InlineAddTask } from './InlineAddTask';
import type { TaskCreateInput } from './useTaskViewState';

export type BoardProps = {
  tasks: TaskListItem[];
  onMove: (id: string, status: TaskStatus, sortOrder?: number) => void;
  onComplete: (id: string) => void;
  onDelete?: (id: string) => void;
  onCreate: (input: TaskCreateInput) => void;
  onUpdate?: QuickUpdate;
  onSubtasksChanged?: () => void;
  createDefaults?: TaskCreateInput;
};

export function Board({ tasks, onMove, onComplete, onDelete, onCreate, onUpdate, onSubtasksChanged, createDefaults }: BoardProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // on a touch screen a card is picked up by pressing and holding, so swiping still scrolls the board
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const statuses = useStatuses();
  const defs = useMemo(() => boardColumns(statuses, 'task'), [statuses]);
  const keys = useMemo(() => defs.map((d) => d.key), [defs]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const columns = useMemo(() => {
    const byStatus: Record<string, TaskListItem[]> = Object.fromEntries(keys.map((k) => [k, []]));
    for (const t of tasks) (byStatus[t.status] ??= []).push(t);
    for (const k of keys) byStatus[k].sort((a, b) => a.sort_order - b.sort_order);
    return byStatus;
  }, [tasks, keys]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeId = String(active.id);
    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;

    const overData = over.data.current as { status?: TaskStatus } | undefined;
    const destStatus: TaskStatus =
      overData?.status ?? (keys.includes(String(over.id)) ? String(over.id) : task.status);

    if (isDone(statuses, destStatus)) {
      if (!isDone(statuses, task.status)) onComplete(activeId);
      return;
    }

    const destList = columns[destStatus].filter((t) => t.id !== activeId);
    const overIndex = destList.findIndex((t) => t.id === over.id);
    // dragging down inside a column drops the card AFTER the one it is over (dragging up drops it before)
    const src = columns[task.status] ?? [];
    const movedDown = destStatus === task.status && src.findIndex((t) => t.id === activeId) < src.findIndex((t) => t.id === over.id);
    let newOrder: number;
    if (overIndex === -1) {
      newOrder = destList.length ? destList[destList.length - 1].sort_order + 1 : Date.now() / 1000;
    } else if (movedDown) {
      const prev = destList[overIndex];
      const next = destList[overIndex + 1];
      newOrder = next ? (prev.sort_order + next.sort_order) / 2 : prev.sort_order + 1;
    } else {
      const prev = destList[overIndex - 1];
      const next = destList[overIndex];
      newOrder = prev ? (prev.sort_order + next.sort_order) / 2 : next.sort_order - 1;
    }
    if (destStatus === task.status && newOrder === task.sort_order) return;
    onMove(activeId, destStatus, newOrder);
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : undefined;
  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-2 overflow-x-auto pb-2">
        {defs.map((def) => (
          <Column
            key={def.key}
            def={def}
            tasks={columns[def.key] ?? []}
            onCreate={onCreate}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onSubtasksChanged={onSubtasksChanged}
            createDefaults={createDefaults}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <TaskCard task={activeTask} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({
  def,
  tasks,
  onCreate,
  onDelete,
  onUpdate,
  onSubtasksChanged,
  createDefaults,
}: {
  def: StatusDef;
  tasks: TaskListItem[];
  onCreate: (input: TaskCreateInput) => void;
  onDelete?: (id: string) => void;
  onUpdate?: QuickUpdate;
  onSubtasksChanged?: () => void;
  createDefaults?: TaskCreateInput;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: def.key, data: { status: def.key } });
  return (
    <div
      ref={setNodeRef}
      style={statusVars(def)}
      className={`flex min-h-40 min-w-[240px] flex-1 basis-0 flex-col gap-2 rounded-lg p-2 pt-3 transition-shadow
        bg-[color-mix(in_srgb,var(--st-bg)_70%,white)] dark:bg-[color-mix(in_srgb,var(--st)_11%,var(--card))]
        ${isOver ? 'ring-2 ring-[#4c9aff]' : ''}`}
    >
      <div className="flex items-center gap-1.5 px-1.5">
        <StatusIcon status={def} className="size-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--st-fg)] dark:text-[var(--st)]">
          {def.label}
        </span>
        <span className="rounded-full bg-white/60 px-1.5 text-xs font-semibold text-[var(--st-fg)] dark:bg-white/10 dark:text-[var(--st)]">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} onDelete={onDelete} onUpdate={onUpdate} onSubtasksChanged={onSubtasksChanged} />
          ))}
        </div>
      </SortableContext>
      <InlineAddTask
        variant="jira"
        onCreate={(title) => onCreate({ ...createDefaults, title, status: def.key })}
      />
    </div>
  );
}

function SortableCard({ task, onDelete, onUpdate, onSubtasksChanged }: { task: TaskListItem; onDelete?: (id: string) => void; onUpdate?: QuickUpdate; onSubtasksChanged?: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onDelete={onDelete} onUpdate={onUpdate} onSubtasksChanged={onSubtasksChanged} />
    </div>
  );
}

export default Board;
