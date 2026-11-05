import { describe, expect, it } from 'vitest';
import { formatINRCompact } from '@/lib/format';

describe('short amounts for tight spaces', () => {
  it('uses K, L and Cr, drops trailing zeros and keeps up to two decimals', () => {
    expect(formatINRCompact(22000)).toBe('₹22K');
    expect(formatINRCompact(22484)).toBe('₹22.48K');
    expect(formatINRCompact(417023.19)).toBe('₹4.17L');
    expect(formatINRCompact(212758.36)).toBe('₹2.13L');
    expect(formatINRCompact(100000)).toBe('₹1L');
    expect(formatINRCompact(21305331)).toBe('₹2.13Cr');
    expect(formatINRCompact(1000)).toBe('₹1K');
  });
  it('leaves small amounts alone and keeps the sign', () => {
    expect(formatINRCompact(294.95)).toBe('₹294.95');
    expect(formatINRCompact(0)).toBe('₹0');
    expect(formatINRCompact(-212758.36)).toBe('-₹2.13L');
    expect(formatINRCompact(-999)).toBe('-₹999');
  });
  it('rolls over at a unit boundary instead of showing 100K', () => {
    expect(formatINRCompact(99999.6)).toBe('₹1L');
    expect(formatINRCompact(9999999)).toBe('₹1Cr');
  });
});
