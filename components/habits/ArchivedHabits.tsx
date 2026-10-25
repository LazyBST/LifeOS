'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { unarchiveHabitAction } from '@/app/actions/habits';
import { formatDate } from '@/lib/time';

export type ArchivedHabit = { id: string; name: string; emoji: string | null; schedule: string; time: string | null; archivedOn: string };

/** Habits that are paused. They appear nowhere else and count in no analytics until restored. */
export function ArchivedHabits({ items }: { items: ArchivedHabit[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing archived. Archive a habit from its ⋯ menu to pause it.</p>;
  function restore(h: ArchivedHabit) {
    start(async () => {
      const r = await unarchiveHabitAction(h.id);
      if (!r.ok) toast.error(r.error);
      else { toast.success(`${h.name} is back, with its history.`); router.refresh(); }
    });
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr><th className="py-1.5 pr-3 font-semibold">Habit</th><th className="py-1.5 pr-3 font-semibold">Repeats</th><th className="py-1.5 pr-3 font-semibold">Archived</th><th /></tr>
        </thead>
        <tbody className="divide-y">
          {items.map((h) => (
            <tr key={h.id}>
              <td className="py-2 pr-3 font-medium">{h.emoji ? `${h.emoji} ` : ''}{h.name}{h.time ? <span className="ml-2 text-xs font-normal text-muted-foreground">{h.time}</span> : null}</td>
              <td className="py-2 pr-3 text-muted-foreground">{h.schedule}</td>
              <td className="py-2 pr-3 text-muted-foreground">{formatDate(h.archivedOn)}</td>
              <td className="py-2 text-right"><button type="button" disabled={pending} onClick={() => restore(h)} className="rounded-lg border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50">Restore</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
