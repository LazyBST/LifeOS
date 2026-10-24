import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { addDays } from '@/lib/time';
import { istInstant } from '@/lib/time';

export type WeekBlock = { id: string; title: string; start: string; end: string; kind: 'event' | 'task'; done?: boolean; href?: string };
export type WeekBar = { id: string; title: string; from: string; to: string; kind: 'goal' | 'project'; href: string; color?: string };
export type WeekData = { weekStart: string; blocks: WeekBlock[]; allDay: { id: string; title: string; date: string }[]; bars: WeekBar[] };

/** Everything the week view draws: calendar events, timed tasks, all-day items, goal/project spans. */
export async function weekData(weekStart: string): Promise<WeekData> {
  const weekEnd = addDays(weekStart, 6);
  const from = istInstant(weekStart, '00:00').toISOString();
  const to = istInstant(addDays(weekStart, 7), '00:00').toISOString();
  const [ev, tasks, goals, projects] = await Promise.all([
    admin().from('calendar_events').select('google_event_id,summary,starts_at,ends_at,all_day').lt('starts_at', to).gte('ends_at', from).limit(300),
    admin().from('tasks').select('id,title,due_at,duration_min,status').is('deleted_at', null).gte('due_at', from).lt('due_at', to).limit(300),
    admin().from('goals').select('id,title,emoji,start_date,target_date,area_id').is('deleted_at', null).eq('status', 'active').lte('start_date', weekEnd).gte('target_date', weekStart).limit(50),
    admin().from('projects').select('id,title,emoji,start_date,target_date').is('deleted_at', null).eq('status', 'active').lte('start_date', weekEnd).gte('target_date', weekStart).limit(50),
  ]);
  const blocks: WeekBlock[] = [];
  const allDay: WeekData['allDay'] = [];
  for (const e of (ev.data ?? []) as { google_event_id: string; summary: string | null; starts_at: string; ends_at: string; all_day: boolean | null }[]) {
    if (e.all_day) allDay.push({ id: e.google_event_id, title: e.summary ?? 'Event', date: new Date(new Date(e.starts_at).getTime() + 330 * 60_000).toISOString().slice(0, 10) });
    else blocks.push({ id: e.google_event_id, title: e.summary ?? 'Event', start: e.starts_at, end: e.ends_at, kind: 'event' });
  }
  for (const t of (tasks.data ?? []) as { id: string; title: string; due_at: string; duration_min: number | null; status: string }[]) {
    const end = new Date(new Date(t.due_at).getTime() + (t.duration_min ?? 30) * 60_000).toISOString();
    blocks.push({ id: t.id, title: t.title, start: t.due_at, end, kind: 'task', done: t.status === 'done', href: `/tasks/${t.id}` });
  }
  const bars: WeekBar[] = [
    ...((goals.data ?? []) as { id: string; title: string; emoji: string | null; start_date: string; target_date: string }[]).map((g) => ({ id: g.id, title: `${g.emoji ? g.emoji + ' ' : ''}${g.title}`, from: g.start_date, to: g.target_date, kind: 'goal' as const, href: `/goals/${g.id}` })),
    ...((projects.data ?? []) as { id: string; title: string; emoji: string | null; start_date: string; target_date: string }[]).map((p) => ({ id: p.id, title: `${p.emoji ? p.emoji + ' ' : ''}${p.title}`, from: p.start_date, to: p.target_date, kind: 'project' as const, href: `/projects/${p.id}` })),
  ];
  return { weekStart, blocks, allDay, bars };
}
