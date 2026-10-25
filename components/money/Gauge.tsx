import { formatINR } from '@/lib/format';

const R = 78, CX = 100, CY = 100, W = 22;
const pt = (deg: number, r = R) => [CX + r * Math.cos((Math.PI * deg) / 180), CY - r * Math.sin((Math.PI * deg) / 180)];
/** Arc between two angles of the half-circle (180° = left end, 0° = right end). */
function arc(from: number, to: number) {
  const [x1, y1] = pt(from), [x2, y2] = pt(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * A speedometer: red, amber and green zones with a needle. `position` is 0 (far left) to 1 (far right);
 * with `invert` the zones run green to red, for things where less is better, like spending.
 */
export function Gauge({ label, position, value, hint, invert = false }: { label: string; position: number; value: string; hint?: string; invert?: boolean }) {
  const p = Math.min(1, Math.max(0, Number.isFinite(position) ? position : 0));
  const angle = 180 - p * 180;
  const [nx, ny] = pt(angle, R - 14);
  const zones = invert ? ['#22c55e', '#f59e0b', '#ef4444'] : ['#ef4444', '#f59e0b', '#22c55e'];
  const segs: [number, number][] = [[180, 122], [118, 62], [58, 0]];
  return (
    <figure className="flex min-w-0 flex-1 flex-col items-center">
      <svg viewBox="0 0 200 118" className="w-full max-w-[220px]" role="img" aria-label={`${label}: ${value}`}>
        {segs.map(([a, b], i) => <path key={i} d={arc(a, b)} fill="none" stroke={zones[i]} strokeWidth={W} strokeLinecap="round" />)}
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="currentColor" strokeWidth={4} strokeLinecap="round" className="text-foreground" style={{ transition: 'all 0.6s ease' }} />
        <circle cx={CX} cy={CY} r={7} fill="currentColor" className="text-foreground" />
      </svg>
      <figcaption className="-mt-1 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tracking-tight">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </figcaption>
    </figure>
  );
}

export { formatINR };
