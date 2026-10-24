import { describe, expect, it } from 'vitest';
import { assignColumns, fmtTime, minutesOfTime } from '@/lib/domain/day-layout';

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
  it('very short blocks still occupy a minimum length when checking overlap', () => {
    const r = assignColumns([{ id: 'a', start: 600, end: 600 }, { id: 'b', start: 610, end: 650 }]);
    expect(at(r, 'a').cols).toBe(2);
  });
  it('time helpers', () => {
    expect(minutesOfTime('07:30:00')).toBe(450);
    expect(minutesOfTime(null)).toBeNull();
    expect(fmtTime(450)).toBe('07:30');
  });
});
