import type { ReactNode } from 'react';

/** Card chrome for a dashboard widget. The header is the drag handle of the grid. */
export function WidgetCard({ title, sub, right, children, bodyClassName = '' }: {
  title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; bodyClassName?: string;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="drag-handle flex cursor-grab items-center gap-2 px-4 pt-3 pb-2 active:cursor-grabbing">
        <span aria-hidden className="select-none text-xs leading-none tracking-tighter text-muted-foreground/60">⋮⋮</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight">{title}</h2>
          {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        {right && <div className="no-drag shrink-0">{right}</div>}
      </header>
      <div className={`min-h-0 flex-1 overflow-auto px-4 pb-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
