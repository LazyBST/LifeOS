import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PropertiesHeaderProps = {
  /** Small label above the title, e.g. a breadcrumb or entity kind. */
  eyebrow?: ReactNode;
  /** Emoji or icon rendered beside the title. */
  icon?: ReactNode;
  /** Usually an <InlineText> bound to the title. */
  title: ReactNode;
  /** Small context line shown right under the title (Area, Goal › Project …). */
  trail?: ReactNode;
  /** Row of inline-editable property chips (status, priority, area, dates…). */
  meta?: ReactNode;
  /** Right-aligned actions, e.g. a delete button. */
  actions?: ReactNode;
  /** Extra content under the meta row, e.g. a progress bar. */
  children?: ReactNode;
  className?: string;
};

/**
 * Shared layout for the Area/Goal/Project/Task page headers: a title row,
 * a wrapping row of editable property fields, and optional extra content.
 */
export function PropertiesHeader({
  eyebrow,
  trail,
  icon,
  title,
  meta,
  actions,
  children,
  className,
}: PropertiesHeaderProps) {
  return (
    <header className={cn('space-y-3 border-b pb-5', className)}>
      {eyebrow && <div className="text-sm text-muted-foreground">{eyebrow}</div>}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon && <span className="text-2xl leading-none">{icon}</span>}
          <div className="min-w-0 flex-1 text-xl font-semibold">{title}</div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {trail}
      {meta && <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">{meta}</div>}
      {children}
    </header>
  );
}

export default PropertiesHeader;
