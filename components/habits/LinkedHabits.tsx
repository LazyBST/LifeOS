import { habitIdsFor, listHabits, type HabitLinkType } from '@/lib/domain/habits';
import { loadHabitRows } from '@/lib/domain/habit-rows';
import { LinkedHabitRow } from './LinkedHabitRow';
import { HabitPicker } from './HabitPicker';

/** Habits attached to a goal, project or task: one compact row each, plus a type-to-find-or-create picker. */
export async function LinkedHabits({ entityType, entityId, areaId, title }: { entityType: HabitLinkType; entityId: string; areaId?: string | null; title: string }) {
  const [ids, all, { rows }] = await Promise.all([habitIdsFor(entityType, entityId).catch(() => new Set<string>()), listHabits().catch(() => []), loadHabitRows().catch(() => ({ rows: new Map() }))]);
  const mine = [...ids].map((id) => rows.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {mine.length === 0 && <p className="text-xs text-muted-foreground">No habits yet. Type below to attach an existing habit or create a new one.</p>}
      <div className="flex flex-col gap-1.5">
        {mine.map((h) => <LinkedHabitRow key={h.id} h={h} entityType={entityType} entityId={entityId} />)}
      </div>
      <HabitPicker entityType={entityType} entityId={entityId} areaId={areaId} options={all.filter((h) => !ids.has(h.id)).map((h) => ({ id: h.id, name: h.name, emoji: h.emoji }))} />
    </section>
  );
}
