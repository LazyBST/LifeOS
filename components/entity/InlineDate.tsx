'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/app/actions/_result';

type InlineDateProps = {
  /** 'YYYY-MM-DD' for type="date"; 'HH:MM' for type="time"; or null/empty. */
  value: string | null;
  onSave: (next: string | null) => Promise<ActionResult<unknown>>;
  type?: 'date' | 'time';
  className?: string;
  placeholder?: string;
};

/**
 * Small controlled date or time field that saves on blur/change through a
 * server action. Shows an optimistic value and reverts with a toast on error.
 */
export function InlineDate({ value, onSave, type = 'date', className, placeholder }: InlineDateProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
    savedRef.current = value ?? '';
  }, [value]);

  async function commit(next: string) {
    if (next === savedRef.current) return;
    setSaving(true);
    const res = await onSave(next || null);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || 'Could not save');
      setDraft(savedRef.current);
      return;
    }
    savedRef.current = next;
  }

  return (
    <Input
      type={type}
      value={draft}
      placeholder={placeholder}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      className={cn('h-7 w-auto text-sm', className)}
    />
  );
}

export default InlineDate;
