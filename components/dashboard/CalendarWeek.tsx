'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getCalendarWeekAction } from '@/app/actions/calweek';
import { syncGoogleNowAction } from '@/app/actions/google';
import { setHabitDayAction, setHabitDayTimeAction } from '@/app/actions/habits';
import { completeTaskAction, reopenTaskAction, updateTaskAction } from '@/app/actions/tasks';
import { undoEventEditAction, updateEventAction } from '@/app/actions/calevents';
import { EventDialog, type DialogTarget } from './EventDialog';
import type { WeekBlock, WeekData } from '@/lib/domain/calweek';
import { assignColumns, fmtTime } from '@/lib/domain/day-layout';
import { addDays, daysBetween, istDate, istInstant, istParts } from '@/lib/time';
import { draggedRange } from '@/lib/domain/calendar-drag';
import { weekStart as mondayOf } from '@/lib/domain/lifecal-math';

const ROW = 44; // px per hour
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const minutesOf = (iso: string) => { const p = istParts(new Date(iso)); return p.hour * 60 + p.minute; };

const KIND = {
  event: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100 border-emerald-300/60',
  task: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-100 border-indigo-300/60',
  habit: 'bg-amber-100 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100 border-amber-300/60',
} as const;

/** What a tap on a habit or task opens a menu for. */
type MenuTarget = { kind: 'habit' | 'task'; id: string; title: string; date: string; done: boolean; missed: boolean; href: string; x: number; y: number };

/** Small action menu at the tap point: tick, mark missed, undo, open. Closes on any outside tap or Escape. */
function ActionMenu({ m, onClose, onAct }: { m: MenuTarget; onClose: () => void; onAct: (a: 'done' | 'missed' | 'clear' | 'toggle-task') => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const W = 200, left = Math.max(8, Math.min(m.x - W / 2, (typeof window === 'undefined' ? 400 : window.innerWidth) - W - 8));
  const top = Math.max(8, Math.min(m.y + 8, (typeof window === 'undefined' ? 600 : window.innerHeight) - 190));
  const item = 'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted';
  return (
    <>
      <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div role="menu" className="fixed z-50 rounded-xl border bg-card p-1 shadow-xl" style={{ left, top, width: W }}>
        <div className="truncate px-3 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">{m.title}</div>
        {m.kind === 'habit' ? (
          <>
            {m.done ? <button role="menuitem" className={item} onClick={() => onAct('clear')}>↺ Undo done</button> : <button role="menuitem" className={item} onClick={() => onAct('done')}>✓ Mark done</button>}
            {m.missed ? <button role="menuitem" className={item} onClick={() => onAct('clear')}>↺ Undo missed</button> : !m.done && <button role="menuitem" className={item} onClick={() => onAct('missed')}>✕ Mark missed</button>}
          </>
        ) : (
          <button role="menuitem" className={item} onClick={() => onAct('toggle-task')}>{m.done ? '↺ Reopen' : '✓ Mark done'}</button>
        )}
        <Link role="menuitem" href={m.href} className={item} onClick={onClose}>↗ Open {m.kind}</Link>
      </div>
    </>
  );
}

/** Your own calendar: week or day, with Google events, timed tasks, habit time blocks, and goals/projects as bars. */
export function CalendarWeek() {
  const today = istDate();
  const [mode, setMode] = useState<'week' | 'day'>('week');
  const [focus, setFocus] = useState(today);
  const ws = mondayOf(focus);
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogTarget>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);

  useEffect(() => { try { const m = localStorage.getItem('lifeos:cal:mode'); if (m === 'day' || m === 'week') setMode(m); else if (window.innerWidth < 768) setMode('day'); } catch {} }, []);
  const chooseMode = (m: 'week' | 'day') => { setMode(m); try { localStorage.setItem('lifeos:cal:mode', m); } catch {} };

  const load = useCallback(async (w: string) => {
    setLoading(true);
    const r = await getCalendarWeekAction(w);
    setLoading(false);
    if (!r.ok) { toast.error(r.error); return; }
    setData(r.data);
  }, []);
  useEffect(() => { void load(ws); }, [ws, load]);
  // anything created or changed in the app (tasks, chat) shows up right away; also refresh on returning to the tab
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') void load(ws); };
    window.addEventListener('lifeos:changed', again);
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => { window.removeEventListener('lifeos:changed', again); window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); };
  }, [ws, load]);

  async function syncNow() {
    setLoading(true);
    const r = await syncGoogleNowAction();
    if (!r.ok) toast.error(r.error);
    else if (r.data.calendar.errors.length) toast.error(r.data.calendar.errors.join(' · '));
    else toast.success(`Synced: ${r.data.calendar.cached} calendar events stored${r.data.calendar.changed ? `, ${r.data.calendar.changed} changed` : ''}.`);
    await load(ws);
  }

  /** A block was dragged (moved) or its bottom edge pulled (resized): save the new time to wherever it lives. */
  async function moveBlock(b: WeekBlock, date: string, startMin: number, endMin: number) {
    const hhmm = fmtTime(startMin), hhmmEnd = fmtTime(endMin);
    if (b.kind === 'habit' && b.habit) date = b.habit.date; // a habit block stays on its own day
    const start = istInstant(date, hhmm).toISOString(), end = istInstant(date, hhmmEnd).toISOString();
    setData((d) => d && { ...d, blocks: d.blocks.map((x) => (x.id === b.id ? { ...x, start, end } : x)) });
    if (b.kind === 'event' && b.event) {
      if (!b.event.canEdit) { toast.error('This event is read-only.'); await load(ws); return; }
      const r = await updateEventAction(b.event.id, { summary: b.event.summary, description: b.event.description, location: b.event.location, allDay: false, start, end });
      if (!r.ok) toast.error(r.error);
      else toast.success('Event moved on Google Calendar.', r.data.logId ? { duration: 10000, action: { label: 'Undo', onClick: async () => { const u = await undoEventEditAction(r.data.logId!); if (u.ok) toast.success(u.data); else toast.error(u.error); await load(ws); } } } : undefined);
    } else if (b.kind === 'task') {
      const r = await updateTaskAction(b.id, { due_date: date, due_at: start, duration_min: endMin - startMin });
      if (!r.ok) toast.error(r.error);
    } else if (b.kind === 'habit' && b.habit) {
      // only this day moves: other days keep the habit's own time, and past days keep what they had
      const r = await setHabitDayTimeAction(b.habit.id, b.habit.date, hhmm, hhmmEnd);
      if (!r.ok) toast.error(r.error);
      else toast.success(`${b.title} moved to ${hhmm}–${hhmmEnd} for ${b.habit.date} only.`);
    }
    await load(ws);
  }

  async function menuAct(m: MenuTarget, a: 'done' | 'missed' | 'clear' | 'toggle-task') {
    setMenu(null);
    const r = m.kind === 'habit'
      ? await setHabitDayAction(m.id, m.date, a === 'toggle-task' ? 'clear' : a)
      : m.done ? await reopenTaskAction(m.id) : await completeTaskAction(m.id);
    if (!r.ok) toast.error(r.error);
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
          <button onClick={syncNow} className="rounded-md border px-2 py-1 text-xs" title="Fetch what changed in Google Calendar since the last sync">Sync Google</button>
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

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
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
                  <div key={`h-${u.id}`} className={`flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-left text-[12px] ${KIND.habit} ${u.done ? 'line-through opacity-60' : ''}`}>
                    <button type="button" onClick={() => void toggleHabit(u.id, d, u.done)} title={u.done ? 'Done · tap to undo' : 'Tap to tick off'} aria-label={u.done ? `Undo ${u.title}` : `Tick off ${u.title}`} className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold leading-none ${u.done ? 'border-emerald-600 bg-emerald-600 text-white' : u.missed ? 'border-red-500 bg-red-500 text-white' : 'border-current opacity-70'}`}>{u.done ? '✓' : u.missed ? '✕' : ''}</button>
                    <button type="button" onClick={(e) => setMenu({ kind: 'habit', id: u.id, title: u.title, date: d, done: u.done, missed: !!u.missed, href: `/habits#habit-${u.id}`, x: e.clientX, y: e.clientY })} className="min-w-0 flex-1 truncate text-left">{u.emoji ? `${u.emoji} ` : ''}{u.title}</button>
                  </div>
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
              <div key={d} data-daycol={d} className="relative cursor-cell border-l border-border" style={{ height: gridH }}
                onClick={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); setDialog({ mode: 'create', date: d, hour: Math.min(23, startH + Math.floor((ev.clientY - r.top) / ROW)) }); }}>
                {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: (h - startH) * ROW }} />)}
                {dayBlocks.map((b) => <Block key={b.id} b={b} p={placed.get(b.id)} top={topOf(minutesOf(b.start))} height={Math.max(20, ((Math.max(minutesOf(b.end), minutesOf(b.start) + 20) - minutesOf(b.start)) / 60) * ROW - 2)} detailed={mode === 'day'} row={ROW} days={days} day={d} onMove={(bl, date, sMin, eMin) => void moveBlock(bl, date, sMin, eMin)} onEvent={(e) => setDialog({ mode: 'edit', event: e })} onHabit={(h, date, done) => void toggleHabit(h, date, done)} onMenu={(m) => setMenu(m)} />)}
                {d === today && (() => { const m = minutesOf(new Date().toISOString()); return m >= startH * 60 && m < (endH + 1) * 60 ? <div className="absolute inset-x-0 z-10 h-0.5 bg-red-500" style={{ top: topOf(m) }} /> : null; })()}
              </div>
            );
          })}
        </div>
      </div>
      {menu && <ActionMenu m={menu} onClose={() => setMenu(null)} onAct={(a) => void menuAct(menu, a)} />}
      <EventDialog target={dialog} onClose={() => setDialog(null)} onChanged={() => void load(ws)} />
      <p className="text-[12px] text-muted-foreground">
        <span className="mr-3">■ <span className="text-emerald-600">Google events</span></span><span className="mr-3">■ <span className="text-indigo-600">Tasks (start → end)</span></span><span className="mr-3">■ <span className="text-amber-600">Habits (their time block)</span></span>
        Click an empty slot to add an event, an event to edit it; tap the circle to tick a habit off; tap a habit or task for a menu (done, missed, open); drag to move. Give habits a time in Habits → Edit.
      </p>
    </div>
  );
}

function Block({ b, p, top, height, detailed, row, days, day, onMove, onEvent, onHabit, onMenu }: { b: WeekBlock; p?: { col: number; cols: number }; top: number; height: number; detailed: boolean; row: number; days: string[]; day: string; onMove: (b: WeekBlock, date: string, startMin: number, endMin: number) => void; onEvent: (e: NonNullable<WeekBlock['event']>) => void; onHabit: (id: string, date: string, done: boolean) => void; onMenu: (m: MenuTarget) => void }) {
  const [drag, setDrag] = useState<{ dx: number; dy: number; mode: 'move' | 'resize' } | null>(null);
  const justDragged = useRef(false);
  const cols = p?.cols ?? 1, col = p?.col ?? 0;
  const startMin = minutesOf(b.start), endMin = Math.max(minutesOf(b.end), startMin + 5);
  const preview = drag ? draggedRange(startMin, endMin, (drag.dy / row) * 60, drag.mode) : null;
  const shownTop = preview ? top + ((preview.start - startMin) / 60) * row : top;
  const shownH = preview ? Math.max(14, height + ((preview.end - preview.start - (endMin - startMin)) / 60) * row) : height;
  const style = { top: shownTop, height: shownH, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${(1 / cols) * 100}% - 4px)`, ...(drag?.mode === 'move' ? { transform: `translateX(${drag.dx}px)` } : {}), ...(drag ? { zIndex: 30, opacity: 0.85 } : {}) };
  const range = `${fmtTime(preview?.start ?? startMin)}–${fmtTime(preview?.end ?? endMin)}`;
  const cls = `absolute select-none [-webkit-touch-callout:none] overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[12px] leading-tight ${KIND[b.kind]} ${b.done ? 'opacity-60 line-through' : ''} ${drag ? 'cursor-grabbing shadow-lg' : 'cursor-grab'}`;

  // Press and drag a block to move it, or pull its bottom edge to change how long it lasts.
  // With a mouse (or the edge grip on touch) a drag starts at once; with a finger the block is picked up by
  // holding it for a moment, so ordinary swipes still scroll the calendar.
  function down(e: React.PointerEvent<HTMLElement>, mode: 'move' | 'resize') {
    if (e.button !== 0) return;
    e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY;
    const colEl = (e.currentTarget as HTMLElement).closest('[data-daycol]') as HTMLElement | null;
    const colW = colEl?.getBoundingClientRect().width ?? 1;
    const commit = (x: number, y: number) => {
      const r = draggedRange(startMin, endMin, ((y - y0) / row) * 60, mode);
      const shift = mode === 'move' && days.length > 1 ? Math.round((x - x0) / colW) : 0;
      const date = days[Math.min(days.length - 1, Math.max(0, days.indexOf(day) + shift))] ?? day;
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 400);
      if (date === day && r.start === startMin && r.end === endMin) return;
      onMove(b, date, r.start, r.end);
    };

    if (e.pointerType === 'touch' && mode === 'move') {
      let armed = false, lx = x0, ly = y0;
      const timer = setTimeout(() => { armed = true; try { navigator.vibrate?.(15); } catch { /* not supported */ } setDrag({ dx: 0, dy: 0, mode }); }, 350);
      const stop = () => {
        clearTimeout(timer);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchCancel);
      };
      function onTouchMove(ev: TouchEvent) {
        const t = ev.touches[0];
        lx = t.clientX; ly = t.clientY;
        if (!armed) { if (Math.hypot(lx - x0, ly - y0) > 8) stop(); return; } // a swipe: let the page scroll
        ev.preventDefault(); // picked up: the finger now moves the block, not the page
        setDrag({ dx: days.length > 1 ? lx - x0 : 0, dy: ly - y0, mode });
      }
      function onTouchEnd() { stop(); setDrag(null); if (armed) commit(lx, ly); }
      function onTouchCancel() { stop(); setDrag(null); }
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('touchcancel', onTouchCancel);
      return;
    }

    let moved = false;
    const onMoveEv = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      setDrag({ dx: days.length > 1 ? dx : 0, dy, mode });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMoveEv);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (moved) commit(ev.clientX, ev.clientY);
    };
    window.addEventListener('pointermove', onMoveEv);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
  const grip = <span onPointerDown={(e) => down(e, 'resize')} onClick={(e) => e.stopPropagation()} className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none" aria-label="Drag to change duration" />;
  const noClickAfterDrag = (e: React.MouseEvent) => { if (justDragged.current) { e.preventDefault(); e.stopPropagation(); } };
  const label = (
    <>
      <span className="font-semibold">{b.event?.recurring ? '↻ ' : ''}{b.habit?.emoji ? `${b.habit.emoji} ` : ''}{b.title}</span>
      {(detailed || shownH >= 40) && <span className="block text-[11px] opacity-70">{range}{b.kind === 'task' ? ' · task' : b.kind === 'habit' ? ' · habit' : ''}</span>}
    </>
  );
  const title = `${b.title} · ${range} — drag to move (press and hold on a touch screen), pull the bottom edge to resize`;
  if (b.href) return <button type="button" onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => down(e, 'move')} onClickCapture={noClickAfterDrag} onClick={(e) => { e.stopPropagation(); onMenu({ kind: 'task', id: b.id, title: b.title, date: day, done: !!b.done, missed: false, href: b.href!, x: e.clientX, y: e.clientY }); }} className={cls} style={style} title={title}>{label}{grip}</button>;
  if (b.kind === 'habit' && b.habit) {
    const h = b.habit;
    return (
      <div className={`${cls} flex items-start gap-1`} style={style} title={title} onPointerDown={(e) => down(e, 'move')} onContextMenu={(e) => e.preventDefault()} onClickCapture={noClickAfterDrag}>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onHabit(h.id, h.date, !!b.done); }} title={b.done ? 'Done · tap to undo' : 'Tap to tick off'} aria-label={b.done ? `Undo ${b.title}` : `Tick off ${b.title}`} className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold leading-none ${b.done ? 'border-emerald-600 bg-emerald-600 text-white' : h.missed ? 'border-red-500 bg-red-500 text-white' : 'border-current opacity-70 hover:opacity-100'}`}>{b.done ? '✓' : h.missed ? '✕' : ''}</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onMenu({ kind: 'habit', id: h.id, title: b.title, date: h.date, done: !!b.done, missed: h.missed, href: `/habits#habit-${h.id}`, x: e.clientX, y: e.clientY }); }} className="min-w-0 flex-1 text-left">{label}</button>
        {grip}
      </div>
    );
  }
  return <button type="button" onPointerDown={(e) => down(e, 'move')} onContextMenu={(e) => e.preventDefault()} onClickCapture={noClickAfterDrag} onClick={(e) => { e.stopPropagation(); if (b.event) onEvent(b.event); }} className={cls} style={style} title={title}>{label}{grip}</button>;
}
