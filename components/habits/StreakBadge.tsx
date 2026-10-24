import { cn } from '@/lib/utils';

type StreakBadgeProps = {
  current: number;
  longest?: number;
  className?: string;
};

/** Small 🔥 streak chip shown on habit cards and the heatmap. */
export function StreakBadge({ current, longest, className }: StreakBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600 dark:text-orange-400',
        className,
      )}
      title={longest != null ? `Longest streak: ${longest} days` : undefined}
    >
      🔥 {current}
      {longest != null && longest > current && (
        <span className="text-muted-foreground">· best {longest}</span>
      )}
    </span>
  );
}

export default StreakBadge;
