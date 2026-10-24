'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listAreasAction } from '@/app/actions/lookup';
import type { Area } from '@/lib/types/db';
import { getDayDetailAction, getLifeCalendarAction, setBirthDateAction, type LifeCalendarData } from '@/app/actions/lifecal';
import type { DetailItem } from '@/lib/domain/lifecal';
import Link from 'next/link';
import {
  cellStat, classify, monthName, rowsFor, spanOf, weeksLived,
  type Cell, type DotColor, type Gran, type View,
} from '@/lib/domain/lifecal-math';
import { addDays } from '@/lib/time';
import { areaColor } from '@/lib/domain/areas-colors';

const COLORS: Record<DotColor, string> = {
  green: 'bg-emerald-500 border-emerald-500',
  yellow: 'bg-amber-400 border-amber-400',
  red: 'bg-red-500 border-red-500',
  empty: 'bg-transparent border-border',
};
const VIEWS: { key: View; label: string }[] = [
  { key: 'life', label: 'Life' }, { key: 'year', label: 'Year' }, { key: 'month', label: 'Month' }, { key: 'week', label: 'Week' },
];

function shift(cursor: string, view: View, dir: 1 | -1): string {
  const [y, m] = cursor.split('-').map(Number);
  if (view === 'year') return `${y + dir}-${String(m).padStart(2, '0')}-01`;
  if (view === 'month') { const t = new Date(Date.UTC(y, m - 1 + dir, 1)); return t.toISOString().slice(0, 10); }
  return addDays(cursor, 7 * dir);
}

function title(cursor: string, view: View): string {
  const [y, m] = cursor.split('-').map(Number);
  if (view === 'life') return 'Your life, one dot per week';
  if (view === 'year') return String(y);
  if (view === 'month') return `${monthName(m)} ${y}`;
  return `Week of ${cursor}`;
}

export function LifeCalendar() {
  const [data, setData] = useState<LifeCalendarData | null>(null);
  const [view, setView] = useState<View>('year');
  const [gran, setGran] = useState<Gran>('day');
  const [cursor, setCursor] = useState('');
  const [birthInput, setBirthInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [detail, setDetail] = useState<DetailItem[] | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem('lifeos:lifecal:view') as View | null;
      const g = localStorage.getItem('lifeos:lifecal:gran') as Gran | null;
      if (v) setView(v);
      if (g) setGran(g);
    } catch {}
  }, []);

  const load = useCallback(async (v: View, g: Gran, c: string, birth: string | null, lifespan: number, area: string | null) => {
    const rows = rowsFor(v, g, c || '2000-01-01', birth, lifespan);
    const span = spanOf(rows);
    setLoading(true);
    const res = await getLifeCalendarAction(span ?? undefined, area);
    setLoading(false);
    if (!res.ok) { toast.error(res.error); return; }
    setData(res.data);
    if (!c) setCursor(res.data.today);
  }, []);

  useEffect(() => {
    void load(view, gran, cursor, data?.birth_date ?? null, data?.lifespan_years ?? 80, areaId);
    // data is deliberately not a dependency: it is the result of this load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, gran, cursor, areaId]);

  useEffect(() => {
    void listAreasAction().then((r) => r.ok && setAreas(r.data));
  }, []);

  const rows = useMemo(
    () => (data && cursor ? rowsFor(view, gran, cursor, data.birth_date, data.lifespan_years) : []),
    [data, view, gran, cursor],
  );

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let alive = true;
    setDetail(null);
    void getDayDetailAction(selected.from, selected.to).then((r) => { if (alive) { if (r.ok) setDetail(r.data); else toast.error(r.error); } });
    return () => { alive = false; };
  }, [selected]);
  // changing view or period clears the selection, so the panel never describes something off screen
  useEffect(() => { setSelected(null); }, [view, gran, cursor]);

  async function saveBirth() {
    const res = await setBirthDateAction(birthInput);
    if (!res.ok) { toast.error(res.error); return; }
    setView('life');
    setData((d) => (d ? { ...d, birth_date: res.data.birth_date } : d));
    void load('life', gran, cursor, res.data.birth_date, data?.lifespan_years ?? 80, areaId);
  }

  const needsBirth = view === 'life' && data && !data.birth_date;
  const hasSub = view === 'year' || view === 'month';
  const subLabel = view === 'year' ? 'Months' : 'Weeks';
  const dot = view === 'life' ? 'size-2' : view === 'year' && gran === 'sub' ? 'size-6' : view === 'week' ? 'size-8' : view === 'month' && gran === 'sub' ? 'size-8' : 'size-3.5';

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{title(cursor || '2000-01-01', view)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {hasSub && (
            <div className="flex rounded-lg bg-muted p-0.5 text-xs">
              {(['sub', 'day'] as Gran[]).map((g) => (
                <button key={g} onClick={() => { setGran(g); try { localStorage.setItem('lifeos:lifecal:gran', g); } catch {} }}
                  className={`rounded-md px-2 py-1 font-medium ${gran === g ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
                  {g === 'sub' ? subLabel : 'Days'}
                </button>
              ))}
            </div>
          )}
          <div className="flex rounded-lg bg-muted p-0.5 text-xs">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => { setView(v.key); try { localStorage.setItem('lifeos:lifecal:view', v.key); } catch {} }}
                className={`rounded-md px-2 py-1 font-medium ${view === v.key ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
                {v.label}
              </button>
            ))}
          </div>
          {view !== 'life' && cursor && (
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="outline" aria-label="Previous" onClick={() => setCursor(shift(cursor, view, -1))}>‹</Button>
              <Button size="sm" variant="outline" onClick={() => data && setCursor(data.today)}>Today</Button>
              <Button size="icon-sm" variant="outline" aria-label="Next" onClick={() => setCursor(shift(cursor, view, 1))}>›</Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {[{ id: null as string | null, name: 'All areas', color: '#64748b' }, ...areas.map((a) => ({ id: a.id as string | null, name: a.name, color: areaColor(a) }))].map((a) => (
          <button
            key={a.id ?? 'all'}
            onClick={() => setAreaId(a.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${areaId === a.id ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted'}`}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: a.color }} />
            {a.name}
          </button>
        ))}
      </div>

      {needsBirth ? (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-dashed border-border p-4 text-sm">
          <p>When were you born? Your life becomes one dot per week across {data?.lifespan_years ?? 80} years.</p>
          <div className="flex gap-2">
            <Input type="date" value={birthInput} onChange={(e) => setBirthInput(e.target.value)} className="max-w-48" />
            <Button onClick={saveBirth} disabled={!birthInput}>Save</Button>
          </div>
        </div>
      ) : (
        <div className={`mt-4 flex flex-col gap-1 ${view === 'life' ? 'max-h-[28rem] overflow-y-auto' : ''}`}>
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-2">
              {(view === 'life' ? Number(row.label) % 5 === 0 : rows.length > 1) ? (
                <span className="w-6 shrink-0 text-right text-[11px] text-muted-foreground">{row.label}</span>
              ) : view === 'life' ? <span className="w-6 shrink-0" /> : null}
              <div className={`flex flex-wrap ${view === 'life' ? 'gap-[3px]' : 'gap-1.5'}`}>
                {row.cells.map((c) => <Dot key={c.key} cell={c} data={data} className={dot} selected={selected?.key === c.key} onSelect={() => setSelected((cur) => (cur?.key === c.key ? null : c))} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && areas.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {areas.map((a) => {
            const t = data.areas[a.id];
            const p = t && t.total > 0 ? Math.round((t.done / t.total) * 100) : null;
            const c = classify(t);
            return (
              <button key={a.id} onClick={() => setAreaId(areaId === a.id ? null : a.id)} className="rounded-lg border border-border p-2 text-left hover:bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs font-medium"><span className="size-2 rounded-full" style={{ backgroundColor: areaColor(a) }} />{a.name}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`inline-block size-3 rounded-full border ${COLORS[c]}`} />
                  <span className="text-sm font-semibold">{p === null ? '—' : `${p}%`}</span>
                  <span className="text-[12px] text-muted-foreground">{t ? `${t.done}/${t.total}` : 'no data'}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <DayPanel cell={selected} items={detail} areas={areas} onClose={() => setSelected(null)} />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
        {([['green', '70%+ done'], ['yellow', '50–70%'], ['red', 'under 50%'], ['empty', 'no data']] as [DotColor, string][]).map(([k, l]) => (
          <span key={k} className="flex items-center gap-1"><span className={`inline-block size-2.5 rounded-full border ${COLORS[k]}`} />{l}</span>
        ))}
        {data?.birth_date && <span className="ml-auto">{weeksLived(data.birth_date, data.today).toLocaleString()} weeks lived{loading ? ' · loading…' : ''}</span>}
      </div>
    </section>
  );
}

function Dot({ cell, data, className, selected, onSelect }: { cell: Cell; data: LifeCalendarData | null; className: string; selected: boolean; onSelect: () => void }) {
  const stat = data ? cellStat(cell, data.days, data.today) : undefined;
  const color = classify(stat);
  const isNow = !!data && cell.from <= data.today && cell.to >= data.today;
  const label = stat ? `${cell.label}: ${stat.done}/${stat.total} done (${Math.round((stat.done / stat.total) * 100)}%)` : `${cell.label}: no data`;
  return <button type="button" onClick={onSelect} aria-pressed={selected} title={label} aria-label={label} className={`${className} shrink-0 rounded-full border ${COLORS[color]} ${isNow ? 'ring-2 ring-primary ring-offset-1 ring-offset-card' : ''} ${selected ? 'outline outline-2 outline-offset-2 outline-foreground' : 'hover:outline hover:outline-1 hover:outline-offset-1 hover:outline-foreground/40'}`} />;
}

function DayPanel({ cell, items, areas, onClose }: { cell: Cell; items: DetailItem[] | null; areas: Area[]; onClose: () => void }) {
  const am = new Map(areas.map((a) => [a.id, a]));
  const done = items?.filter((i) => i.done).length ?? 0;
  const total = items?.length ?? 0;
  const pctVal = total ? Math.round((done / total) * 100) : null;
  const byArea = new Map<string, { name: string; color: string; done: number; total: number }>();
  for (const it of items ?? []) {
    const a = it.area_id ? am.get(it.area_id) : null;
    const k = it.area_id ?? 'none';
    const e = byArea.get(k) ?? { name: a?.name ?? 'No area', color: a ? areaColor(a) : '#94a3b8', done: 0, total: 0 };
    e.total += 1; if (it.done) e.done += 1; byArea.set(k, e);
  }
  const multi = cell.from !== cell.to;
  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-sm">
      <div className="flex items-center gap-2">
        <div className="font-semibold">{cell.label}{multi ? ` · ${cell.from} → ${cell.to}` : ` · ${cell.from}`}</div>
        {items && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pctVal === null ? 'bg-muted text-muted-foreground' : pctVal >= 70 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : pctVal >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'}`}>{pctVal === null ? 'nothing scheduled' : `${pctVal}% · ${done}/${total}`}</span>}
        <button type="button" onClick={onClose} className="ml-auto rounded px-2 text-muted-foreground hover:bg-muted" aria-label="Close">×</button>
      </div>
      {items === null ? <p className="mt-2 text-xs text-muted-foreground">Loading…</p> : total === 0 ? <p className="mt-2 text-xs text-muted-foreground">No tasks or habits were scheduled then.</p> : (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...byArea.values()].map((a) => (
              <span key={a.name} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs"><span className="size-2 rounded-full" style={{ backgroundColor: a.color }} />{a.name} <b>{Math.round((a.done / a.total) * 100)}%</b><span className="text-muted-foreground">{a.done}/{a.total}</span></span>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([['Not done', false], ['Done', true]] as const).map(([label, flag]) => (
              <div key={label}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label} · {items.filter((i) => i.done === flag).length}</div>
                <ul className="space-y-1">
                  {items.filter((i) => i.done === flag).slice(0, 40).map((i) => (
                    <li key={`${i.kind}-${i.id}-${i.date}`} className="flex items-center gap-1.5">
                      <span className={flag ? 'text-emerald-600' : 'text-red-500'}>{flag ? '✓' : '✕'}</span>
                      <span className="rounded bg-muted px-1 text-[10px] font-semibold uppercase text-muted-foreground">{i.kind}</span>
                      {i.href ? <Link href={i.href} className="truncate hover:underline">{i.title}</Link> : <span className="truncate">{i.title}</span>}
                      {multi && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{i.date.slice(5)}</span>}
                    </li>
                  ))}
                  {items.filter((i) => i.done === flag).length === 0 && <li className="text-xs text-muted-foreground">None</li>}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default LifeCalendar;
