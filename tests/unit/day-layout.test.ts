import { describe, expect, it } from 'vitest';
import { assignColumns, blockHeights, fmtTime, minutesOfTime } from '@/lib/domain/day-layout';

const at = (r: ReturnType<typeof assignColumns>, id: string) => r.find((p) => p.id === id)!;

describe('day view column layout', () => {
  it('a lone block takes the full width', () => {
    expect(assignColumns([{ id: 'a', start: 540, end: 600 }])).toEqual([{ id: 'a', col: 0, cols: 1 }]);
  });
  it('overlapping blocks sit side by side, sharing the cluster width', () => {
    const r = assignColumns([{ id: 'a', start: 540, end: 630 }, { id: 'b', start: 570, end: 600 }, { id: 'c', start: 600, end: 660 }]);
    expect(at(r, 'a')).toMatchObject({ col: 0, cols: 2 });
    expect(at(r, 'b')).toMatchObject({ col: 1, cols: 2 });
    expect(at(r, 'c')).toMatchObject({ col: 1, cols: 2 }); // starts when b ends, reuses its column
  });
  it('separate clusters do not squeeze each other', () => {
    const r = assignColumns([{ id: 'a', start: 480, end: 540 }, { id: 'b', start: 480, end: 540 }, { id: 'c', start: 720, end: 780 }]);
    expect(at(r, 'a').cols).toBe(2);
    expect(at(r, 'c')).toMatchObject({ col: 0, cols: 1 });
  });
  it('a zero-length block still counts as 5 minutes when checking overlap', () => {
    expect(at(assignColumns([{ id: 'a', start: 600, end: 600 }, { id: 'b', start: 603, end: 650 }]), 'a').cols).toBe(2);
    expect(at(assignColumns([{ id: 'a', start: 600, end: 600 }, { id: 'b', start: 610, end: 650 }]), 'a').cols).toBe(1);
  });
  it('back-to-back blocks stay in sequence in one column', () => {
    // 12:50 and 12:55 five-minute habits, a task ending at 13:00 and another starting at 13:00
    const bs = [{ id: 'h1', start: 770, end: 775 }, { id: 'h2', start: 775, end: 780 }, { id: 't1', start: 720, end: 770 }, { id: 't2', start: 780, end: 840 }];
    const r = assignColumns(bs);
    expect(r.every((p) => p.col === 0 && p.cols === 1)).toBe(true);
  });
  it('a short block is not drawn over the one that follows it', () => {
    const bs = [{ id: 'h1', start: 770, end: 775 }, { id: 'h2', start: 775, end: 780 }, { id: 't2', start: 780, end: 840 }];
    const h = blockHeights(bs, assignColumns(bs), 44);
    expect(h.get('h1')).toBeLessThan(16); // 5 minutes at 44px/h is under 4px, not the 16px minimum
    expect(h.get('t2')).toBeCloseTo(42);
    expect(blockHeights([{ id: 'x', start: 600, end: 605 }], [{ id: 'x', col: 0, cols: 1 }], 44).get('x')).toBe(16); // alone: the minimum
  });
  it('time helpers', () => {
    expect(minutesOfTime('07:30:00')).toBe(450);
    expect(minutesOfTime(null)).toBeNull();
    expect(fmtTime(450)).toBe('07:30');
  });
});
