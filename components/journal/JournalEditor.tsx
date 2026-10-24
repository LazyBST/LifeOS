'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { MoodPicker } from '@/components/journal/MoodPicker';
import { setMoodAction, writeJournalAction } from '@/app/actions/journal';
import type { JournalEntry } from '@/lib/types/db';

type JournalEditorProps = {
  date: string;
  initialEntry: JournalEntry | null;
  /** Compact mode for the dashboard card: smaller textarea, no heading. */
  compact?: boolean;
};

/** Today's journal entry: a markdown textarea that autosaves 800ms after
 *  typing stops, plus a mood picker (spec sections 6, 8). */
export function JournalEditor({ date, initialEntry, compact = false }: JournalEditorProps) {
  const [body, setBody] = useState(initialEntry?.body_md ?? '');
  const [mood, setMood] = useState<number | null>(initialEntry?.mood ?? null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const savedBody = useRef(initialEntry?.body_md ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBody(initialEntry?.body_md ?? '');
    setMood(initialEntry?.mood ?? null);
    savedBody.current = initialEntry?.body_md ?? '';
  }, [date, initialEntry]);

  function schedule(next: string) {
    setBody(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 800);
  }

  async function save(next: string) {
    if (next === savedBody.current) return;
    setStatus('saving');
    const res = await writeJournalAction({ date, body_md: next, mode: 'replace' });
    if (!res.ok) {
      toast.error(res.error || 'Could not save journal entry');
      setStatus('idle');
      return;
    }
    savedBody.current = next;
    setStatus('saved');
  }

  async function handleMood(next: number) {
    setMood(next);
    const res = await setMoodAction(date, next);
    if (!res.ok) toast.error(res.error || 'Could not save mood');
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Journal</h2>
          <span className="text-xs text-muted-foreground">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
          </span>
        </div>
      )}
      <Textarea
        value={body}
        onChange={(e) => schedule(e.target.value)}
        placeholder="How was your day?"
        className={compact ? 'min-h-20 text-sm' : 'min-h-32'}
      />
      {compact && (
        <div className="flex items-center justify-end text-xs text-muted-foreground">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </div>
      )}
      <MoodPicker value={mood} onSelect={handleMood} />
    </div>
  );
}

export default JournalEditor;
