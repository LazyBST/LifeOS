import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { addDays } from '@/lib/time';
import { istInstant } from '@/lib/time';
import { listAreas } from './areas';
import { areaColor } from './areas-colors';
import { listHabits, habitDueOn, habitDayTimes } from './habits';
import { minutesOfTime } from './day-layout';

export type EditableEvent = { id: string; summary: string; start: string; end: string; allDay: boolean; description: string | null; location: string | null; canEdit: boolean; recurring: boolean };
export type WeekBlock = { id: string; title: string; start: string; end: string; kind: 'event' | 'task' | 'habit'; /** the colour of the area it belongs to */ color?: string; /** the Area's name */ area?: string; done?: boolean; href?: string; event?: EditableEvent; habit?: { id: string; date: string; emoji: string | null; missed: boolean; skipped: boolean } };
export type UntimedItem = { kind: 'task' | 'habit'; color?: string; id: string; title: string; date: string; done: boolean; missed?: boolean; href?: string; emoji?: string | null; skipped?: boolean };
export type WeekBar = { id: string; title: string; from: string; to: string; kind: 'goal' | 'project'; href: string; color?: string };
export type WeekData = { weekStart: string; blocks: WeekBlock[]; allDay: { id: string; title: string; date: string; event?: EditableEvent }[]; bars: WeekBar[]; untimed: UntimedItem[]; sync: { error: string | null; okAt: string | null; cached: number } | null };

/** Everything the week view draws: calendar events, timed tasks, all-day items, goal/project spans. */
export async function weekData(weekStart: string): Promise<WeekData> {
  const weekEnd = addDays(weekStart, 6);
  const from = istInstant(weekStart, '00:00').toISOString();
  const to = istInstant(addDays(weekStart, 7), '00:00').toISOString();
  const loadEvents = async () => {
    const q = (cols: string) => admin().from('calendar_events').select(cols).lt('starts_at', to).gte('ends_at', from).limit(300);
    const full = await q('google_event_id,summary,starts_at,ends_at,all_day,description,location,recurring,can_edit');
    return full.error ? await q('google_event_id,summary,starts_at,ends_at,all_day') : full; // migration 0011 not run yet
  };
  const areaList = await listAreas().catch(() => []);
  const areaHex = new Map(areaList.map((a) => [a.id, areaColor(a)]));
  const areaName = new Map(areaList.map((a) => [a.id, a.name]));
  const [ev, tasks, goals, projects] = await Promise.all([
    loadEvents(),
    admin().from('tasks').select('id,title,due_at,duration_min,status,area_id').is('deleted_at', null).gte('due_at', from).lt('due_at', to).limit(300),
    admin().from('goals').select('id,title,emoji,start_date,target_date,area_id').is('deleted_at', null).eq('status', 'active').not('target_date', 'is', null).gte('target_date', weekStart).limit(200),
    admin().from('projects').select('id,title,emoji,start_date,target_date').is('deleted_at', null).eq('status', 'active').not('target_date', 'is', null).gte('target_date', weekStart).limit(200),
  ]);
  const blocks: WeekBlock[] = [];
  const allDay: WeekData['allDay'] = [];
  type Ev = { google_event_id: string; summary: string | null; starts_at: string; ends_at: string; all_day: boolean | null; description?: string | null; location?: string | null; recurring?: boolean; can_edit?: boolean };
  for (const e of (ev.data ?? []) as unknown as Ev[]) {
    const event: EditableEvent = {
      id: e.google_event_id, summary: e.summary ?? '', start: e.starts_at, end: e.ends_at, allDay: !!e.all_day,
      description: e.description ?? null, location: e.location ?? null, canEdit: e.can_edit ?? false, recurring: e.recurring ?? false,
    };
    if (e.all_day) allDay.push({ id: e.google_event_id, title: e.summary ?? 'Event', date: new Date(new Date(e.starts_at).getTime() + 330 * 60_000).toISOString().slice(0, 10), event });
    else blocks.push({ id: e.google_event_id, title: e.summary ?? 'Event', start: e.starts_at, end: e.ends_at, kind: 'event', event });
  }
  for (const t of (tasks.data ?? []) as { id: string; title: string; due_at: string; duration_min: number | null; status: string; area_id: string | null }[]) {
    const end = new Date(new Date(t.due_at).getTime() + (t.duration_min ?? 30) * 60_000).toISOString();
    blocks.push({ id: t.id, title: t.title, start: t.due_at, end, kind: 'task', color: t.area_id ? areaHex.get(t.area_id) : undefined, area: t.area_id ? areaName.get(t.area_id) : undefined, done: t.status === 'done', href: `/tasks/${t.id}` });
  }
  // a goal or project without a start date still shows, as a one-day marker on its target date
  type Span = { id: string; title: string; emoji: string | null; start_date: string | null; target_date: string };
  const toBar = (kind: 'goal' | 'project', href: string) => (g: Span): WeekBar | null => {
    const from = g.start_date ?? g.target_date;
    return from <= weekEnd ? { id: g.id, title: `${g.emoji ? g.emoji + ' ' : ''}${g.title}`, from, to: g.target_date, kind, href: `${href}${g.id}` } : null;
  };
  const bars = [
    ...((goals.data ?? []) as Span[]).map(toBar('goal', '/goals/')),
    ...((projects.data ?? []) as Span[]).map(toBar('project', '/projects/')),
  ].filter((b): b is WeekBar => b !== null);

  // untimed tasks due that day, and every habit due that day (timed ones become blocks)
  const untimed: UntimedItem[] = [];
  const dueTasks = await admin().from('tasks').select('id,title,due_date,status,area_id').is('deleted_at', null).is('due_at', null).gte('due_date', weekStart).lte('due_date', weekEnd).limit(300);
  for (const t of (dueTasks.data ?? []) as { id: string; title: string; due_date: string; status: string; area_id: string | null }[]) {
    untimed.push({ kind: 'task', color: t.area_id ? areaHex.get(t.area_id) : undefined, id: t.id, title: t.title, date: t.due_date, done: t.status === 'done', href: `/tasks/${t.id}` });
  }
  try {
    const [habits, checks, dayTimes] = await Promise.all([
      listHabits(),
      admin().from('habit_checkins').select('habit_id,checkin_date,value').gte('checkin_date', weekStart).lte('checkin_date', weekEnd),
      habitDayTimes(weekStart, weekEnd),
    ]);
    const override = new Map(dayTimes.map((o) => [`${o.habit_id}|${o.day}`, o]));
    const value = new Map(((checks.data ?? []) as { habit_id: string; checkin_date: string; value: number }[]).map((c) => [`${c.habit_id}|${c.checkin_date}`, Number(c.value)]));
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      for (const h of habits) {
        const o = override.get(`${h.id}|${date}`); // moved on the calendar for this day only
        if (h.created_at.slice(0, 10) > date || !(habitDueOn(h, date) || o?.extra)) continue; // an extra day is a habit moved here from another day
        const v = value.get(`${h.id}|${date}`);
        const done = (v ?? 0) >= Number(h.target_value);
        const missed = v === -1;
        const skipped = v === -2;
        const sMin = minutesOfTime(o ? o.start_time : h.start_time);
        if (sMin === null) { untimed.push({ kind: 'habit', color: h.area_id ? areaHex.get(h.area_id) : undefined, id: h.id, title: h.name, date, done, missed, skipped, emoji: h.emoji }); continue; }
        const eMin = minutesOfTime(o ? o.end_time : h.end_time) ?? sMin + 5;
        const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        blocks.push({ id: `habit-${h.id}-${date}`, title: h.name, start: istInstant(date, hhmm(sMin)).toISOString(), end: istInstant(date, hhmm(Math.min(eMin, 24 * 60 - 1))).toISOString(), kind: 'habit', color: h.area_id ? areaHex.get(h.area_id) : undefined, area: h.area_id ? areaName.get(h.area_id) : undefined, done, habit: { id: h.id, date, emoji: h.emoji, missed, skipped } });
      }
    }
  } catch { /* habits are optional on this view */ }

  const { data: st } = await admin().from('calendar_sync_state').select('last_error,last_ok_at,cached_events').maybeSingle();
  const sync = st ? { error: (st.last_error as string | null) ?? null, okAt: (st.last_ok_at as string | null) ?? null, cached: Number(st.cached_events ?? 0) } : null;
  return { weekStart, blocks, allDay, bars, untimed, sync };
}
