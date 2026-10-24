'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';

export type InlineAddTaskProps = {
  placeholder?: string;
  onCreate: (title: string) => void;
  /** 'jira': a "+ Create" button at the foot of a board column that expands into a card-shaped editor */
  variant?: 'row' | 'jira';
};

/** The "Add task" row (lists) or "+ Create" footer (board columns). */
export function InlineAddTask({ placeholder = 'Add task', onCreate, variant = 'row' }: InlineAddTaskProps) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);

  function submit() {
    const title = value.trim();
    if (!title) return;
    onCreate(title);
    setValue('');
  }

  if (variant === 'jira') {
    if (!open) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-9 w-full items-center gap-1.5 rounded-[4px] px-2 text-sm text-[var(--st-fg,#5e6c84)] transition-colors hover:bg-black/5 dark:text-muted-foreground dark:hover:bg-white/10"
        >
          <Plus className="size-4" /> Create
        </button>
      );
    }
    return (
      <div className="rounded-[4px] bg-card p-2 shadow-[0_0_0_2px_#4c9aff]">
        <textarea
          autoFocus
          rows={2}
          value={value}
          placeholder="What needs to be done?"
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => !value.trim() && setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              setValue('');
              setOpen(false);
            }
          }}
        />
        <p className="pt-1 text-[12px] text-muted-foreground">Enter to create · Esc to cancel</p>
      </div>
    );
  }

  return (
    <Input
      value={value}
      placeholder={placeholder}
      className="h-9"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit();
        else if (e.key === 'Escape') setValue('');
      }}
    />
  );
}

export default InlineAddTask;
