'use client';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type ProgressRow = { id: string; name: string; kind: 'goal' | 'project'; pct: number; doneH: number; totalH: number };

/** Horizontal bars of effort progress: one per goal, with its projects beneath in a lighter tone. */
export function ProgressChart({ rows, color }: { rows: ProgressRow[]; color: string }) {
  const height = Math.max(120, rows.length * 30 + 30);
  return (
    <div role="img" aria-label="Progress against goals and projects" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} strokeOpacity={0.15} />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} fontSize={11} />
          <YAxis type="category" dataKey="name" width={130} fontSize={11} tickLine={false} />
          <Tooltip
            cursor={{ fillOpacity: 0.08 }}
            formatter={(_v, _n, p) => [`${p.payload.pct}% · ${p.payload.doneH}h of ${p.payload.totalH}h`, p.payload.kind === 'goal' ? 'Goal' : 'Project']}
            labelFormatter={() => ''}
          />
          <Bar dataKey="pct" radius={3} barSize={14}>
            {rows.map((r) => <Cell key={r.id} fill={color} fillOpacity={r.kind === 'goal' ? 1 : 0.45} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ProgressChart;
