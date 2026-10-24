import { Circle, CircleCheck, CircleX, LoaderCircle, Pause, Play, type LucideIcon } from 'lucide-react';
import type { StatusDef } from '@/lib/types/statuses';

const ICONS: Record<string, LucideIcon> = {
  circle: Circle,
  'loader-circle': LoaderCircle,
  'circle-check': CircleCheck,
  'circle-x': CircleX,
  play: Play,
  pause: Pause,
};

export function StatusIcon({ status, className }: { status: StatusDef; className?: string }) {
  const Icon = (status.icon && ICONS[status.icon]) || Circle;
  return <Icon className={className ?? 'size-3.5'} style={{ color: status.color }} aria-hidden />;
}

export function statusVars(s: StatusDef): React.CSSProperties {
  return { '--st': s.color, '--st-bg': s.bg_color, '--st-fg': s.fg_color } as React.CSSProperties;
}

/** Jira-style lozenge: uppercase, tinted, driven entirely by the status row. Server- and client-safe. */
export function StatusBadge({ status, compact = false }: { status: StatusDef; compact?: boolean }) {
  return (
    <span
      style={statusVars(status)}
      className={`inline-flex shrink-0 items-center gap-1 rounded-[3px] font-bold uppercase tracking-wide
        bg-[var(--st-bg)] text-[var(--st-fg)]
        dark:bg-[color-mix(in_srgb,var(--st)_22%,transparent)] dark:text-[var(--st)]
        ${compact ? 'px-1 py-px text-[11px]' : 'px-1.5 py-0.5 text-[12px]'}`}
    >
      {status.label}
    </span>
  );
}
