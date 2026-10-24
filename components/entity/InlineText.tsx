'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/app/actions/_result';

type InlineTextProps = {
  value: string;
  onSave: (next: string) => Promise<ActionResult<unknown>>;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  /** Rendered element, e.g. a bigger font for a page title. */
  textClassName?: string;
};

/**
 * Small controlled text field that shows an optimistic value and saves on
 * blur (or Enter, for single-line fields) through a server action. Reverts
 * and toasts on error.
 */
export function InlineText({
  value,
  onSave,
  placeholder = 'Untitled',
  className,
  multiline = false,
  textClassName,
}: InlineTextProps) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(value);

  useEffect(() => {
    setDraft(value);
    savedRef.current = value;
  }, [value]);

  async function commit() {
    const next = draft;
    if (next === savedRef.current) return;
    setSaving(true);
    const res = await onSave(next);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || 'Could not save');
      setDraft(savedRef.current);
      return;
    }
    savedRef.current = next;
  }

  const shared = cn(
    'w-full rounded-md bg-transparent px-1.5 py-0.5 outline-none transition-colors hover:bg-muted focus:bg-muted focus:ring-1 focus:ring-ring disabled:opacity-60',
    textClassName,
    className,
  );

  if (multiline) {
    return (
      <textarea
        value={draft}
        placeholder={placeholder}
        disabled={saving}
        rows={3}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(savedRef.current);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className={cn(shared, 'resize-none')}
      />
    );
  }

  return (
    <input
      value={draft}
      placeholder={placeholder}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(savedRef.current);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={shared}
    />
  );
}

export default InlineText;
