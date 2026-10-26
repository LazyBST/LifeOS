// Pure maths for "how did I spend my day": every scheduled block is an interval; the time nobody claims is wasted,
// and when blocks overlap, you are assumed to have worked on all of them at once.

export type Interval = { id: string; title: string; group: string; color: string; start: number; end: number; /** where it sits: Area > Goal > Project > ... > this item */ path?: string[] };

export type Piece = { start: number; end: number; ids: string[] };

export type ItemUse = Interval & { minutes: number; alone: number; shared: number; with: string[] };
export type GroupUse = { group: string; color: string; minutes: number; alone: number; shared: number };

export type TimeUse = {
  window: { start: number; end: number };
  windowMin: number;
  usedMin: number;
  wastedMin: number;
  /** minutes with two or more things going on at once */
  overlapMin: number;
  /** minutes with exactly one thing going on */
  aloneMin: number;
  longestGapMin: number;
  pieces: Piece[];
  gaps: { start: number; end: number }[];
  items: ItemUse[];
  groups: GroupUse[];
  /** the same time rolled up by Area > Goal > Project > Task */
  tree: TreeNode[];
};

export type TreeNode = { name: string; minutes: number; color: string; children: TreeNode[] };

/** Clip to the window and drop what is left empty. */
function clip(i: Interval, ws: number, we: number): Interval | null {
  const start = Math.max(i.start, ws), end = Math.min(i.end, we);
  return end > start ? { ...i, start, end } : null;
}

export function timeUse(intervals: Interval[], window = { start: 0, end: 1440 }): TimeUse {
  const ws = Math.max(0, window.start), we = Math.min(1440, window.end);
  const list = intervals.map((i) => clip(i, ws, we)).filter((i): i is Interval => i !== null);

  // cut the day at every start and end; each piece has a fixed set of things going on
  const cuts = [...new Set([ws, we, ...list.flatMap((i) => [i.start, i.end])])].sort((a, b) => a - b);
  const pieces: Piece[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const [a, b] = [cuts[k], cuts[k + 1]];
    pieces.push({ start: a, end: b, ids: list.filter((i) => i.start <= a && i.end >= b).map((i) => i.id) });
  }
  const merged: Piece[] = []; // join neighbours that are the same set
  for (const p of pieces) {
    const last = merged[merged.length - 1];
    if (last && last.end === p.start && last.ids.join('|') === p.ids.join('|')) last.end = p.end; else merged.push({ ...p });
  }

  const len = (p: { start: number; end: number }) => p.end - p.start;
  const gaps = merged.filter((p) => p.ids.length === 0).map(({ start, end }) => ({ start, end }));
  const wastedMin = gaps.reduce((s, g) => s + len(g), 0);
  const overlapMin = merged.filter((p) => p.ids.length >= 2).reduce((s, p) => s + len(p), 0);
  const aloneMin = merged.filter((p) => p.ids.length === 1).reduce((s, p) => s + len(p), 0);

  const byId = new Map(list.map((i) => [i.id, i]));
  const items: ItemUse[] = list.map((i) => {
    const mine = merged.filter((p) => p.ids.includes(i.id));
    const withIds = new Set(mine.flatMap((p) => p.ids).filter((x) => x !== i.id));
    return {
      ...i, minutes: len(i), alone: mine.filter((p) => p.ids.length === 1).reduce((s, p) => s + len(p), 0),
      shared: mine.filter((p) => p.ids.length > 1).reduce((s, p) => s + len(p), 0), with: [...withIds].map((x) => byId.get(x)!.title),
    };
  }).sort((a, b) => a.start - b.start || a.end - b.end);

  // per group, a minute counts once even when two of its own items overlap
  const groups = new Map<string, GroupUse>();
  for (const p of merged) {
    if (!p.ids.length) continue;
    const present = new Set(p.ids.map((id) => byId.get(id)!.group));
    for (const g of present) {
      const color = list.find((i) => i.group === g)!.color;
      const cur = groups.get(g) ?? { group: g, color, minutes: 0, alone: 0, shared: 0 };
      cur.minutes += len(p);
      if (present.size === 1) cur.alone += len(p); else cur.shared += len(p);
      groups.set(g, cur);
    }
  }

  return {
    window: { start: ws, end: we }, windowMin: we - ws, usedMin: we - ws - wastedMin, wastedMin, overlapMin, aloneMin,
    longestGapMin: gaps.reduce((m, g) => Math.max(m, len(g)), 0), pieces: merged, gaps, items,
    groups: [...groups.values()].sort((a, b) => b.minutes - a.minutes),
    tree: rollup(list),
  };
}

/** Minutes covered by a set of intervals, counting overlapped minutes once. */
export function unionMin(list: { start: number; end: number }[]): number {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  let total = 0, cur: { start: number; end: number } | null = null;
  for (const i of sorted) {
    if (cur && i.start <= cur.end) cur.end = Math.max(cur.end, i.end);
    else { if (cur) total += cur.end - cur.start; cur = { start: i.start, end: i.end }; }
  }
  return cur ? total + cur.end - cur.start : total;
}

/**
 * Roll the intervals up their paths: a node's time is everything underneath it, with overlapped minutes inside
 * the node counted once (two tasks of one project at the same moment are one project-minute).
 */
export function rollup(list: Interval[]): TreeNode[] {
  type Raw = { name: string; color: string; own: Interval[]; kids: Map<string, Raw> };
  const root = new Map<string, Raw>();
  for (const i of list) {
    let level = root;
    const path = i.path?.length ? i.path : [i.group, i.title];
    path.forEach((name, depth) => {
      let node = level.get(name);
      if (!node) { node = { name, color: depth === 0 ? i.color : '', own: [], kids: new Map() }; level.set(name, node); }
      node.own.push(i);
      level = node.kids;
    });
  }
  const build = (m: Map<string, Raw>): TreeNode[] => [...m.values()]
    .map((n) => ({ name: n.name, color: n.color || n.own[0].color, minutes: unionMin(n.own), children: build(n.kids) }))
    .sort((a, b) => b.minutes - a.minutes);
  return build(root);
}

/** 95 -> "1h 35m", 45 -> "45m", 0 -> "0m" */
export const dur = (min: number): string => {
  const m = Math.round(min);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
};
export const hhmm = (min: number): string => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
