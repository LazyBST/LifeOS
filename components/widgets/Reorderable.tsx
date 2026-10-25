'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { saveOrderAction } from '@/app/actions/order';

export type ReorderItem = { id: string; node: ReactNode };

/** Items in the saved order; anything the saved order does not mention keeps its natural place at the end. */
export function applyOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return items
    .map((it, natural) => ({ it, natural }))
    .sort((a, b) => (rank.get(a.it.id) ?? Infinity) - (rank.get(b.it.id) ?? Infinity) || a.natural - b.natural)
    .map((x) => x.it);
}

function Row({ id, children, handleClass }: { id: string; children: ReactNode; handleClass?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }} className={`group/sort flex items-start gap-1 ${isDragging ? 'rounded-lg bg-card opacity-90 shadow-lg' : ''}`}>
      <button type="button" {...attributes} {...listeners} aria-label="Drag to reorder" title="Drag to reorder" className={`no-drag mt-1 shrink-0 cursor-grab touch-none select-none rounded px-0.5 text-xs leading-none text-muted-foreground opacity-50 hover:bg-muted active:cursor-grabbing sm:opacity-0 sm:group-hover/sort:opacity-100 focus-visible:opacity-100 ${handleClass ?? ''}`}>⋮⋮</button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * A list whose rows can be dragged into any order (grab the ⋮⋮ grip). The order is remembered per `orderKey`
 * in the database, so it is the same on every device. `onReorder` replaces that when the order lives elsewhere.
 */
export function Reorderable({ orderKey, order = [], items, className = 'flex flex-col gap-3', grid = false, onReorder }: { orderKey: string; order?: string[]; items: ReorderItem[]; className?: string; /** lay the rows out in a grid rather than a single column */ grid?: boolean; onReorder?: (ids: string[]) => void | Promise<void> }) {
  const [ids, setIds] = useState(() => applyOrder(items, order).map((i) => i.id));
  const key = items.map((i) => i.id).join('|');
  const orderSig = order.join('|');
  useEffect(() => { setIds(applyOrder(items, order).map((i) => i.id)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, orderSig]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const byId = new Map(items.map((i) => [i.id, i.node]));
  const shown = ids.filter((id) => byId.has(id));

  async function end(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(shown, shown.indexOf(String(e.active.id)), shown.indexOf(String(e.over.id)));
    setIds(next);
    if (onReorder) { await onReorder(next); return; }
    const r = await saveOrderAction(orderKey, next);
    if (!r.ok) toast.error(r.error);
  }

  return (
    <DndContext id={`reorder-${orderKey}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void end(e)}>
      <SortableContext items={shown} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={`no-drag ${className}`}>
          {shown.map((id) => <Row key={id} id={id}>{byId.get(id)}</Row>)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
