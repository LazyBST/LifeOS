'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type EntityGroupProps = {
  title: ReactNode;
  href?: string;
  /** Right-aligned summary, e.g. "3 projects · 5 open tasks". */
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Collapsible section used to group an Area's goals, a Goal's projects, or a
 * Project's tasks on the entity pages.
 */
export function EntityGroup({ title, href, meta, defaultOpen = true, children, className }: EntityGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn('rounded-lg ring-1 ring-foreground/10', className)}>
      <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left font-medium"
        >
          <ChevronDown
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
          />
          {href ? (
            <Link href={href} className="truncate hover:underline" onClick={(e) => e.stopPropagation()}>
              {title}
            </Link>
          ) : (
            <span className="truncate">{title}</span>
          )}
        </button>
        {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
      </div>
      {open && <div className="space-y-2 border-t px-3 py-2.5">{children}</div>}
    </section>
  );
}

export default EntityGroup;
