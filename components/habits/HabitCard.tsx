'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Archive, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { checkinHabitAction } from '@/app/actions/habits';
import { StreakBadge } from '@/components/habits/StreakBadge';
import type { HabitStatus } from '@/lib/domain/habits';

type Patch = {
  value: number;
  done: boolean;
  current_streak: number;
  longest_streak: number;
};

type HabitCardProps = {
  status: HabitStatus;
  /** Smaller rendering for the dashboard card: no edit/archive controls. */
  compact?: boolean;
  onChange?: (patch: Patch) => void;
  onEdit?: () => void;
  onArchive?: () => void;
};

/** One habit: emoji, name, target, today's value, tap-to-check-in, streak. */
export function HabitCard({ status, compact = false, onChange, onEdit, onArchive }: HabitCardProps) {
  const target = Number(status.target_value);
  const [local, setLocal] = useState<Patch>({
    value: status.value,
    done: status.done,
    current_streak: status.current_streak,
    longest_streak: status.longest_streak,
  });
  const [draft, setDraft] = useState(String(status.value));
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setLocal({
      value: status.value,
      done: status.done,
      current_streak: status.current_streak,
      longest_streak: status.longest_streak,
    });
    setDraft(String(status.value));
  }, [status.value, status.done, status.current_streak, status.longest_streak]);

  function commit(value: number) {
    const clamped = Math.max(0, value);
    const optimistic: Patch = { ...local, value: clamped, done: clamped >= target };
    setLocal(optimistic);
    setDraft(String(clamped));
    startTransition(async () => {
      const res = await checkinHabitAction(status.id, { value: clamped });
      if (!res.ok) {
        toast.error(res.error || 'Could not check in');
        setLocal({
          value: status.value,
          done: status.done,
          current_streak: status.current_streak,
          longest_streak: status.longest_streak,
        });
        setDraft(String(status.value));
        return;
      }
      const patch: Patch = {
        value: Number(res.data.checkin.value),
        done: Number(res.data.checkin.value) >= target,
        current_streak: res.data.current_streak,
        longest_streak: res.data.longest_streak,
      };
      setLocal(patch);
      setDraft(String(patch.value));
      onChange?.(patch);
    });
  }

  const targetLabel =
    status.kind === 'boolean' ? '✓' : `${target}${status.unit ? ` ${status.unit}` : ''}`;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border bg-card p-3',
        compact && 'p-2',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {status.emoji && <span className="text-base leading-none">{status.emoji}</span>}
          <span className="truncate text-sm font-medium">{status.name}</span>
        </div>
        {!compact && (onEdit || onArchive) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {onEdit && (
              <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit habit">
                <Pencil className="size-3.5" />
              </Button>
            )}
            {onArchive && (
              <Button type="button" variant="ghost" size="icon-sm" onClick={onArchive} aria-label="Archive habit">
                <Archive className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Target: {targetLabel}</span>
        <StreakBadge current={local.current_streak} longest={local.longest_streak} />
      </div>

      <div className="flex items-center gap-2">
        {status.kind === 'boolean' ? (
          <Button
            type="button"
            variant={local.done ? 'default' : 'outline'}
            disabled={pending}
            onClick={() => commit(local.done ? 0 : target)}
            className={cn('h-11 min-w-11 flex-1 gap-1.5', local.done && 'bg-emerald-600 hover:bg-emerald-600/90')}
          >
            <Check className="size-4" />
            {local.done ? 'Done' : 'Check in'}
          </Button>
        ) : (
          <div className="flex flex-1 items-center gap-1.5">
            <Input
              type="number"
              inputMode="decimal"
              value={draft}
              disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                const n = Number(draft);
                if (!Number.isNaN(n) && n !== local.value) commit(n);
                else setDraft(String(local.value));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="h-11 w-full text-center"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={pending}
              aria-label="Add one"
              onClick={() => commit(local.value + 1)}
              className="h-11 w-11 shrink-0"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default HabitCard;
