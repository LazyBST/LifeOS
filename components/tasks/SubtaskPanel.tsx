'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { completeTaskAction, createTaskAction, listTasksAction, reopenTaskAction, type TaskListItem } from '@/app/actions/tasks';
import { dueLabel } from '@/lib/time';

/**
 * The subtasks of one task, opened right under it: tick them off, add another by typing a title and pressing Enter.
 * The parent's own list is told after every change so its count stays right.
 */
export function SubtaskPanel({ parentId, onChanged, compact }: { parentId: string; onChanged: () => void; compact?: boolean }) {
  const [items, setItems] = useState<TaskListItem[] | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await listTasksAction({ parent_task_id: parentId, include_done: true });
    if (r.ok) setItems(r.data); else toast.error(r.error);
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await createTaskAction({ title: t, parent_task_id: parentId });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setTitle('');
    await load();
    onChanged();
  }
  async function toggle(t: TaskListItem) {
    setItems((prev) => prev && prev.map((x) => (x.id === t.id ? { ...x, status: t.status === 'done' ? 'todo' : 'done' } : x)));
    const r = t.status === 'done' ? await reopenTaskAction(t.id) : await completeTaskAction(t.id);
    if (!r.ok) toast.error(r.error);
    await load();
    onChanged();
  }

  // inside a draggable card: typing and tapping here must not start a drag
  const guard = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(), onClick: (e: React.MouseEvent) => e.stopPropagation() };
  return (
    <div {...guard} className={`space-y-1 rounded-md border-l-2 border-border/80 bg-muted/40 py-1.5 pr-1.5 pl-2.5 ${compact ? 'text-[13px]' : 'text-sm'}`}>
      {items === null && <p className="text-xs text-muted-foreground">Loading…</p>}
      {items?.map((t) => {
        const done = t.status === 'done';
        const due = dueLabel(t.due_date);
        return (
          <div key={t.id} className="flex items-center gap-2">
            <input type="checkbox" className="size-3.5 accent-primary" checked={done} onChange={() => void toggle(t)} aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`} />
            <Link href={`/tasks/${t.id}`} draggable={false} className={`min-w-0 flex-1 truncate hover:underline ${done ? 'text-muted-foreground line-through' : ''}`}>{t.title}</Link>
            {due && <span className="shrink-0 text-[11px] text-muted-foreground">{due}</span>}
          </div>
        );
      })}
      <input value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }} placeholder="Add a subtask and press Enter" aria-label="New subtask title" className="h-7 w-full rounded border border-transparent bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-card" />
    </div>
  );
}
