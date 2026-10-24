'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getCalendarWeekAction } from '@/app/actions/calweek';
import { syncGoogleNowAction } from '@/app/actions/google';
import { setHabitDayAction } from '@/app/actions/habits';
import { EventDialog, type DialogTarget } from './EventDialog';
import type { WeekBlock, WeekData } from '@/lib/domain/calweek';
import { assignColumns, fmtTime } from '@/lib/domain/day-layout';
import { addDays, daysBetween, istDate, istParts } from '@/lib/time';
import { weekStart as mondayOf } from '@/lib/domain/lifecal-math';

const ROW = 44; // px per hour
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const minutesOf = (iso: string) => { const p = istParts(new Date(iso)); return p.hour * 60 + p.minute; };

const KIND = {
  event: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100 border-emerald-300/60',
  task: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-100 border-indigo-300/60',
  habit: 'bg-amber-100 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100 border-amber-300/60',
} as const;

/** Your own calendar: week or day, with Google events, timed tasks, habit time blocks, and goals/projects as bars. */
export function CalendarWeek() {
  const today = istDate();
  const [mode, setMode] = useState<'week' | 'day'>('week');
  const [focus, setFocus] = useState(today);
  const ws = mondayOf(focus);
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogTarget>(null);

  useEffect(() => { try { const m = localStorage.getItem('lifeos:cal:mode'); if (m === 'day' || m === 'week') setMode(m); } catch {} }, []);
  const chooseMode = (m: 'week' | 'day') => { setMode(m); try { localStorage.setItem('lifeos:cal:mode', m); } catch {} };

  const load = useCallback(async (w: string) => {
    setLoading(true);
    const r = await getCalendarWeekAction(w);
    setLoading(false);
    if (!r.ok) { toast.error(r.error); return; }
    setData(r.data);
  }, []);
  useEffect(() => { void load(ws); }, [ws, load]);

  async function syncNow() {
    setLoading(true);
    const r = await syncGoogleNowAction();
    if (!r.ok) toast.error(r.error);
    else if (r.data.calendar.errors.length) toast.error(r.data.calendar.errors.join(' · '));
    else toast.success(`Synced: ${r.data.calendar.cached} calendar events stored${r.data.calendar.changed ? `, ${r.data.calendar.changed} changed` : ''}.`);
    await load(ws);
  }

  async function toggleHabit(habitId: string, date: string, done: boolean) {
    const r = await setHabitDayAction(habitId, date, done ? 'clear' : 'done');
    if (!r.ok) toast.error(r.error);
    await load(ws);
  }

  const step = mode === 'day' ? 1 : 7;
  const days = useMemo(() => (mode === 'day' ? [focus] : Array.from({ length: 7 }, (_, i) => addDays(ws, i))), [mode, focus, ws]);
  const title = mode === 'day' ? `${DOW[(new Date(`${focus}T00:00:00Z`).getUTCDay() + 6) % 7]} ${focus}` : `${days[0].slice(5)} → ${addDays(days[0], 6).slice(5)}`;

  // visible hour range follows the content, never narrower than 6:00–22:00
  const visible = days.flatMap((d) => (data?.blocks ?? []).filter((b) => istParts(new Date(b.start)).date === d));
  const startH = Math.min(6, ...visible.map((b) => Math.floor(minutesOf(b.start) / 60)));
  const endH = Math.max(22, ...visible.map((b) => Math.ceil(minutesOf(b.end) / 60) || 0)) + 0;
  const hours = Array.from({ length: Math.max(1, Math.min(24, endH + 1) - startH) }, (_, i) => startH + i);
  const gridH = hours.length * ROW;
  const topOf = (min: number) => ((Math.max(startH * 60, min) - startH * 60) / 60) * ROW;

  const bars = (data?.bars ?? []).filter((b) => b.to >= days[0] && b.from <= days[days.length - 1]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex rounded-lg bg-muted p-0.5 text-xs">
          {(['day', 'week'] as const).map((m) => (
            <button key={m} onClick={() => chooseMode(m)} className={`rounded-md px-2.5 py-1 font-medium capitalize ${mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{m}</button>
          ))}
        </div>
        <button onClick={() => setFocus(addDays(focus, -step))} className="rounded-md border px-2 py-1" aria-label={`Previous ${mode}`}>‹</button>
        <button onClick={() => setFocus(today)} className="rounded-md border px-2 py-1 text-xs">Today</button>
        <button onClick={() => setFocus(addDays(focus, step))} className="rounded-md border px-2 py-1" aria-label={`Next ${mode}`}>›</button>
        <span className="ml-1 font-medium">{title}</span>
        {loading && <span className="text-xs text-muted-foreground">loading…</span>}
        <span className="ml-auto flex gap-2">
          <button onClick={syncNow} className="rounded-md border px-2 py-1 text-xs" title="Re-read your whole Google Calendar now">Sync Google</button>
          <button onClick={() => setDialog({ mode: 'create', date: focus, hour: Math.min(22, Math.max(startH, istParts().hour + 1)) })} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">+ Event</button>
        </span>
      </div>

      {data?.sync?.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          Google Calendar is not syncing: {data.sync.error} <Link href="/settings" className="underline">Open Settings</Link>
        </div>
      )}
      {data && data.sync && !data.sync.error && data.sync.cached === 0 && data.blocks.every((b) => b.kind !== 'event') && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          No Google events stored yet. Press <b>Sync Google</b> to load them.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
        <div className="grid text-xs" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(${mode === 'week' ? 90 : 240}px, 1fr))`, minWidth: mode === 'week' ? 680 : 360 }}>
          <div className="sticky top-0 z-20 bg-card" />
          {days.map((d, i) => (
            <div key={d} className={`sticky top-0 z-20 border-l border-border bg-card px-2 py-1.5 text-center ${d === today ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
              {mode === 'week' ? `${DOW[i]} ${Number(d.slice(8))}` : 'Schedule'}
            </div>
          ))}

          {/* goals and projects as bars across the days they span */}
          <div className="bg-muted/40 px-1 py-1 text-[11px] text-muted-foreground">Goals &amp; projects</div>
          <div className="relative border-l border-border bg-muted/40" style={{ gridColumn: `span ${days.length}`, minHeight: Math.max(1, bars.length) * 24 + 6 }}>
            {bars.map((b, n) => {
              const f = Math.max(0, daysBetween(days[0], b.from)), t = Math.min(days.length - 1, daysBetween(days[0], b.to));
              return (
                <Link key={b.id} href={b.href} title={`${b.title} · ${b.from} → ${b.to}`}
                  className={`absolute truncate rounded px-1.5 py-0.5 text-[12px] font-semibold ${b.kind === 'goal' ? 'bg-indigo-500 text-white' : 'bg-indigo-200 text-indigo-900 dark:bg-indigo-500/30 dark:text-indigo-100'}`}
                  style={{ left: `calc(${(f / days.length) * 100}% + 2px)`, width: `calc(${((t - f + 1) / days.length) * 100}% - 4px)`, top: 3 + n * 24 }}>
                  {b.kind === 'goal' ? '🎯 ' : '📁 '}{b.title}
                </Link>
              );
            })}
          </div>

          {/* all-day events and things with no set time */}
          <div className="px-1 py-1 text-[11px] text-muted-foreground">All day / anytime</div>
          {days.map((d) => {
            const allDay = (data?.allDay ?? []).filter((a) => a.date === d);
            const any = (data?.untimed ?? []).filter((u) => u.date === d);
            return (
              <div key={d} className="flex flex-col gap-1 border-l border-border p-1">
                {allDay.map((a) => (
                  <button key={a.id} onClick={() => a.event && setDialog({ mode: 'edit', event: a.event })} className={`truncate rounded border px-1.5 py-0.5 text-left text-[12px] ${KIND.event}`}>{a.title}</button>
                ))}
                {any.map((u) => u.kind === 'habit' ? (
                  <button key={`h-${u.id}`} onClick={() => void toggleHabit(u.id, d, u.done)} title={u.done ? 'Done (click to undo)' : 'Click to check in'} className={`flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-left text-[12px] ${KIND.habit} ${u.done ? 'line-through opacity-60' : ''}`}>
                    <span>{u.done ? '✓' : u.missed ? '✕' : '○'}</span><span className="truncate">{u.emoji ? `${u.emoji} ` : ''}{u.title}</span>
                  </button>
                ) : (
                  <Link key={`t-${u.id}`} href={u.href ?? '#'} className={`flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[12px] ${KIND.task} ${u.done ? 'line-through opacity-60' : ''}`}>
                    <span>{u.done ? '✓' : '☐'}</span><span className="truncate">{u.title}</span>
                  </Link>
                ))}
              </div>
            );
          })}

          {/* time grid */}
          <div className="relative" style={{ height: gridH }}>
            {hours.map((h) => <div key={h} className="absolute right-1 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: (h - startH) * ROW }}>{h === 0 ? 12 : h > 12 ? h - 12 : h}{h >= 12 && h < 24 ? 'p' : 'a'}</div>)}
          </div>
          {days.map((d) => {
            const dayBlocks = (data?.blocks ?? []).filter((b) => istParts(new Date(b.start)).date === d);
            const placed = new Map(assignColumns(dayBlocks.map((b) => ({ id: b.id, start: minutesOf(b.start), end: Math.max(minutesOf(b.end), minutesOf(b.start) + 20) }))).map((p) => [p.id, p]));
            return (
              <div key={d} className="relative cursor-cell border-l border-border" style={{ height: gridH }}
                onClick={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); setDialog({ mode: 'create', date: d, hour: Math.min(23, startH + Math.floor((ev.clientY - r.top) / ROW)) }); }}>
                {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: (h - startH) * ROW }} />)}
                {dayBlocks.map((b) => <Block key={b.id} b={b} p={placed.get(b.id)} top={topOf(minutesOf(b.start))} height={Math.max(20, ((Math.max(minutesOf(b.end), minutesOf(b.start) + 20) - minutesOf(b.start)) / 60) * ROW - 2)} detailed={mode === 'day'} onEvent={(e) => setDialog({ mode: 'edit', event: e })} onHabit={(h, date, done) => void toggleHabit(h, date, done)} />)}
                {d === today && (() => { const m = minutesOf(new Date().toISOString()); return m >= startH * 60 && m < (endH + 1) * 60 ? <div className="absolute inset-x-0 z-10 h-0.5 bg-red-500" style={{ top: topOf(m) }} /> : null; })()}
              </div>
            );
          })}
        </div>
      </div>
      <EventDialog target={dialog} onClose={() => setDialog(null)} onChanged={() => void load(ws)} />
      <p className="text-[12px] text-muted-foreground">
        <span className="mr-3">■ <span className="text-emerald-600">Google events</span></span><span className="mr-3">■ <span className="text-indigo-600">Tasks (start → end)</span></span><span className="mr-3">■ <span className="text-amber-600">Habits (their time block)</span></span>
        Click an empty slot to add an event, an event to edit it, a habit to check it in. Give habits a time in Habits → Edit.
      </p>
    </div>
  );
}

function Block({ b, p, top, height, detailed, onEvent, onHabit }: { b: WeekBlock; p?: { col: number; cols: number }; top: number; height: number; detailed: boolean; onEvent: (e: NonNullable<WeekBlock['event']>) => void; onHabit: (id: string, date: string, done: boolean) => void }) {
  const cols = p?.cols ?? 1, col = p?.col ?? 0;
  const style = { top, height, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${(1 / cols) * 100}% - 4px)` };
  const range = `${fmtTime(minutesOf(b.start))}–${fmtTime(minutesOf(b.end))}`;
  const cls = `absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[12px] leading-tight ${KIND[b.kind]} ${b.done ? 'opacity-60 line-through' : ''}`;
  const label = (
    <>
      <span className="font-semibold">{b.kind === 'habit' ? (b.done ? '✓ ' : b.habit?.missed ? '✕ ' : '○ ') : b.event?.recurring ? '↻ ' : ''}{b.habit?.emoji ? `${b.habit.emoji} ` : ''}{b.title}</span>
      {(detailed || height >= 40) && <span className="block text-[11px] opacity-70">{range}{b.kind === 'task' ? ' · task' : b.kind === 'habit' ? ' · habit' : ''}</span>}
    </>
  );
  if (b.href) return <Link href={b.href} onClick={(e) => e.stopPropagation()} className={cls} style={style} title={`${b.title} · ${range}`}>{label}</Link>;
  if (b.kind === 'habit' && b.habit) return <button type="button" onClick={(e) => { e.stopPropagation(); onHabit(b.habit!.id, b.habit!.date, !!b.done); }} className={cls} style={style} title={`${b.title} · ${range} (click to ${b.done ? 'undo' : 'check in'})`}>{label}</button>;
  return <button type="button" onClick={(e) => { e.stopPropagation(); if (b.event) onEvent(b.event); }} className={cls} style={style} title={`${b.title} · ${range}`}>{label}</button>;
}
