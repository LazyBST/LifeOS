'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Option = { value: string; label: string };
type Props = {
  /** the current value as text ('' for empty) */
  value: string;
  /** what to show when not editing (defaults to the value) */
  display?: ReactNode;
  type?: 'text' | 'number' | 'date';
  /** a list of choices: the cell becomes a drop-down when clicked */
  options?: Option[];
  placeholder?: string;
  align?: 'left' | 'right';
  label: string;
  /** return an error message to refuse the change; the cell goes back to what it was */
  onCommit: (next: string) => Promise<string | null | void> | string | null | void;
  className?: string;
};

/**
 * Looks like ordinary text. Click it and it turns into a text box, date box or drop-down right where it is;
 * Enter or clicking away saves, Escape puts it back.
 */
export function Editable({ value, display, type = 'text', options, placeholder = '—', align = 'left', label, onCommit, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  async function commit(next: string) {
    setEditing(false);
    if (next === value) return;
    setBusy(true);
    const err = await onCommit(next);
    setBusy(false);
    if (err) setDraft(value);
  }

  const shown = display ?? (value || <span className="text-muted-foreground">{placeholder}</span>);
  if (!editing) {
    return (
      <button type="button" onClick={() => { cancelled.current = false; setEditing(true); }} disabled={busy} aria-label={`Edit ${label}`} title={`Click to edit ${label.toLowerCase()}`}
        className={cn('-mx-1 max-w-full cursor-text rounded px-1 py-0.5 text-inherit hover:bg-muted/80 focus-visible:bg-muted/80 focus-visible:outline-none disabled:opacity-50', align === 'right' ? 'text-right' : 'text-left', className)}>
        {shown}
      </button>
    );
  }
  const common = 'h-7 w-full min-w-24 rounded-md border border-ring bg-card px-1.5 text-sm outline-none';
  if (options) {
    return (
      <select autoFocus aria-label={label} value={draft} className={cn(common, className)}
        onChange={(e) => { setDraft(e.target.value); void commit(e.target.value); }} onBlur={() => setEditing(false)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input autoFocus aria-label={label} type={type} step={type === 'number' ? 'any' : undefined} inputMode={type === 'number' ? 'decimal' : undefined} value={draft}
      className={cn(common, align === 'right' && 'text-right', className)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (cancelled.current) { cancelled.current = false; setEditing(false); } else void commit(draft); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        else if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur(); }
      }} />
  );
}
