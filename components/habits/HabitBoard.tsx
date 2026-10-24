'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HabitCard } from '@/components/habits/HabitCard';
import { HabitForm } from '@/components/habits/HabitForm';
import { archiveHabitAction } from '@/app/actions/habits';
import type { HabitStatus } from '@/lib/domain/habits';
import type { Area, Habit, TimeOfDay } from '@/lib/types/db';

const GROUPS: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'any', label: 'No Type' },
];

type HabitBoardProps = {
  initialStatuses: HabitStatus[];
  areas: Area[];
};

/** Habits board grouped Morning / Afternoon / Evening / No Type (spec section 6). */
export function HabitBoard({ initialStatuses, areas }: HabitBoardProps) {
  const [statuses, setStatuses] = useState(initialStatuses);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<HabitStatus | null>(null);
  const router = useRouter();

  useEffect(() => setStatuses(initialStatuses), [initialStatuses]);

  function patchStatus(id: string, patch: Partial<HabitStatus>) {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function handleSaved(habit: Habit) {
    router.refresh();
    if (editing) setEditing(null);
    patchStatus(habit.id, habit as unknown as Partial<HabitStatus>);
  }

  async function handleArchive(id: string) {
    const res = await archiveHabitAction(id);
    if (!res.ok) {
      toast.error(res.error || 'Could not archive habit');
      return;
    }
    setStatuses((prev) => prev.filter((s) => s.id !== id));
    toast.success('Habit archived');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Habits</h1>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" />
          Add habit
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map((g) => {
          const items = statuses.filter((s) => s.time_of_day === g.key);
          return (
            <div key={g.key} className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                {g.label} {items.length > 0 && <span className="text-xs">({items.length})</span>}
              </h2>
              <div className="flex flex-col gap-2">
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No habits
                  </p>
                )}
                {items.map((item) => (
                  <HabitCard
                    key={item.id}
                    status={item}
                    onChange={(patch) => patchStatus(item.id, patch)}
                    onEdit={() => setEditing(item)}
                    onArchive={() => handleArchive(item.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <HabitForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        areas={areas}
        onSaved={(habit) => {
          router.refresh();
          setCreateOpen(false);
          void habit;
        }}
      />

      <HabitForm
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        mode="edit"
        habit={editing}
        areas={areas}
        onSaved={handleSaved}
      />
    </div>
  );
}

export default HabitBoard;
