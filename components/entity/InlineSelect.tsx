'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ActionResult } from '@/app/actions/_result';

type Option = { value: string; label: string };

type InlineSelectProps = {
  value: string | null;
  options: Option[];
  onSave: (next: string) => Promise<ActionResult<unknown>>;
  placeholder?: string;
  className?: string;
  /** Allow clearing back to no value (renders a "None" option). */
  clearable?: boolean;
};

/**
 * Small controlled dropdown that saves on change through a server action.
 * Shows an optimistic value and reverts with a toast on error.
 */
export function InlineSelect({
  value,
  options,
  onSave,
  placeholder = 'Select…',
  className,
  clearable = false,
}: InlineSelectProps) {
  const [current, setCurrent] = useState<string | null>(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => setCurrent(value), [value]);

  async function handleChange(next: string | null) {
    const prev = current;
    const normalized = next === '__none__' ? null : next;
    setCurrent(normalized);
    setSaving(true);
    const res = await onSave(normalized ?? '');
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || 'Could not save');
      setCurrent(prev);
    }
  }

  return (
    <Select
      value={current ?? undefined}
      onValueChange={(v) => handleChange(v as string)}
      disabled={saving}
    >
      <SelectTrigger size="sm" className={cn('h-7 text-sm', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {clearable && <SelectItem value="__none__">None</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default InlineSelect;
