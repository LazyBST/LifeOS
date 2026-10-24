'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CompletedDailyRow } from '@/lib/types/db';
import { formatDate } from '@/lib/time';
import { EmptyChart } from './CompletedPerDay';

/** Area plus its already-resolved display colour — resolved server-side via
 *  `areaColor()` (that module is server-only, so this client chart never
 *  imports it directly). */
export type AreaWithColor = { id: string; name: string; resolvedColor: string };

type Props = {
  rows: CompletedDailyRow[];
  areas: AreaWithColor[];
};

/** Effort (minutes) completed per day, stacked by Area — colour follows the
 *  Area identity, never its rank in the stack. */
export function EffortByArea({ rows, areas }: Props) {
  const areaMap = new Map(areas.map((a) => [a.id, a]));
  const days = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = r.area_id ?? 'none';
    const day = days.get(r.day) ?? {};
    day[key] = (day[key] ?? 0) + r.effort_min;
    days.set(r.day, day);
  }
  const data = [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, byArea]) => ({ day, ...byArea }));

  const areaKeys = [...new Set(rows.map((r) => r.area_id ?? 'none'))];

  if (data.length === 0) {
    return <EmptyChart label="No effort logged in this range yet." />;
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
            width={32}
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
            formatter={(value, name) => [`${value} min`, String(name)]}
          />
          {areaKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />}
          {areaKeys.map((key) => {
            const area = key === 'none' ? null : areaMap.get(key);
            const name = area?.name ?? 'Unassigned';
            const color = area?.resolvedColor ?? '#94a3b8';
            return (
              <Bar key={key} dataKey={key} stackId="effort" name={name} fill={color} radius={[2, 2, 0, 0]} maxBarSize={18} />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default EffortByArea;
