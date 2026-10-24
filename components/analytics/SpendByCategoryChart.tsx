'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyChart } from './CompletedPerDay';
import { formatINR } from '@/lib/format';

export type SpendRow = { category: string; amount: number };

type Props = {
  thisMonth: SpendRow[];
  lastMonth: SpendRow[];
  thisMonthLabel: string;
  lastMonthLabel: string;
};


/** Spending by category, this month vs last — grouped bars, one accent per
 *  month (not per category, since category count varies). */
export function SpendByCategoryChart({ thisMonth, lastMonth, thisMonthLabel, lastMonthLabel }: Props) {
  const categories = [...new Set([...thisMonth, ...lastMonth].map((r) => r.category))].sort();
  const thisMap = new Map(thisMonth.map((r) => [r.category, r.amount]));
  const lastMap = new Map(lastMonth.map((r) => [r.category, r.amount]));
  const data = categories.map((category) => ({
    category,
    current: thisMap.get(category) ?? 0,
    previous: lastMap.get(category) ?? 0,
  }));

  if (data.length === 0) {
    return <EmptyChart label="No spending recorded yet." />;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="category"
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--popover-foreground)',
            }}
            formatter={(value, name) => [formatINR(Number(value)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
          <Bar dataKey="previous" name={lastMonthLabel} fill="var(--muted-foreground)" radius={[3, 3, 0, 0]} maxBarSize={16} />
          <Bar dataKey="current" name={thisMonthLabel} fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SpendByCategoryChart;
