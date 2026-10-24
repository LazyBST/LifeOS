'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getCalendarWeekAction } from '@/app/actions/calweek';
import type { WeekData } from '@/lib/domain/calweek';
import { addDays, daysBetween, istDate, istParts } from '@/lib/time';
import { weekStart as mondayOf } from '@/lib/domain/lifecal-math';

const START_H = 6, END_H = 23, ROW = 40; // px per hour
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const minutesOf = (iso: string) => { const p = istParts(new Date(iso)); return p.hour * 60 + p.minute; };

/** Your own week view: calendar events, timed tasks and goal/project spans, no embed or public calendar needed. */
export function CalendarWeek() {
  const today = istDate();
  const [ws, setWs] = useState(mondayOf(today));
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (w: string) => {
    setLoading(true);
    const r = await getCalendarWeekAction(w);
    setLoading(false);
    if (!r.ok) { toast.error(r.error); return; }
    setData(r.data);
  }, []);
  useEffect(() => { void load(ws); }, [ws, load]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws]);
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <button onClick={() => setWs(addDays(ws, -7))} className="rounded-md border px-2 py-1" aria-label="Previous week">‹</button>
        <button onClick={() => setWs(mondayOf(today))} className="rounded-md border px-2 py-1 text-xs">This week</button>
        <button onClick={() => setWs(addDays(ws, 7))} className="rounded-md border px-2 py-1" aria-label="Next week">›</button>
        <span className="ml-1 font-medium">{days[0].slice(5)} → {days[6].slice(5)}</span>
        {loading && <span className="text-xs text-muted-foreground">loading…</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
        <div className="grid min-w-[640px] grid-cols-[48px_repeat(7,1fr)] text-xs">
          <div className="sticky top-0 z-20 bg-card" />
          {days.map((d, i) => (
            <div key={d} className={`sticky top-0 z-20 border-l border-border bg-card px-2 py-1.5 text-center ${d === today ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
              {DOW[i]} {Number(d.slice(8))}
            </div>
          ))}

          {/* goals and projects as long bars */}
          <div className="bg-muted/40 px-1 py-1 text-[11px] text-muted-foreground">Goals</div>
          <div className="relative col-span-7 min-h-8 border-l border-border bg-muted/40">
            {data?.bars.map((b, n) => {
              const f = Math.max(0, daysBetween(ws, b.from)), t = Math.min(6, daysBetween(ws, b.to));
              return (
                <Link key={b.id} href={b.href} title={b.title}
                  className={`absolute truncate rounded px-1.5 py-0.5 text-[12px] font-semibold ${b.kind === 'goal' ? 'bg-indigo-500 text-white' : 'bg-indigo-200 text-indigo-900 dark:bg-indigo-500/30 dark:text-indigo-100'}`}
                  style={{ left: `calc(${(f / 7) * 100}% + 2px)`, width: `calc(${((t - f + 1) / 7) * 100}% - 4px)`, top: 2 + n * 22 }}>
                  {b.title}
                </Link>
              );
            })}
            <div style={{ height: Math.max(1, data?.bars.length ?? 0) * 22 + 4 }} />
          </div>

          {/* time grid */}
          <div className="relative" style={{ height: hours.length * ROW }}>
            {hours.map((h) => <div key={h} className="absolute right-1 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: (h - START_H) * ROW }}>{h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}</div>)}
          </div>
          {days.map((d) => (
            <div key={d} className="relative border-l border-border" style={{ height: hours.length * ROW }}>
              {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: (h - START_H) * ROW }} />)}
              {data?.allDay.filter((a) => a.date === d).map((a) => (
                <div key={a.id} className="absolute inset-x-1 top-0 truncate rounded bg-muted px-1 text-[12px]">{a.title}</div>
              ))}
              {data?.blocks.filter((b) => istParts(new Date(b.start)).date === d).map((b) => {
                const s = Math.max(START_H * 60, minutesOf(b.start));
                const e = Math.min(END_H * 60, Math.max(s + 20, minutesOf(b.end) || s + 30));
                const style = { top: ((s - START_H * 60) / 60) * ROW, height: ((e - s) / 60) * ROW - 2 };
                const cls = `absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-0.5 text-[12px] leading-tight ${b.kind === 'task' ? (b.done ? 'bg-muted text-muted-foreground line-through' : 'bg-indigo-100 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-100') : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100'}`;
                return b.href ? <Link key={b.id} href={b.href} className={cls} style={style} title={b.title}>{b.title}</Link> : <div key={b.id} className={cls} style={style} title={b.title}>{b.title}</div>;
              })}
              {d === today && (() => { const m = minutesOf(new Date().toISOString()); return m >= START_H * 60 && m < END_H * 60 ? <div className="absolute inset-x-0 z-10 h-0.5 bg-red-500" style={{ top: ((m - START_H * 60) / 60) * ROW }} /> : null; })()}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">Green: calendar events · Blue: your timed tasks · Bars: goals and projects. Reads your synced calendar, so it works with a private calendar.</p>
    </div>
  );
}
