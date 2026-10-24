import { describe, expect, it } from 'vitest';
import { cellStat, classify, lifeRows, monthRows, rowsFor, weekStart, weeksLived, yearRows } from '@/lib/domain/lifecal-math';

describe('classify: 70% green, 50-70% yellow, <50% red, no data empty', () => {
  it('thresholds', () => {
    expect(classify({ total: 10, done: 7 })).toBe('green');
    expect(classify({ total: 10, done: 10 })).toBe('green');
    expect(classify({ total: 10, done: 6 })).toBe('yellow');
    expect(classify({ total: 10, done: 5 })).toBe('yellow');
    expect(classify({ total: 10, done: 4 })).toBe('red');
    expect(classify({ total: 10, done: 0 })).toBe('red');
  });
  it('no data is empty', () => {
    expect(classify(undefined)).toBe('empty');
    expect(classify({ total: 0, done: 0 })).toBe('empty');
  });
});

describe('cell aggregation', () => {
  const days = { '2026-10-19': { total: 4, done: 4 }, '2026-10-20': { total: 6, done: 0 } };
  const cell = { key: 'w', label: 'w', from: '2026-10-19', to: '2026-10-25' };
  it('sums done and total over the days of the cell', () => {
    expect(cellStat(cell, days, '2026-10-30')).toEqual({ total: 10, done: 4 });
  });
  it('a future cell is empty and today caps a partial one', () => {
    expect(cellStat(cell, days, '2026-10-18')).toBeUndefined();
    expect(cellStat(cell, days, '2026-10-19')).toEqual({ total: 4, done: 4 });
  });
  it('days without data stay empty', () => {
    expect(cellStat({ key: 'd', label: 'd', from: '2026-10-21', to: '2026-10-21' }, days, '2026-10-30')).toBeUndefined();
  });
});

describe('views', () => {
  it('life: 80 rows of 52 weekly dots that tile the whole life', () => {
    const rows = lifeRows('1996-03-15', 80);
    expect(rows).toHaveLength(80);
    expect(rows.every((r) => r.cells.length === 52)).toBe(true);
    expect(rows[0].cells[0].from).toBe('1996-03-15');
    expect(rows[1].cells[0].from).toBe('1997-03-15');
    expect(rows[0].cells[51].to).toBe('1997-03-14'); // last dot absorbs leftover days
  });
  it('year: monthly dots = 12, daily dots = 365/366 grouped in 12 rows', () => {
    expect(yearRows(2026, 'sub')[0].cells).toHaveLength(12);
    expect(yearRows(2026, 'day').reduce((n, r) => n + r.cells.length, 0)).toBe(365);
    expect(yearRows(2028, 'day').reduce((n, r) => n + r.cells.length, 0)).toBe(366);
  });
  it('month: daily dots and weekly dots clipped to the month', () => {
    expect(monthRows(2026, 10, 'day')[0].cells).toHaveLength(31);
    const weeks = monthRows(2026, 10, 'sub')[0].cells;
    expect(weeks[0].from).toBe('2026-10-01');
    expect(weeks[weeks.length - 1].to).toBe('2026-10-31');
    expect(weeks).toHaveLength(5);
  });
  it('week: Monday to Sunday', () => {
    expect(weekStart('2026-10-24')).toBe('2026-10-19');
    const r = rowsFor('week', 'day', '2026-10-24', null, 80)[0].cells;
    expect(r.map((c) => c.from)[0]).toBe('2026-10-19');
    expect(r).toHaveLength(7);
  });
  it('weeks lived', () => {
    expect(weeksLived('2026-10-03', '2026-10-24')).toBe(3);
  });
});
