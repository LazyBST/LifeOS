import Link from 'next/link';
import { admin } from '@/lib/supabase/admin';
import { istDate } from '@/lib/time';
import type { Task } from '@/lib/types/db';

type EventRow = { google_event_id: string; summary: string | null; starts_at: string | null };

async function loadAgenda(): Promise<{ timedTasks: Task[]; events: EventRow[] }> {
  const today = istDate();
  let timedTasks: Task[] = [];
  try {
    const { data } = await admin()
      .from('tasks')
      .select('*')
      .is('deleted_at', null)
      .eq('due_date', today)
      .not('due_at', 'is', null)
      .order('due_at');
    timedTasks = (data ?? []) as Task[];
  } catch {
    timedTasks = [];
  }
  let events: EventRow[] = [];
  try {
    const { data } = await admin()
      .from('calendar_events')
      .select('google_event_id,summary,starts_at')
      .gte('starts_at', `${today}T00:00:00+05:30`)
      .lt('starts_at', `${today}T23:59:59+05:30`)
      .order('starts_at');
    events = (data ?? []) as EventRow[];
  } catch {
    // Google Calendar sync is Part 2; the table may not exist yet
    events = [];
  }
  return { timedTasks, events };
}

function timeOf(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
}

/** Today's calendar events and timed tasks (spec section 6). */
export async function AgendaCard() {
  const { timedTasks, events } = await loadAgenda();
  const hasAny = timedTasks.length > 0 || events.length > 0;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold">Today&apos;s agenda</h2>
      {!hasAny ? (
        <p className="text-sm text-muted-foreground">Nothing scheduled today.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {events.map((e) => (
            <li key={e.google_event_id} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-muted-foreground">{timeOf(e.starts_at)}</span>
              <span className="truncate">{e.summary ?? 'Event'}</span>
            </li>
          ))}
          {timedTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-muted-foreground">{timeOf(t.due_at)}</span>
              <Link href={`/tasks/${t.id}`} className="truncate hover:underline">
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AgendaCard;
