'use client';
import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR, formatINRCompact } from '@/lib/format';
import { Amt } from './Amt';
import { HINT, LegendBar, useLegend, useZoomed } from './chart-kit';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: string) => `${Number(d.slice(8))} ${SHORT[Number(d.slice(5, 7)) - 1]}`;
/** axis labels and chart notes: 22K, 4.17L, 2.1Cr (no rupee sign) */
const k = (n: number) => formatINRCompact(n).replace('₹', '');
const tip = { fontSize: 12, borderRadius: 8, background: 'var(--popover)', border: '1px solid var(--border)', color: 'var(--popover-foreground)' };
const axis = { fontSize: 10, fill: 'var(--muted-foreground)' };
/** the soft band behind a hovered bar or point */
const cursor = { fill: 'var(--muted)', fillOpacity: 0.35, stroke: 'none' };
const GRID = <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />;
export const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16', '#f97316', '#64748b'];

type PeriodSeries = { day: number; current: number | null; previous: number }[];

/** This period against the last one, as running totals by day; switch between expense, income and net. */
export function PeriodComparison({ expense, income, net, currentLabel, previousLabel }: { expense: PeriodSeries; income: PeriodSeries; net: PeriodSeries; currentLabel: string; previousLabel: string }) {
  const [tab, setTab] = useState<'expense' | 'income' | 'net'>('expense');
  const data = { expense, income, net }[tab];
  const lg = useLegend(['current', 'previous']);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="no-drag mb-2 flex rounded-lg bg-muted p-0.5 text-xs">
        {(['expense', 'income', 'net'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-2 py-1 font-medium capitalize ${tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{t === 'net' ? 'Cash flow' : t}</button>
        ))}
      </div>
      <div className="relative min-h-48 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%" className="absolute inset-0">
          <LineChart accessibilityLayer={false} data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            {GRID}
            <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={42} tickFormatter={k} />
            <Tooltip contentStyle={tip} labelFormatter={(d) => `Day ${d}`} formatter={(v) => formatINR(Number(v))} />
            <Line hide={lg.hidden('current')} strokeOpacity={lg.opacity('current')} type="stepAfter" dataKey="current" name={currentLabel} stroke="#6366f1" strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line hide={lg.hidden('previous')} strokeOpacity={lg.opacity('previous')} type="stepAfter" dataKey="previous" name={previousLabel} stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <LegendBar legend={lg} items={[{ key: 'current', label: currentLabel, color: '#6366f1' }, { key: 'previous', label: previousLabel, color: '#f59e0b', dashed: true }]} />
    </div>
  );
}

export function BalanceTrend({ points }: { points: { date: string; balance: number }[] }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">Nothing to show for this month yet.</p>;
  return (
    <div className="relative min-h-48 w-full flex-1">
      <ResponsiveContainer width="100%" height="100%" className="absolute inset-0">
        <AreaChart accessibilityLayer={false} data={points} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
          {GRID}
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={axis} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={42} tickFormatter={k} />
          <Tooltip contentStyle={tip} labelFormatter={(d) => dayLabel(String(d))} formatter={(v) => [formatINR(Number(v)), 'Balance']} />
          <Area type="stepAfter" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="#3b82f6" fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The next three months: balance with only scheduled payments, and with everyday spending as well. */
export function ForecastChart({ points }: { points: { date: string; committed: number; expected: number }[] }) {
  const lowest = points.reduce((m, p) => (p.expected < m.expected ? p : m), points[0]);
  const lg = useLegend(['committed', 'expected']);
  return (
    <>
    <div className="relative min-h-52 w-full flex-1">
      <ResponsiveContainer width="100%" height="100%" className="absolute inset-0">
        <LineChart accessibilityLayer={false} data={points} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
          {GRID}
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={axis} tickLine={false} axisLine={false} minTickGap={36} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={42} tickFormatter={k} />
          <Tooltip contentStyle={tip} labelFormatter={(d) => dayLabel(String(d))} formatter={(v, name) => [formatINR(Number(v)), String(name)]} />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 3" />
          {lowest && lowest.expected < 0 && <ReferenceLine x={lowest.date} stroke="#ef4444" strokeOpacity={0.4} />}
          <Line hide={lg.hidden('committed')} strokeOpacity={lg.opacity('committed')} type="stepAfter" dataKey="committed" name="Scheduled payments only" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line hide={lg.hidden('expected')} strokeOpacity={lg.opacity('expected')} type="monotone" dataKey="expected" name="With usual spending" stroke="#6366f1" strokeWidth={2.2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <LegendBar legend={lg} items={[{ key: 'committed', label: 'Scheduled payments only', color: '#10b981' }, { key: 'expected', label: 'With usual spending', color: '#6366f1' }]} />
    </>
  );
}

export function CategoryDonut({ rows, previous = [] }: { rows: { category: string; amount: number }[]; /** the same categories in the previous period, for the change column */ previous?: { category: string; amount: number }[] }) {
  const before = new Map(previous.map((r) => [r.category, r.amount]));
  const zoomed = useZoomed();
  const top = rows.slice(0, 8);
  const rest = rows.slice(8).reduce((s, r) => s + r.amount, 0);
  const data = rest > 0 ? [...top, { category: 'Other', amount: rest }] : top;
  const lg = useLegend(data.map((r) => r.category));
  const shown = data.filter((r) => !lg.hidden(r.category));
  const total = shown.reduce((s, r) => s + r.amount, 0);
  if (rows.reduce((s, r) => s + r.amount, 0) <= 0) return <p className="text-sm text-muted-foreground">No spending recorded in this period.</p>;
  return (
    <div className={`flex flex-wrap items-center ${zoomed ? 'justify-center gap-8' : 'gap-4'}`}>
      <div className={`relative shrink-0 ${zoomed ? 'size-72 sm:size-[26rem]' : 'size-44'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie data={shown} dataKey="amount" nameKey="category" innerRadius="62%" outerRadius="95%" paddingAngle={1} stroke="none" isAnimationActive={false}>
              {shown.map((r) => <Cell key={r.category} fill={PALETTE[data.indexOf(r) % PALETTE.length]} fillOpacity={lg.opacity(r.category)} />)}
            </Pie>
            <Tooltip contentStyle={tip} formatter={(v) => formatINR(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-muted-foreground">Spent</span>
          <span className={`${zoomed ? 'text-2xl' : 'text-base'} font-bold`}><Amt value={total} /></span>
        </div>
      </div>
      <div className="min-w-40 flex-1">
        <ul className={`space-y-0.5 ${zoomed ? 'text-xs' : 'text-sm'}`}>
          {data.map((r, i) => {
            const st = lg.state(r.category);
            const b = before.get(r.category);
            return (
              <li key={r.category}>
                <button type="button" onClick={() => lg.cycle(r.category)} title={HINT} aria-pressed={st === 'focus'}
                  className={`no-drag flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition ${st === 'focus' ? 'bg-muted font-semibold' : 'hover:bg-muted/60'} ${st === 'hidden' ? 'opacity-45' : st === 'normal' && lg.opacity(r.category) < 1 ? 'opacity-50' : ''}`}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className={`flex-1 truncate ${st === 'hidden' ? 'line-through' : ''}`}>{r.category}</span>
                  <span className="text-xs text-muted-foreground">{total > 0 && st !== 'hidden' ? `${Math.round((r.amount / total) * 100)}%` : ''}</span>
                  <span className="w-20 text-right font-medium"><Amt value={r.amount} /></span>
                  {!b ? <span className="w-12 text-right text-[11px] text-muted-foreground">new</span> : (() => { const d = Math.round(((r.amount - b) / b) * 100); return <span className={`w-12 text-right text-[11px] font-medium ${d > 0 ? 'text-red-600' : d < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>{d > 0 ? '↗' : d < 0 ? '↘' : ''} {Math.abs(d)}%</span>; })()}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 px-1.5 text-[11px] text-muted-foreground">Click a category to highlight it (click several), again to hide it, again to bring it back.{lg.touched && <> <button type="button" onClick={lg.reset} className="underline">Reset</button></>}</p>
      </div>
    </div>
  );
}

/** Income against expense for the last six months, with the net as a line. */
export function MonthlyBars({ rows }: { rows: { month: string; income: number; expense: number; net: number }[] }) {
  const lg = useLegend(['income', 'expense', 'net']);
  return (
    <>
    <div className="relative min-h-52 w-full flex-1">
      <ResponsiveContainer width="100%" height="100%" className="absolute inset-0">
        <ComposedChart accessibilityLayer={false} data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
          {GRID}
          <XAxis dataKey="month" tickFormatter={(m: string) => SHORT[Number(m.slice(5)) - 1]} tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={42} tickFormatter={k} />
          <Tooltip cursor={cursor} contentStyle={tip} labelFormatter={(m) => `${SHORT[Number(String(m).slice(5)) - 1]} ${String(m).slice(0, 4)}`} formatter={(v, n) => [formatINR(Number(v)), String(n)]} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar hide={lg.hidden('income')} fillOpacity={lg.opacity('income')} dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar hide={lg.hidden('expense')} fillOpacity={lg.opacity('expense')} dataKey="expense" name="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line hide={lg.hidden('net')} strokeOpacity={lg.opacity('net')} type="monotone" dataKey="net" name="Net" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <LegendBar legend={lg} items={[{ key: 'expense', label: 'Expense', color: '#ef4444' }, { key: 'income', label: 'Income', color: '#10b981' }, { key: 'net', label: 'Net', color: '#6366f1' }]} />
    </>
  );
}

/** What you spent each day of the period, against your daily average. */
export function DailyBars({ rows }: { rows: { date: string; amount: number }[] }) {
  const avg = rows.length ? rows.reduce((s, r) => s + r.amount, 0) / rows.length : 0;
  return (
    <div className="relative min-h-48 w-full flex-1">
      <ResponsiveContainer width="100%" height="100%" className="absolute inset-0">
        <BarChart accessibilityLayer={false} data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
          {GRID}
          <XAxis dataKey="date" tickFormatter={(d: string) => String(Number(d.slice(8)))} tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={42} tickFormatter={k} />
          <Tooltip cursor={cursor} contentStyle={tip} labelFormatter={(d) => dayLabel(String(d))} formatter={(v) => [formatINR(Number(v)), 'Spent']} />
          <ReferenceLine y={avg} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: `avg ${k(avg)}`, position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }} />
          <Bar dataKey="amount" fill="#6366f1" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Spending by day of the week, to show which days cost the most. Bars are the total; the line is the average for that weekday. */
export function WeekdayBars({ rows }: { rows: { day: string; amount: number; average: number }[] }) {
  const lg = useLegend(['amount', 'average']);
  return (
    <>
      <div className="relative min-h-48 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%" className="absolute inset-0">
          <ComposedChart accessibilityLayer={false} data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            {GRID}
            <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={42} tickFormatter={k} />
            <Tooltip cursor={cursor} contentStyle={tip} formatter={(v, n) => [formatINR(Number(v)), String(n)]} />
            <Bar hide={lg.hidden('amount')} fillOpacity={lg.opacity('amount')} dataKey="amount" name="Total" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line hide={lg.hidden('average')} strokeOpacity={lg.opacity('average')} type="monotone" dataKey="average" name="Average that day" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <LegendBar legend={lg} items={[{ key: 'amount', label: 'Total', color: '#6366f1' }, { key: 'average', label: 'Average that day', color: '#f59e0b' }]} />
    </>
  );
}

/** Who the money went to: the biggest payees with a bar each. */
export function PayeeBars({ rows }: { rows: { name: string; amount: number; count: number }[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No spending recorded in this period.</p>;
  const max = Math.max(...rows.map((r) => r.amount));
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.name} className="text-sm">
          <div className="mb-0.5 flex items-center justify-between gap-2"><span className="truncate font-medium">{r.name}</span><span className="shrink-0 tabular-nums"><b><Amt value={r.amount} /></b> <span className="text-xs text-muted-foreground">· {r.count}×</span></span></div>
          <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(r.amount / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} /></div>
        </li>
      ))}
    </ul>
  );
}
