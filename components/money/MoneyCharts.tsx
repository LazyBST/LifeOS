'use client';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR } from '@/lib/format';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: string) => `${Number(d.slice(8))} ${SHORT[Number(d.slice(5, 7)) - 1]}`;
const k = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n)));
const tip = { fontSize: 12, borderRadius: 8, background: 'var(--popover)', border: '1px solid var(--border)', color: 'var(--popover-foreground)' };
const axis = { fontSize: 10, fill: 'var(--muted-foreground)' };
const GRID = <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />;
export const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16', '#f97316', '#64748b'];

type PeriodSeries = { day: number; current: number | null; previous: number }[];

/** This period against the last one, as running totals by day; switch between expense, income and net. */
export function PeriodComparison({ expense, income, net, currentLabel, previousLabel }: { expense: PeriodSeries; income: PeriodSeries; net: PeriodSeries; currentLabel: string; previousLabel: string }) {
  const [tab, setTab] = useState<'expense' | 'income' | 'net'>('expense');
  const data = { expense, income, net }[tab];
  return (
    <div>
      <div className="no-drag mb-2 flex rounded-lg bg-muted p-0.5 text-xs">
        {(['expense', 'income', 'net'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-2 py-1 font-medium capitalize ${tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{t === 'net' ? 'Cash flow' : t}</button>
        ))}
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            {GRID}
            <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={42} tickFormatter={k} />
            <Tooltip contentStyle={tip} labelFormatter={(d) => `Day ${d}`} formatter={(v) => formatINR(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="stepAfter" dataKey="current" name={currentLabel} stroke="#6366f1" strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line type="stepAfter" dataKey="previous" name={previousLabel} stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function BalanceTrend({ points }: { points: { date: string; balance: number }[] }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">Nothing to show for this month yet.</p>;
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
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
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
          {GRID}
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={axis} tickLine={false} axisLine={false} minTickGap={36} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={42} tickFormatter={k} />
          <Tooltip contentStyle={tip} labelFormatter={(d) => dayLabel(String(d))} formatter={(v, name) => [formatINR(Number(v)), String(name)]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 3" />
          {lowest && lowest.expected < 0 && <ReferenceLine x={lowest.date} stroke="#ef4444" strokeOpacity={0.4} />}
          <Line type="stepAfter" dataKey="committed" name="Scheduled payments only" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="expected" name="With usual spending" stroke="#6366f1" strokeWidth={2.2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryDonut({ rows }: { rows: { category: string; amount: number }[] }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total <= 0) return <p className="text-sm text-muted-foreground">No spending recorded in this period.</p>;
  const top = rows.slice(0, 8);
  const rest = rows.slice(8).reduce((s, r) => s + r.amount, 0);
  const data = rest > 0 ? [...top, { category: 'Other', amount: rest }] : top;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="amount" nameKey="category" innerRadius="62%" outerRadius="95%" paddingAngle={1} stroke="none" isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip contentStyle={tip} formatter={(v) => formatINR(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-muted-foreground">Spent</span>
          <span className="text-base font-bold">{formatINR(total)}</span>
        </div>
      </div>
      <ul className="min-w-40 flex-1 space-y-1 text-sm">
        {data.map((r, i) => (
          <li key={r.category} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 truncate">{r.category}</span>
            <span className="text-xs text-muted-foreground">{Math.round((r.amount / total) * 100)}%</span>
            <span className="w-20 text-right font-medium">{formatINR(r.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
