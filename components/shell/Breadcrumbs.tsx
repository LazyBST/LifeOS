'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export type BreadcrumbItem = {
  href?: string;
  label: string;
};

/**
 * Small presentational breadcrumb trail, e.g. Goal > Project > Task.
 * Entity pages (owned by other workers) render this with their own items.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="field">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1">
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-foreground hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-foreground font-medium' : undefined}>{item.label}</span>
            )}
            {!isLast && <ChevronRight className="size-3.5 shrink-0" />}
          </span>
        );
      })}
    </nav>
  );
}

export default Breadcrumbs;
