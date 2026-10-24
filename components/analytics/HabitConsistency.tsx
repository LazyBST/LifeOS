import { cn } from '@/lib/utils';
import type { HabitConsistencyItem } from '@/app/actions/analytics';
// `import type` only — erased at compile time, so this server component never
// pulls in the 'use server' module's runtime.

type Props = {
  items: HabitConsistencyItem[];
};

/** 90-column heatmap per habit: blank = not due, accent = met, faint red =
 *  missed due day. Current/longest streak shown beside the name. */
export function HabitConsistency({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No habits yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map(({ habit, cells, current, longest }) => (
        <div key={habit.id} className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              {habit.emoji && <span>{habit.emoji}</span>}
              <span className="truncate">{habit.name}</span>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{current}</span> current ·{' '}
              <span className="font-semibold text-foreground">{longest}</span> longest
            </span>
          </div>
          <div
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
          >
            {cells.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}${cell.due ? (cell.met ? ' · done' : ' · missed') : ' · not due'}`}
                className={cn(
                  'aspect-square min-w-[3px] rounded-[1px]',
                  !cell.due && 'bg-muted',
                  cell.due && cell.met && 'bg-[var(--primary)]',
                  cell.due && !cell.met && 'bg-red-500/35',
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default HabitConsistency;
