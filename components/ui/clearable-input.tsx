'use client';
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = React.ComponentProps<'input'> & {
  /** called when the small cross is pressed */
  onClear: () => void;
  wrapperClassName?: string;
  clearLabel?: string;
};

/**
 * An input with a small cross that empties it. It only shows while there is something to clear. On date and time
 * fields the cross sits left of the browser's own picker icon.
 */
export function ClearableInput({ onClear, wrapperClassName, clearLabel = 'Clear', className, ...props }: Props) {
  const filled = props.value !== undefined && props.value !== null && String(props.value) !== '';
  const picker = props.type === 'date' || props.type === 'time' || props.type === 'datetime-local';
  const show = filled && !props.disabled && !props.readOnly;
  return (
    <span className={cn('relative inline-flex min-w-0 items-center', wrapperClassName)}>
      <Input {...props} className={cn(show && (picker ? 'pr-12' : 'pr-7'), className)} />
      {show && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // keep focus in the field
          onClick={onClear}
          aria-label={clearLabel}
          title={clearLabel}
          className={cn('absolute top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/25 text-[11px] leading-none text-foreground/70 hover:bg-muted-foreground/45', picker ? 'right-7' : 'right-2')}
        >
          ×
        </button>
      )}
    </span>
  );
}
