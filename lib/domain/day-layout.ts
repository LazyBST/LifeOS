// Layout maths for the day view: overlapping blocks sit side by side instead of on top of each other.
export type TimedBlock = { id: string; start: number; end: number };
export type Placed = { id: string; col: number; cols: number };

/**
 * Greedy column assignment: blocks that overlap in time share a cluster and get the same column count, each in
 * the first free column. `start`/`end` are minutes from midnight; a block must be at least `minLen` long.
 */
export function assignColumns(blocks: TimedBlock[], minLen = 20): Placed[] {
  const sorted = [...blocks].map((b) => ({ ...b, end: Math.max(b.end, b.start + minLen) })).sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let cluster: { id: string; col: number; end: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) placed.push({ id: c.id, col: c.col, cols });
    cluster = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd && cluster.length) { flush(); clusterEnd = -1; }
    const used = new Set(cluster.filter((c) => c.end > b.start).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ id: b.id, col, end: b.end });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return placed;
}

/** "07:30:00" or "07:30" -> minutes from midnight. */
export function minutesOfTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
}

export const fmtTime = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
