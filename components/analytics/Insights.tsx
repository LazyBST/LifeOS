'use client';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const GRID = { stroke: 'currentColor', className: 'text-border' };
const AX = { tick: { fontSize: 11 }, tickLine: false, axisLine: false } as const;
const TIP = { contentStyle: { fontSize: 12, borderRadius: 8 } };
const Empty = ({ text = 'Not enough data yet.' }: { text?: string }) => <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
const Frame = ({ children }: { children: React.ReactElement }) => <div className="h-full min-h-40 w-full"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;

/** GitHub-style grid: one square per day, darker for more units completed. */
export function ActivityHeat({ days }: { days: { date: string; count: number }[] }) {
  const total = days.reduce((n, d) => n + d.count, 0);
  if (total === 0) return <Empty text="Complete a few tasks and your activity shows up here." />;
  const max = Math.max(...days.map((d) => d.count));
  const lead = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells = [...Array.from({ length: lead }, () => null), ...days];
  const shade = (c: number) => (c === 0 ? 'bg-muted' : c <= max * 0.25 ? 'bg-emerald-200 dark:bg-emerald-900' : c <= max * 0.5 ? 'bg-emerald-400 dark:bg-emerald-700' : c <= max * 0.75 ? 'bg-emerald-500' : 'bg-emerald-700 dark:bg-emerald-400');
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="grid gap-[3px] overflow-x-auto" style={{ gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column', gridAutoColumns: '12px' }}>
        {cells.map((d, i) => d ? <div key={d.date} title={`${d.date}: ${d.count} completed`} className={`size-3 rounded-[3px] ${shade(d.count)}`} /> : <div key={`p${i}`} className="size-3" />)}
      </div>
      <p className="text-xs text-muted-foreground">{total} units completed in the last 26 weeks · busiest day {max}</p>
    </div>
  );
}

export function Donut({ data, unit = '' }: { data: { name: string; value: number; color?: string }[]; unit?: string }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  if (total === 0) return <Empty />;
  const palette = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ef4444', '#8b5cf6', '#64748b'];
  return (
    <div className="flex h-full min-h-44 items-center gap-3">
      <div className="h-full min-h-40 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((d, i) => <Cell key={d.name} fill={d.color ?? palette[i % palette.length]} />)}
            </Pie>
            <Tooltip {...TIP} formatter={(v) => [`${v}${unit}`, '']} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-36 space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color ?? palette[i % palette.length] }} /><span className="truncate">{d.name}</span><b className="ml-auto">{Math.round((d.value / total) * 100)}%</b></li>
        ))}
      </ul>
    </div>
  );
}

/** Finished vs pushed per week, with the average daily score as a line. */
export function ExecutionWeeks({ weeks }: { weeks: { week: string; done: number; pushed: number; score: number | null }[] }) {
  if (weeks.length === 0) return <Empty text="Schedule and finish tasks or habits to see how consistently you follow through." />;
  return (
    <Frame>
      <ComposedChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} {...GRID} />
        <XAxis dataKey="week" {...AX} />
        <YAxis yAxisId="n" {...AX} width={32} allowDecimals={false} />
        <YAxis yAxisId="s" orientation="right" domain={[0, 100]} {...AX} width={36} tickFormatter={(v) => `${v}%`} />
        <Tooltip {...TIP} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="n" dataKey="done" name="Finished" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} isAnimationActive={false} />
        <Bar yAxisId="n" dataKey="pushed" name="Pushed" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Line yAxisId="s" type="monotone" dataKey="score" name="Daily score" stroke="#6366f1" strokeWidth={2.2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

export function HourBars({ hours }: { hours: { hour: number; count: number }[] }) {
  if (hours.every((h) => h.count === 0)) return <Empty text="Finish tasks and you will see which hours you are most productive." />;
  const peak = hours.reduce((a, b) => (b.count > a.count ? b : a));
  return (
    <div className="flex h-full min-h-44 flex-col gap-1">
      <p className="text-xs text-muted-foreground">Most tasks get done around <b className="text-foreground">{peak.hour % 12 || 12}{peak.hour < 12 ? 'am' : 'pm'}</b></p>
      <div className="min-h-0 flex-1"><Frame>
        <BarChart data={hours.map((h) => ({ ...h, label: `${h.hour % 12 || 12}${h.hour < 12 ? 'a' : 'p'}` }))} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="label" {...AX} interval={2} />
          <YAxis {...AX} allowDecimals={false} />
          <Tooltip {...TIP} formatter={(v) => [`${v} tasks`, '']} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>{hours.map((h) => <Cell key={h.hour} fill={h.hour === peak.hour ? '#6366f1' : '#a5b4fc'} />)}</Bar>
        </BarChart>
      </Frame></div>
    </div>
  );
}

export function StreakBars({ streaks }: { streaks: { name: string; current: number; longest: number }[] }) {
  if (streaks.length === 0) return <Empty text="No habits yet." />;
  const max = Math.max(1, ...streaks.map((s) => s.longest));
  return (
    <ul className="space-y-2">
      {streaks.map((s) => (
        <li key={s.name} className="text-xs">
          <div className="flex items-center justify-between"><span className="truncate font-medium">{s.name}</span><span className="text-muted-foreground">🔥 {s.current} <span className="opacity-60">· best {s.longest}</span></span></div>
          <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 rounded-full bg-amber-200 dark:bg-amber-500/30" style={{ width: `${(s.longest / max) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-amber-500" style={{ width: `${(s.current / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MoneyMonths({ data }: { data: { month: string; income: number; spent: number }[] }) {
  if (data.every((m) => m.income === 0 && m.spent === 0)) return <Empty text="Add income and expenses to compare them month by month." />;
  const fmt = (v: number) => `${Math.round(v / 1000)}k`;
  return (
    <Frame>
      <BarChart data={data.map((m) => ({ ...m, label: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) }))} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} {...GRID} />
        <XAxis dataKey="label" {...AX} />
        <YAxis {...AX} width={40} tickFormatter={fmt} />
        <Tooltip {...TIP} formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, '']} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill="#22c55e" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="spent" name="My spending" fill="#ef4444" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </Frame>
  );
}

export function PagesBars({ data }: { data: { date: string; pages: number }[] }) {
  const total = data.reduce((n, d) => n + d.pages, 0);
  if (total === 0) return <Empty text="Log pages in Books and your reading pace shows here." />;
  return (
    <div className="flex h-full min-h-44 flex-col gap-1">
      <p className="text-xs text-muted-foreground">{total} pages in 30 days · {Math.round((total / 30) * 10) / 10} per day</p>
      <div className="min-h-0 flex-1"><Frame>
        <BarChart data={data.map((d) => ({ ...d, label: d.date.slice(8) }))} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="label" {...AX} interval={4} />
          <YAxis {...AX} allowDecimals={false} />
          <Tooltip {...TIP} formatter={(v) => [`${v} pages`, '']} />
          <Bar dataKey="pages" fill="#8b5cf6" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </Frame></div>
    </div>
  );
}

export function PriorityBars({ data }: { data: { name: string; value: number }[] }) {
  if (data.every((d) => d.value === 0)) return <Empty text="No open tasks." />;
  const colors: Record<string, string> = { P0: '#dc2626', P1: '#ea580c', P2: '#d97706', P3: '#2563eb' };
  return (
    <Frame>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <XAxis type="number" {...AX} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...AX} width={28} />
        <Tooltip {...TIP} formatter={(v) => [`${v} open`, '']} />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>{data.map((d) => <Cell key={d.name} fill={colors[d.name] ?? '#64748b'} />)}</Bar>
      </BarChart>
    </Frame>
  );
}

export function StatTiles({ items }: { items: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'warn' }[] }) {
  const tone = { good: 'text-emerald-600 dark:text-emerald-400', bad: 'text-red-600 dark:text-red-400', warn: 'text-amber-600 dark:text-amber-400' };
  return (
    <div className="grid h-full grid-cols-2 gap-2">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col justify-center rounded-xl bg-muted/50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{i.label}</div>
          <div className={`text-2xl font-bold leading-tight ${i.tone ? tone[i.tone] : ''}`}>{i.value}</div>
          {i.sub && <div className="text-xs text-muted-foreground">{i.sub}</div>}
        </div>
      ))}
    </div>
  );
}
