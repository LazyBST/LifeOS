'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { setCalendarEmbedAction } from '@/app/actions/widgets';

/** The Google Calendar iframe. Paste the embed link once; it is kept in app settings. */
export function CalendarEmbed({ url }: { url: string | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  const save = (value: string) => start(async () => {
    const r = await setCalendarEmbedAction(value);
    if (!r.ok) { toast.error(r.error); return; }
    setEditing(false); router.refresh();
  });
  if (url && !editing) {
    return (
      <div className="flex h-full flex-col gap-2">
        <iframe src={url} title="Google Calendar" className="min-h-0 w-full flex-1 rounded-lg border border-border bg-white" loading="lazy" referrerPolicy="no-referrer" />
        <button type="button" onClick={() => { setDraft(url); setEditing(true); }} className="self-end text-xs text-muted-foreground hover:underline">Change calendar link</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>Paste your Google Calendar embed link. In Google Calendar: Settings → your calendar → <b>Integrate calendar</b> → copy the <b>Public URL</b> or the <code>src</code> of the embed code. Google shows the calendar in an iframe only to people signed in to a Google account that can see it.</p>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://calendar.google.com/calendar/embed?src=…" className="min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 py-1.5 outline-none focus:border-ring" />
        <button type="button" onClick={() => save(draft)} disabled={!draft.trim()} className="rounded-lg bg-primary px-3 font-medium text-primary-foreground disabled:opacity-50">Save</button>
        {editing && <button type="button" onClick={() => save('')} className="rounded-lg border border-input px-3">Remove</button>}
      </div>
    </div>
  );
}
