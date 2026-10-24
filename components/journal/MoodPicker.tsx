'use client';

import { cn } from '@/lib/utils';

const MOODS: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: '😞', label: 'Rough' },
  { value: 2, emoji: '🙁', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
];

type MoodPickerProps = {
  value: number | null;
  onSelect: (mood: number) => void;
  disabled?: boolean;
  className?: string;
};

/** Row of 1-5 mood buttons (spec sections 6, 8). */
export function MoodPicker({ value, onSelect, disabled, className }: MoodPickerProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {MOODS.map((m) => (
        <button
          key={m.value}
          type="button"
          disabled={disabled}
          aria-label={m.label}
          aria-pressed={value === m.value}
          onClick={() => onSelect(m.value)}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full border text-lg transition-colors',
            value === m.value
              ? 'border-primary bg-primary/10'
              : 'border-border bg-transparent hover:bg-muted',
          )}
        >
          {m.emoji}
        </button>
      ))}
    </div>
  );
}

export default MoodPicker;
