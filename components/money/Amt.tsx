import { formatINR, formatINRCompact } from '@/lib/format';

/** An amount in full on wide screens and in short form (₹22.48K, ₹4.17L) on narrow ones, so it never crowds a small card. */
export function Amt({ value, className }: { value: number; className?: string }) {
  const full = formatINR(value);
  return (
    <span className={className}>
      <span className="sm:hidden" title={full}>{formatINRCompact(value)}</span>
      <span className="hidden sm:inline">{full}</span>
    </span>
  );
}
