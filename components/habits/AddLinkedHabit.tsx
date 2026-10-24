'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createHabitAction } from '@/app/actions/habits';

/** Quick add: type a name, press Enter — a daily habit linked to this goal or task. */
export function AddLinkedHabit({ goalId, taskId, areaId }: { goalId?: string; taskId?: string; areaId?: string | null }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [, start] = useTransition();
  function add() {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      const r = await createHabitAction({ name: n, goal_id: goalId ?? null, task_id: taskId ?? null, area_id: areaId ?? null });
      if (!r.ok) { toast.error(r.error); return; }
      setName(''); router.refresh();
    });
  }
  return (
    <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="+ Add a habit (Enter)" className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-ring" />
  );
}
