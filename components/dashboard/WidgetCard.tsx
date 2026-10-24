import type { ReactNode } from 'react';

/** Card chrome for a dashboard widget. The header is the drag handle of the grid. */
export function WidgetCard({ title, sub, right, children, bodyClassName = '' }: {
  title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; bodyClassName?: string;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_1px_3px_rgba(27,31,42,0.08),0_4px_12px_rgba(27,31,42,0.04)]">
      <header className="drag-handle flex cursor-grab items-center gap-2 px-5 pt-4 pb-3 active:cursor-grabbing">
        <span aria-hidden className="select-none text-xs leading-none tracking-tighter text-muted-foreground/60">⋮⋮</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight">{title}</h2>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
        {right && <div className="no-drag shrink-0">{right}</div>}
      </header>
      <div className={`min-h-0 flex-1 overflow-auto px-5 pb-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
