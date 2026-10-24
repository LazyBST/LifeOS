'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

export type InlineAddTaskProps = {
  placeholder?: string;
  onCreate: (title: string) => void;
};

/** The "Add task" row shown at the top of every list and board column. */
export function InlineAddTask({ placeholder = 'Add task', onCreate }: InlineAddTaskProps) {
  const [value, setValue] = useState('');

  return (
    <Input
      value={value}
      placeholder={placeholder}
      className="h-9"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const title = value.trim();
          if (!title) return;
          onCreate(title);
          setValue('');
        } else if (e.key === 'Escape') {
          setValue('');
        }
      }}
    />
  );
}

export default InlineAddTask;
