'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CompletedDailyRow } from '@/lib/types/db';
import { formatDate } from '@/lib/time';

type Props = {
  rows: CompletedDailyRow[];
};

/** Tasks completed per day — one bar per day, summed across areas/goals. */
export function CompletedPerDay({ rows }: Props) {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.tasks);
  const data = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, tasks]) => ({ day, tasks }));

  if (data.length === 0) {
    return <EmptyChart label="No completed tasks in this range yet." />;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => formatDate(d).slice(0, 6)}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--popover-foreground)',
            }}
            labelFormatter={(d) => formatDate(String(d))}
            formatter={(value) => [`${value}`, 'Tasks']}
          />
          <Bar dataKey="tasks" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-56 w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export default CompletedPerDay;
