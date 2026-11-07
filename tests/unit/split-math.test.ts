import { describe, expect, it } from 'vitest';
import { splitProblem, splitRemainder, splitShares } from '@/lib/domain/split-math';

describe('split math', () => {
  it('accepts parts that add up exactly, any number of them', () => {
    expect(splitProblem(1200, [900, 200, 100])).toBeNull();
    expect(splitProblem(0.3, [0.1, 0.2])).toBeNull(); // floating point does not get in the way
  });
  it('says what is wrong', () => {
    expect(splitProblem(100, [100])).toMatch(/at least two/);
    expect(splitProblem(100, [60, 30])).toMatch(/10 is still unassigned/);
    expect(splitProblem(100, [60, 50])).toMatch(/10 over/);
    expect(splitProblem(100, [100, 0])).toMatch(/above zero/);
    expect(splitProblem(100, [NaN, 100])).toMatch(/above zero/);
  });
  it('shows what is left', () => {
    expect(splitRemainder(100, [30, 20])).toBe(50);
    expect(splitRemainder(100, [70, 50])).toBe(-20);
  });
  it('keeps my share in proportion and adds back to it', () => {
    const s = splitShares(300, 100, [100, 100, 100]);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
    expect(splitShares(300, 300, [200, 100])).toEqual([200, 100]);
  });
});
