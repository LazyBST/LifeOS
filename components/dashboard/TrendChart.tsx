'use client';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type TrendProps = {
  weeks: string[];
  ahead: number;
  series: { id: string; name: string; color: string; actual: number[]; forecast: number[] }[];
  /** how y values read: plain numbers or thousands (functions cannot cross the server/client boundary) */
  unit?: 'count' | 'thousands';
  height?: number;
};

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (d: string) => `${Number(d.slice(8))} ${SHORT[Number(d.slice(5, 7)) - 1]}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Weekly line chart: solid actuals, dashed forecast in a shaded zone. */
export function TrendChart({ weeks, ahead, series, unit = 'count', height = 220 }: TrendProps) {
  const format = (n: number) => (unit === 'thousands' ? `${Math.round(n / 1000)}k` : String(n));
  const n = weeks.length;
  const allWeeks = [...weeks, ...Array.from({ length: ahead }, (_, i) => addDays(weeks[n - 1], 7 * (i + 1)))];
  const data = allWeeks.map((w, i) => {
    const row: Record<string, string | number | null> = { label: label(w) + (i === n - 1 ? ' · now' : '') };
    for (const s of series) {
      row[s.id] = i < n ? s.actual[i] : null;
      row[`${s.id}_f`] = i === n - 1 ? s.actual[i] : i >= n ? s.forecast[i - n] : null;
    }
    return row;
  });
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="currentColor" className="text-border" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} tickFormatter={format} />
          <Tooltip formatter={(v, name) => [format(Number(v)), String(name).replace('_f', ' (forecast)')]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <ReferenceArea x1={data[n - 1].label as string} x2={data[data.length - 1].label as string} fill="#6366f1" fillOpacity={0.06} label={{ value: 'Forecast', position: 'insideTopRight', fontSize: 10, fill: '#6366f1' }} />
          {series.map((s) => (
            <Line key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={s.color} strokeWidth={2.2} dot={false} connectNulls={false} isAnimationActive={false} />
          ))}
          {series.map((s) => (
            <Line key={`${s.id}_f`} type="monotone" dataKey={`${s.id}_f`} name={`${s.name}_f`} stroke={s.color} strokeWidth={2.2} strokeDasharray="5 4" dot={false} connectNulls={false} isAnimationActive={false} legendType="none" />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
