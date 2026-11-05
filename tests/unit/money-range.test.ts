import { describe, expect, it } from 'vitest';
import { RANGE_PRESETS, rangeQuery, resolveRange } from '@/lib/domain/money-range';

const TODAY = '2026-11-06'; // a Friday

describe('the period the dashboard looks at', () => {
  it('knows every quick filter', () => {
    const r = (range: string) => resolveRange({ range }, TODAY);
    expect(r('week')).toMatchObject({ from: '2026-11-02', to: '2026-11-08', days: 7 });
    expect(r('7d')).toMatchObject({ from: '2026-10-31', to: TODAY, days: 7, prevFrom: '2026-10-24', prevTo: '2026-10-30' });
    expect(r('14d')).toMatchObject({ from: '2026-10-24', to: TODAY, days: 14 });
    expect(r('30d')).toMatchObject({ from: '2026-10-08', to: TODAY, days: 30 });
    expect(r('90d').days).toBe(90);
    expect(r('month')).toMatchObject({ from: '2026-11-01', to: '2026-11-30', label: 'November 2026', prevFrom: '2026-10-01', prevTo: '2026-10-31' });
    expect(r('last_month')).toMatchObject({ from: '2026-10-01', to: '2026-10-31', prevFrom: '2026-09-01', prevTo: '2026-09-30' });
    expect(r('quarter')).toMatchObject({ from: '2026-10-01', to: '2026-12-31', label: 'Q4 2026', prevFrom: '2026-07-01', prevTo: '2026-09-30' });
    expect(r('last_quarter')).toMatchObject({ from: '2026-07-01', to: '2026-09-30', label: 'Q3 2026', prevFrom: '2026-04-01', prevTo: '2026-06-30' });
    expect(r('year')).toMatchObject({ from: '2026-01-01', to: '2026-12-31', prevFrom: '2025-01-01', prevTo: '2025-12-31' });
    expect(RANGE_PRESETS.every((p) => r(p.id).key === p.id)).toBe(true);
  });
  it('takes any two dates, either way round, and compares with the same number of days before', () => {
    const r = resolveRange({ from: '2026-10-20', to: '2026-10-10' }, TODAY);
    expect(r).toMatchObject({ key: 'custom', from: '2026-10-10', to: '2026-10-20', days: 11, prevFrom: '2026-09-29', prevTo: '2026-10-09' });
    expect(r.label).toBe('10 Oct – 20 Oct 2026');
  });
  it('falls back to this month, and still understands the old ?month=last link', () => {
    expect(resolveRange({ range: 'nonsense' }, TODAY).key).toBe('month');
    expect(resolveRange({ from: 'x', to: 'y' }, TODAY).key).toBe('month');
    expect(resolveRange({ month: 'last' }, TODAY).key).toBe('last_month');
  });
  it('crosses a year boundary', () => {
    const r = resolveRange({ range: 'last_quarter' }, '2027-01-15');
    expect(r).toMatchObject({ from: '2026-10-01', to: '2026-12-31', prevFrom: '2026-07-01' });
    expect(resolveRange({ range: 'last_month' }, '2027-01-15')).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
  });
  it('gives the query string back', () => {
    expect(rangeQuery({ key: 'quarter', from: 'a', to: 'b' })).toBe('?range=quarter');
    expect(rangeQuery({ key: 'custom', from: '2026-10-10', to: '2026-10-20' })).toBe('?from=2026-10-10&to=2026-10-20');
  });
});
