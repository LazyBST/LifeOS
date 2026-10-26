import { describe, expect, it } from 'vitest';
import { dur, rollup, timeUse, unionMin, type Interval } from '@/lib/domain/timeuse-math';

const iv = (id: string, start: number, end: number, group = id): Interval => ({ id, title: id, group, color: '#000', start, end });

describe('time use', () => {
  it('counts the gaps nobody claims as wasted', () => {
    const r = timeUse([iv('a', 540, 600), iv('b', 720, 780)]);
    expect(r.usedMin).toBe(120);
    expect(r.wastedMin).toBe(1320);
    expect(r.gaps).toEqual([{ start: 0, end: 540 }, { start: 600, end: 720 }, { start: 780, end: 1440 }]);
    expect(r.longestGapMin).toBe(660);
  });
  it('treats an overlap as time spent on both: 1 hour of work with a 15 minute lunch inside it', () => {
    const r = timeUse([iv('work', 900, 960), iv('lunch', 930, 945)]);
    const work = r.items.find((i) => i.id === 'work')!, lunch = r.items.find((i) => i.id === 'lunch')!;
    expect(work.minutes).toBe(60);
    expect(work.alone).toBe(45);
    expect(work.shared).toBe(15);
    expect(lunch.minutes).toBe(15);
    expect(lunch.alone).toBe(0);
    expect(lunch.with).toEqual(['work']);
    expect(r.usedMin).toBe(60); // the hour is used once...
    expect(r.overlapMin).toBe(15); // ...of which 15 minutes held two things
    expect(r.aloneMin).toBe(45);
  });
  it('back-to-back blocks do not overlap', () => {
    const r = timeUse([iv('a', 780, 840), iv('b', 840, 900)]);
    expect(r.overlapMin).toBe(0);
    expect(r.usedMin).toBe(120);
  });
  it('clips to the window and ignores blocks outside it', () => {
    const r = timeUse([iv('early', 300, 420), iv('late', 1400, 1500), iv('in', 600, 660)], { start: 360, end: 1380 });
    expect(r.windowMin).toBe(1020);
    expect(r.items.map((i) => [i.id, i.minutes])).toEqual([['early', 60], ['in', 60]]);
    expect(r.usedMin).toBe(120);
  });
  it('counts a group once even when its own items overlap, and splits alone from shared', () => {
    const r = timeUse([iv('t1', 600, 660, 'Business'), iv('t2', 630, 690, 'Business'), iv('lunch', 660, 700, 'Health')]);
    const biz = r.groups.find((g) => g.group === 'Business')!, health = r.groups.find((g) => g.group === 'Health')!;
    expect(biz.minutes).toBe(90); // 10:00 to 11:30, not 120
    expect(health.minutes).toBe(40);
    expect(health.shared).toBe(30);
    expect(health.alone).toBe(10);
  });
  it('formats durations', () => { expect(dur(95)).toBe('1h 35m'); expect(dur(120)).toBe('2h'); expect(dur(45)).toBe('45m'); });
});

describe('rolling time up the hierarchy', () => {
  const at = (id: string, start: number, end: number, path: string[]): Interval => ({ id, title: path[path.length - 1], group: path[0], color: '#000', start, end, path });
  it('adds a project up from its tasks and an area up from its projects', () => {
    const tree = rollup([
      at('1', 600, 660, ['Business', 'Deal goal', 'Deal project', 'Deal task']),
      at('2', 700, 730, ['Business', 'Deal goal', 'Deal project', 'Send mail']),
      at('3', 800, 830, ['Business', 'Other goal', 'Site', 'Fix header']),
      at('4', 900, 960, ['Health', 'Run']),
    ]);
    expect(tree.map((n) => [n.name, n.minutes])).toEqual([['Business', 120], ['Health', 60]]);
    const biz = tree[0];
    expect(biz.children.map((n) => [n.name, n.minutes])).toEqual([['Deal goal', 90], ['Other goal', 30]]);
    expect(biz.children[0].children[0]).toMatchObject({ name: 'Deal project', minutes: 90 });
    expect(biz.children[0].children[0].children.map((n) => [n.name, n.minutes])).toEqual([['Deal task', 60], ['Send mail', 30]]);
  });
  it('counts overlapped minutes once inside a node, but fully for each task', () => {
    const tree = rollup([at('1', 600, 660, ['Business', 'P', 'A']), at('2', 630, 690, ['Business', 'P', 'B'])]);
    expect(tree[0].minutes).toBe(90);
    expect(tree[0].children[0].children.map((n) => n.minutes)).toEqual([60, 60]);
  });
  it('unions intervals', () => expect(unionMin([{ start: 0, end: 60 }, { start: 30, end: 90 }, { start: 120, end: 150 }])).toBe(120));
});
