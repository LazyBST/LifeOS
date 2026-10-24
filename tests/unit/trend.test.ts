import { describe, expect, it } from 'vitest';
import { bucketIndex, lastWeeks, linearForecast } from '@/lib/domain/trend-math';

describe('trend maths', () => {
  it('lastWeeks ends with the current Monday', () => {
    const w = lastWeeks('2026-10-24', 3);
    expect(w).toHaveLength(3);
    expect(w[2]).toBe('2026-10-19');
    expect(w[0]).toBe('2026-10-05');
  });
  it('a rising series keeps rising, a flat one stays flat, and it never goes negative', () => {
    expect(linearForecast([1, 2, 3, 4], 2)).toEqual([5, 6]);
    expect(linearForecast([3, 3, 3], 2)).toEqual([3, 3]);
    expect(linearForecast([6, 4, 2], 3)).toEqual([0, 0, 0]);
    expect(linearForecast([], 2)).toEqual([0, 0]);
  });
  it('buckets a date into its week', () => {
    const w = lastWeeks('2026-10-24', 3);
    expect(bucketIndex(w, '2026-10-23')).toBe(2);
    expect(bucketIndex(w, '2026-10-06')).toBe(0);
    expect(bucketIndex(w, '2026-09-01')).toBe(-1);
  });
});
