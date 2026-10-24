'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { checkinHabitAction, setHabitDayAction } from '@/app/actions/habits';

export type WeekDay = { date: string; due: boolean; done: boolean; /** marked missed by hand */ missed: boolean };
export type HabitRowData = {
  id: string; name: string; emoji: string | null; kind: 'boolean' | 'count'; target: number; unit: string | null;
  value: number; done: boolean; streak: number; longest: number; schedule: string; week: WeekDay[]; today: string;
};

const SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

/**
 * One line per habit: a small check for today, the name, the last 7 days as tiny squares (tap any day to correct
 * it), and the streak. Target, longest streak and count entry open under the row from the ⋯ button.
 */
export function HabitRow({ h, onUnlink, onEdit, onArchive }: { h: HabitRowData; onUnlink?: () => void; onEdit?: () => void; onArchive?: () => void }) {
  const router = useRouter();
  const [week, setWeek] = useState(h.week);
  const [value, setValue] = useState(h.value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(h.value));
  const [, start] = useTransition();
  useEffect(() => { setWeek(h.week); setValue(h.value); setDraft(String(h.value)); }, [h.week, h.value]);

  const todayDone = week.find((d) => d.date === h.today)?.done ?? false;
  const todayMissed = week.find((d) => d.date === h.today)?.missed ?? false;
  const doneCount = week.filter((d) => d.due && d.done).length;
  const dueCount = week.filter((d) => d.due).length;

  function setDay(date: string, state: 'done' | 'missed' | 'clear') {
    setWeek((w) => w.map((d) => (d.date === date ? { ...d, done: state === 'done', missed: state === 'missed' } : d)));
    start(async () => {
      const r = await setHabitDayAction(h.id, date, state);
      if (!r.ok) { toast.error(r.error); setWeek(h.week); }
      router.refresh();
    });
  }
  const toggleDay = (date: string) => setDay(date, week.find((d) => d.date === date)?.done ? 'clear' : 'done');

  function setCount(n: number) {
    const v = Math.max(0, n);
    setValue(v); setDraft(String(v));
    setWeek((w) => w.map((d) => (d.date === h.today ? { ...d, done: v >= h.target, missed: false } : d)));
    start(async () => {
      const r = await checkinHabitAction(h.id, { value: v });
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (h.kind === 'count' ? setCount(todayDone ? 0 : h.target) : toggleDay(h.today))}
          aria-label={todayDone ? `Uncheck ${h.name} for today` : `Check ${h.name} for today`}
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold transition-colors ${todayDone ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-input text-transparent hover:border-emerald-500 hover:text-emerald-500'}`}
        >✓</button>
        <button
          type="button"
          onClick={() => setDay(h.today, todayMissed ? 'clear' : 'missed')}
          aria-label={todayMissed ? `Undo missed for ${h.name}` : `Mark ${h.name} as missed today`}
          title={todayMissed ? 'Marked missed: click to undo' : 'Mark as missed today (breaks the streak)'}
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold transition-colors ${todayMissed ? 'border-red-500 bg-red-500 text-white' : 'border-input text-transparent hover:border-red-500 hover:text-red-500'}`}
        >✕</button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 truncate text-left text-sm font-medium" title="Details">
          {h.emoji ? `${h.emoji} ` : ''}{h.name}
          {h.kind === 'count' && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{value}/{h.target}{h.unit ? ` ${h.unit}` : ''}</span>}
        </button>
        <div className="flex shrink-0 gap-0.5" role="group" aria-label="Last 7 days">
          {week.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => toggleDay(d.date)}
              title={`${d.date}${d.due ? (d.done ? ' · done' : d.missed ? ' · marked missed' : d.date === h.today ? ' · today' : ' · missed') : ' · not due'} (tap to change)`}
              className={`size-[18px] rounded-[5px] text-[9px] font-bold leading-none transition-colors ${
                !d.due ? 'border border-dashed border-border text-muted-foreground/50'
                : d.done ? 'bg-emerald-500 text-white'
                : d.missed ? 'bg-red-500 text-white'
                : d.date === h.today ? 'border border-input text-muted-foreground'
                : 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300'
              }`}
            >{SHORT[dow(d.date)]}</button>
          ))}
        </div>
        <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400" title={`Current streak (longest ${h.longest})`}>🔥{h.streak}</span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Details" aria-expanded={open} className="shrink-0 rounded px-1 text-muted-foreground hover:bg-muted">⋯</button>
      </div>
      {open && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-1.5 text-xs text-muted-foreground">
          <span>{h.schedule}</span>
          <span>Target {h.target}{h.unit ? ` ${h.unit}` : h.kind === 'boolean' ? '' : ''}</span>
          <span>This week {doneCount}/{dueCount}</span>
          <span>Longest streak {h.longest}</span>
          {h.kind === 'count' && (
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => setCount(value - 1)} className="size-6 rounded border border-input text-foreground">−</button>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => setCount(Number(draft) || 0)} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} className="h-6 w-12 rounded border border-input bg-transparent text-center text-foreground outline-none" inputMode="decimal" />
              <button type="button" onClick={() => setCount(value + 1)} className="size-6 rounded border border-input text-foreground">+</button>
            </span>
          )}
          {onEdit ? <button type="button" onClick={onEdit} className="underline">Edit</button> : <Link href="/habits" className="underline">Edit in Habits</Link>}
          {onArchive && <button type="button" onClick={onArchive} className="text-red-600 hover:underline dark:text-red-400">Archive</button>}
          {onUnlink && <button type="button" onClick={onUnlink} className="text-red-600 hover:underline dark:text-red-400">Unlink</button>}
        </div>
      )}
    </div>
  );
}
