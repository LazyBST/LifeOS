'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteTaskAction, restoreTaskAction } from '@/app/actions/tasks';

/** Delete this task (and its subtasks) from its own page, then go back to where it lived. Undo is in the toast. */
export function DeleteTaskButton({ id, title, backTo }: { id: string; title: string; backTo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function remove() {
    if (!confirm(`Delete “${title}”? Its subtasks go with it. You can undo for a few seconds.`)) return;
    start(async () => {
      const r = await deleteTaskAction(id);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(`Deleted “${title}”`, { duration: 8000, action: { label: 'Undo', onClick: async () => { await restoreTaskAction(id); router.refresh(); } } });
      router.push(backTo);
      router.refresh();
    });
  }
  return (
    <button type="button" onClick={remove} disabled={pending} className="flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-sm text-muted-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10">
      <Trash2 className="size-4" /> Delete
    </button>
  );
}
