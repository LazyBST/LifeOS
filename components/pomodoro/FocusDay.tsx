'use client';
import { useCallback, useEffect, useState } from 'react';
import { focusDayAction } from '@/app/actions/pomodoro';
import { addDays, formatDate, istDate } from '@/lib/time';
import type { FocusDay as Data } from '@/lib/domain/pomodoro';

type Payload = Data & { week: { date: string; workMin: number; sessions: number }[] };

const mins = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : `${Math.round(sec / 60)}m`);
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** One day of Pomodoro: sessions and pauses, work done against what the calendar planned, and the work/break split of the time set aside. */
export function FocusDay({ refreshKey = 0, light = false }: { refreshKey?: number; /** light text for use on the coloured full-screen timer */ light?: boolean }) {
  const today = istDate();
  const [date, setDate] = useState(today);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    const r = await focusDayAction(d);
    if (r.ok) { setData(r.data); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { void load(date); }, [date, load, refreshKey]);

  const muted = light ? 'text-white/70' : 'text-muted-foreground';
  const tile = light ? 'bg-white/10' : 'bg-muted/50';
  if (error) return <p className={`text-sm ${muted}`}>{error}</p>;
  if (!data) return <p className={`text-sm ${muted}`}>Loading…</p>;
  const s = data.summary;
  const used = s.workSec + s.breakSec;
  const allotted = Math.max(s.allottedSec, used, 1);
  const unused = Math.max(0, s.allottedSec - used);
  const maxWeek = Math.max(1, ...data.week.map((w) => w.workMin));

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setDate(addDays(date, -1))} className={`rounded-md border px-2 py-0.5 ${light ? 'border-white/30' : ''}`} aria-label="Previous day">‹</button>
        <span className="min-w-28 text-center font-semibold">{date === today ? 'Today' : formatDate(date)}</span>
        <button type="button" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} className={`rounded-md border px-2 py-0.5 disabled:opacity-30 ${light ? 'border-white/30' : ''}`} aria-label="Next day">›</button>
      </div>
      {!data.ready && <p className={muted}>Run migration 0019_pomodoro.sql in Supabase to keep a history.</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={`rounded-xl p-3 ${tile}`}><div className={`text-[11px] uppercase tracking-wide ${muted}`}>Sessions</div><div className="text-xl font-bold">{s.workSessions}<span className={`text-sm font-normal ${muted}`}> / {s.workStarted} started</span></div></div>
        <div className={`rounded-xl p-3 ${tile}`}><div className={`text-[11px] uppercase tracking-wide ${muted}`}>Pauses</div><div className="text-xl font-bold">{s.pauses}<span className={`text-sm font-normal ${muted}`}> · {mins(s.pausedSec)} paused</span></div></div>
        <div className={`rounded-xl p-3 ${tile}`}><div className={`text-[11px] uppercase tracking-wide ${muted}`}>Focused</div><div className="text-xl font-bold">{mins(s.workSec)}</div></div>
        <div className={`rounded-xl p-3 ${tile}`}><div className={`text-[11px] uppercase tracking-wide ${muted}`}>Breaks</div><div className="text-xl font-bold">{mins(s.breakSec)}</div></div>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between"><span className="font-medium">Against your calendar</span><span className={muted}>{data.plannedWorkMin ? `${mins(s.workSec)} of ${mins(data.plannedWorkMin * 60)} planned` : 'no tasks planned for this day'}</span></div>
        {data.plannedWorkMin > 0 && (
          <div className={`relative h-3 overflow-hidden rounded-full ${light ? 'bg-white/20' : 'bg-muted'}`}>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (s.coverage ?? 0) * 100)}%` }} />
          </div>
        )}
        {s.coverage !== null && <div className={`mt-1 text-xs ${muted}`}>{Math.round(s.coverage * 100)}% of the planned work covered by focused time</div>}
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between"><span className="font-medium">Time set aside</span><span className={muted}>{mins(s.allottedSec)} planned in timers</span></div>
        <div className={`flex h-3 overflow-hidden rounded-full ${light ? 'bg-white/20' : 'bg-muted'}`} role="img" aria-label="Work, break and unused time">
          <div className="bg-rose-500" style={{ width: `${(s.workSec / allotted) * 100}%` }} title={`Work ${mins(s.workSec)}`} />
          <div className="bg-emerald-500" style={{ width: `${(s.breakSec / allotted) * 100}%` }} title={`Break ${mins(s.breakSec)}`} />
        </div>
        <div className={`mt-1 flex flex-wrap gap-x-4 text-xs ${muted}`}>
          <span><span className="mr-1 inline-block size-2 rounded-full bg-rose-500" />Work {mins(s.workSec)}{s.focusShare !== null ? ` (${Math.round(s.focusShare * 100)}% of active time)` : ''}</span>
          <span><span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" />Break {mins(s.breakSec)}</span>
          {unused > 0 && <span>Not used {mins(unused)}</span>}
        </div>
      </div>

      <div>
        <div className="mb-1 font-medium">Last 7 days</div>
        <div className="flex h-14 items-end gap-1.5">
          {data.week.map((w) => (
            <button key={w.date} type="button" onClick={() => setDate(w.date)} title={`${formatDate(w.date)}: ${w.workMin} min, ${w.sessions} sessions`} className="flex flex-1 flex-col items-center justify-end gap-0.5">
              <span className={`w-full rounded-t ${w.date === date ? 'bg-rose-500' : light ? 'bg-white/40' : 'bg-rose-300 dark:bg-rose-500/50'}`} style={{ height: `${Math.max(3, (w.workMin / maxWeek) * 40)}px` }} />
              <span className={`text-[10px] ${muted}`}>{new Date(`${w.date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'narrow', timeZone: 'UTC' })}</span>
            </button>
          ))}
        </div>
      </div>

      {data.segments.length > 0 && (
        <ul className="space-y-1">
          {data.segments.map((g) => (
            <li key={g.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${tile}`}>
              <span className={`size-2 shrink-0 rounded-full ${g.kind === 'work' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
              <span className={`w-16 shrink-0 text-xs tabular-nums ${muted}`}>{hhmm(g.started_at)}</span>
              <span className="min-w-0 flex-1 truncate">{g.kind === 'break' ? 'Break' : g.label || 'Focus'}</span>
              <span className={`shrink-0 text-xs tabular-nums ${muted}`}>{mins(g.actual_sec)}/{mins(g.planned_sec)}{g.pauses ? ` · ${g.pauses}⏸` : ''}</span>
              <span className="w-4 text-center text-xs" title={g.completed ? 'Finished' : 'Ended early'}>{g.completed ? '✓' : '–'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
