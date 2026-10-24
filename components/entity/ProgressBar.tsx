import { cn } from '@/lib/utils';

type ProgressBarProps = {
  pct: number;
  label?: string;
  /** Extra text shown after the percentage, e.g. "12h left · on track". */
  sublabel?: string;
  className?: string;
};

/** Thin effort-based progress bar used on Area/Goal/Project headers. */
export function ProgressBar({ pct, label = 'Progress', sublabel, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(pct)));
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {clamped}%{sublabel ? ` · ${sublabel}` : ''}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;
