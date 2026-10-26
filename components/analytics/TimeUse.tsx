'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { timeUseDayAction, type DayBlock } from '@/app/actions/calweek';
import { dur, hhmm, timeUse, type Interval, type TreeNode } from '@/lib/domain/timeuse-math';
import { addDays, formatDate, istDate } from '@/lib/time';

const WINDOWS = { day: { label: 'Whole day', start: 0, end: 1440 }, awake: { label: 'Awake 6:00–23:00', start: 360, end: 1380 } } as const;

/**
 * Where the 24 hours went. Everything with a time (calendar events, tasks, habits) claims its minutes; the minutes
 * nobody claims are time not used. When things overlap you are assumed to have been on all of them.
 */
export function TimeUse() {
  const today = istDate();
  const [date, setDate] = useState(today);
  const [blocks, setBlocks] = useState<DayBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState<keyof typeof WINDOWS>('day');
  const [onlyDone, setOnlyDone] = useState(false);
  const [kinds, setKinds] = useState({ event: true, task: true, habit: true });

  useEffect(() => { try { const w = localStorage.getItem('lifeos:timeuse:win'); if (w === 'day' || w === 'awake') setWin(w); } catch {} }, []);
  const load = useCallback(async (d: string) => {
    const r = await timeUseDayAction(d);
    if (r.ok) { setBlocks(r.data.blocks); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { setBlocks(null); void load(date); }, [date, load]);

  const use = useMemo(() => {
    if (!blocks) return null;
    const list: Interval[] = blocks
      .filter((b) => kinds[b.kind] && (!onlyDone || b.done || b.kind === 'event') && b.end > b.start)
      .map((b) => ({ id: b.id, title: b.title, group: b.area ?? (b.kind === 'event' ? 'Calendar events' : 'No area'), color: b.color, start: b.start, end: b.end, path: b.path }));
    return timeUse(list, WINDOWS[win]);
  }, [blocks, kinds, onlyDone, win]);

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted'}`;
  const colorOf = new Map((blocks ?? []).map((b) => [b.id, b.color]));

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDate(addDays(date, -1))} className="rounded-md border px-2 py-0.5" aria-label="Previous day">‹</button>
        <span className="min-w-28 text-center font-semibold">{date === today ? 'Today' : formatDate(date)}</span>
        <button type="button" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} className="rounded-md border px-2 py-0.5 disabled:opacity-30" aria-label="Next day">›</button>
        {date !== today && <button type="button" onClick={() => setDate(today)} className="text-xs underline">Today</button>}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {(Object.keys(WINDOWS) as (keyof typeof WINDOWS)[]).map((k) => <button key={k} type="button" onClick={() => { setWin(k); try { localStorage.setItem('lifeos:timeuse:win', k); } catch {} }} className={chip(win === k)}>{WINDOWS[k].label}</button>)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Count</span>
        <button type="button" onClick={() => setOnlyDone(false)} className={chip(!onlyDone)}>Everything scheduled</button>
        <button type="button" onClick={() => setOnlyDone(true)} className={chip(onlyDone)}>Only what I finished</button>
        <span className="ml-2 text-xs text-muted-foreground">Include</span>
        {([['event', 'Events'], ['task', 'Tasks'], ['habit', 'Habits']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setKinds((c) => ({ ...c, [k]: !c[k] }))} className={chip(kinds[k])}>{l}</button>)}
      </div>

      {error && <p className="text-destructive">{error}</p>}
      {!use ? <p className="text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Tile label="Used" value={dur(use.usedMin)} sub={`${Math.round((use.usedMin / use.windowMin) * 100)}% of ${dur(use.windowMin)}`} tone="good" />
            <Tile label="Wasted" value={dur(use.wastedMin)} sub={`${Math.round((use.wastedMin / use.windowMin) * 100)}% — nothing scheduled`} tone="bad" />
            <Tile label="Only one thing" value={dur(use.aloneMin)} sub="dedicated time" />
            <Tile label="Two or more at once" value={dur(use.overlapMin)} sub="counted for all of them" />
            <Tile label="Longest gap" value={dur(use.longestGapMin)} sub={use.gaps.length ? `${hhmm(use.gaps.reduce((m, g) => (g.end - g.start > m.end - m.start ? g : m)).start)} onwards` : 'none'} />
          </div>

          {/* the day as a strip: coloured where something happens, striped where two things do, empty where nothing does */}
          <div>
            <div className="relative h-9 overflow-hidden rounded-lg border bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(239,68,68,0.14)_6px_9px)]" role="img" aria-label="Your day as a timeline">
              {use.pieces.filter((p) => p.ids.length).map((p, n) => {
                const cols = p.ids.map((id) => colorOf.get(id) ?? '#94a3b8');
                const bg = cols.length === 1 ? cols[0] : `repeating-linear-gradient(135deg, ${cols.map((c, i) => `${c} ${i * 6}px ${(i + 1) * 6}px`).join(', ')})`;
                return <div key={n} className="absolute inset-y-0" style={{ left: `${((p.start - use.window.start) / use.windowMin) * 100}%`, width: `${((p.end - p.start) / use.windowMin) * 100}%`, background: bg }} title={`${hhmm(p.start)}–${hhmm(p.end)} · ${p.ids.map((id) => use.items.find((i) => i.id === id)?.title).join(' + ')}`} />;
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              {Array.from({ length: 7 }, (_, i) => hhmm(use.window.start + Math.round((use.windowMin / 6) * i))).map((t, i) => <span key={i}>{t}</span>)}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-1 flex items-baseline justify-between font-medium"><span>Where it went</span><span className="text-[11px] font-normal text-muted-foreground">Area › goal › project › task</span></div>
              {use.tree.length === 0 ? <p className="text-muted-foreground">Nothing scheduled in this window.</p> : (
                <ul className="space-y-1">
                  {use.tree.map((n) => <TreeRow key={n.name} node={n} depth={0} total={use.windowMin} />)}
                </ul>
              )}
              <div className="mt-3 mb-1 font-medium">Biggest gaps</div>
              {use.gaps.length === 0 ? <p className="text-muted-foreground">No gaps: every minute has something in it.</p> : (
                <ul className="space-y-1">
                  {[...use.gaps].sort((a, b) => b.end - b.start - (a.end - a.start)).slice(0, 6).map((g) => (
                    <li key={g.start} className="flex justify-between rounded-lg bg-red-500/10 px-2 py-1"><span className="tabular-nums">{hhmm(g.start)}–{hhmm(g.end)}</span><span className="font-medium tabular-nums">{dur(g.end - g.start)}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="mb-1 font-medium">In order</div>
              {use.items.length === 0 ? <p className="text-muted-foreground">Nothing to show.</p> : (
                <ul className="space-y-1">
                  {use.items.map((i) => (
                    <li key={i.id} className="rounded-lg bg-muted/40 px-2 py-1">
                      <div className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ background: i.color }} /><span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{hhmm(i.start)}–{hhmm(i.end)}</span><span className="min-w-0 flex-1 truncate">{i.title}</span><span className="font-medium tabular-nums">{dur(i.minutes)}</span></div>
                      {i.shared > 0 && <div className="ml-4 text-[11px] text-muted-foreground">{dur(i.alone)} alone · {dur(i.shared)} together with {i.with.join(', ')}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold tracking-tight ${tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : ''}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}


/** One line of the roll-up: click to open what is inside. The bar is its share of the whole window. */
function TreeRow({ node, depth, total }: { node: TreeNode; depth: number; total: number }) {
  const [open, setOpen] = useState(depth === 0);
  const kids = node.children.length > 0;
  return (
    <li>
      <button type="button" disabled={!kids} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-md py-0.5 text-left enabled:hover:bg-muted/60" style={{ paddingLeft: depth * 14 }}>
        <span className="w-3 shrink-0 text-[10px] text-muted-foreground">{kids ? (open ? '▾' : '▸') : ''}</span>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: node.color }} />
        <span className={`min-w-0 flex-1 truncate ${depth === 0 ? 'font-semibold' : ''}`}>{node.name}</span>
        <span className="font-medium tabular-nums">{dur(node.minutes)}</span>
        <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{Math.round((node.minutes / total) * 100)}%</span>
      </button>
      <div className="h-1 overflow-hidden rounded-full bg-muted" style={{ marginLeft: depth * 14 + 20 }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (node.minutes / total) * 100)}%`, background: node.color }} /></div>
      {open && kids && <ul className="mt-1 space-y-1">{node.children.map((c) => <TreeRow key={c.name} node={c} depth={depth + 1} total={total} />)}</ul>}
    </li>
  );
}
