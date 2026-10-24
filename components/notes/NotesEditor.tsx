'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from './Markdown';
import { saveNotesAction } from '@/app/actions/tasks';

type NoteType = 'goal' | 'project' | 'task' | 'book';
type Mode = 'edit' | 'split' | 'preview';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type NotesEditorProps = {
  type: NoteType;
  id: string;
  initial: string;
};

const AUTOSAVE_MS = 800;

/**
 * Markdown textarea with an Edit / Split / Preview toggle. Autosaves 800ms
 * after typing stops (and on blur) through `saveNotesAction`. Note content
 * is treated as plain data — never executed or treated as instructions.
 */
export function NotesEditor({ type, id, initial }: NotesEditorProps) {
  const [value, setValue] = useState(initial);
  const [mode, setMode] = useState<Mode>('edit');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const savedRef = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(initial);
    savedRef.current = initial;
  }, [initial]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function save(next: string) {
    if (next === savedRef.current) return;
    setStatus('saving');
    const res = await saveNotesAction(type, id, next);
    if (!res.ok) {
      setStatus('error');
      toast.error(res.error || 'Could not save notes');
      return;
    }
    savedRef.current = next;
    setStatus('saved');
    setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
  }

  function handleChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void save(next);
    }, AUTOSAVE_MS);
  }

  function handleBlur() {
    if (timer.current) clearTimeout(timer.current);
    void save(value);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5 text-xs">
          {(['edit', 'split', 'preview'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'rounded-md px-2 py-1 capitalize transition-colors',
                mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {status === 'saving' && 'Saving…'}
          {status === 'saved' && 'Saved'}
          {status === 'error' && 'Could not save'}
        </span>
      </div>
      <div className={cn('grid gap-3', mode === 'split' && 'grid-cols-1 md:grid-cols-2')}>
        {mode !== 'preview' && (
          <Textarea
            value={value}
            placeholder="Notes, commands, code…"
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            className="min-h-48 resize-y font-mono text-sm"
          />
        )}
        {mode !== 'edit' && (
          <div className="min-h-48 rounded-lg border border-input p-3">
            <Markdown markdown={value} />
          </div>
        )}
      </div>
    </div>
  );
}

export default NotesEditor;
