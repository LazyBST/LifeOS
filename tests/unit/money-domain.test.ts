// The pure helpers in lib/domain/money.ts (spec section 5). The Supabase-backed
// functions in that module are covered by tests/sql against the real views.
import { describe, expect, it } from 'vitest';
import { formatINR, guessCategoryName } from '@/lib/domain/money';

describe('guessCategoryName', () => {
  it('infers a category from the description', () => {
    expect(guessCategoryName('Lunch with brother')).toBe('Food');
    expect(guessCategoryName('weekly groceries')).toBe('Groceries');
    expect(guessCategoryName('Uber to office')).toBe('Transport');
    expect(guessCategoryName('October rent')).toBe('Rent');
    expect(guessCategoryName('electricity bill')).toBe('Bills');
  });

  it('falls back to Misc', () => {
    expect(guessCategoryName('something odd')).toBe('Misc');
    expect(guessCategoryName(null)).toBe('Misc');
    expect(guessCategoryName('')).toBe('Misc');
  });
});

describe('formatINR', () => {
  it('uses Indian digit grouping and drops empty decimals', () => {
    expect(formatINR(200)).toBe('₹200');
    expect(formatINR(1200)).toBe('₹1,200');
    expect(formatINR(125000)).toBe('₹1,25,000');
  });

  it('keeps two decimals when they matter and signs negatives', () => {
    expect(formatINR(199.5)).toBe('₹199.50');
    expect(formatINR(-200)).toBe('-₹200');
    expect(formatINR(0)).toBe('₹0');
  });
});
