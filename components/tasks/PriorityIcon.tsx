import { ChevronDown, ChevronUp, ChevronsUp, Equal } from 'lucide-react';

const MAP = {
  P0: { Icon: ChevronsUp, color: '#dc2626', label: 'Highest' },
  P1: { Icon: ChevronUp, color: '#ea580c', label: 'High' },
  P2: { Icon: Equal, color: '#d97706', label: 'Medium' },
  P3: { Icon: ChevronDown, color: '#2563eb', label: 'Low' },
} as const;

/** Jira-style priority glyph. */
export function PriorityIcon({ priority, className = 'size-4' }: { priority: string; className?: string }) {
  const m = MAP[priority as keyof typeof MAP] ?? MAP.P2;
  return (
    <span title={`${priority} · ${m.label}`} className="inline-flex shrink-0">
      <m.Icon className={className} style={{ color: m.color }} strokeWidth={3} aria-label={`${priority} ${m.label}`} />
    </span>
  );
}
