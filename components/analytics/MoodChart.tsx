'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '@/lib/time';
import { EmptyChart } from './CompletedPerDay';

export type MoodPoint = { date: string; mood: number | null };

type Props = {
  points: MoodPoint[];
};

/** Mood over time (journal_entries.mood, 1-5) — a single accent line. */
export function MoodChart({ points }: Props) {
  const data = points.filter((p) => p.mood != null);

  if (data.length === 0) {
    return <EmptyChart label="No mood entries yet." />;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => formatDate(d).slice(0, 6)}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[1, 5]}
            allowDecimals={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={24}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--popover-foreground)',
            }}
            labelFormatter={(d) => formatDate(String(d))}
            formatter={(value) => [`${value}`, 'Mood']}
          />
          <Line
            type="monotone"
            dataKey="mood"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--primary)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default MoodChart;
