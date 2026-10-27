import { describe, expect, it } from 'vitest';
import { cleanLabels, cleanQuery, shareAfterAmountEdit } from '@/lib/domain/money-filters';

describe('transaction edit rules', () => {
  it('a solo expense keeps following its amount', () => expect(shareAfterAmountEdit('expense', 500, 500, 650)).toBe(650));
  it('a split expense keeps its share, capped at the new amount', () => {
    expect(shareAfterAmountEdit('expense', 600, 200, 900)).toBe(200);
    expect(shareAfterAmountEdit('expense', 600, 400, 300)).toBe(300);
  });
  it('income and settlements have no share', () => { expect(shareAfterAmountEdit('income', 10, null, 20)).toBeNull(); expect(shareAfterAmountEdit('settlement', -10, null, -20)).toBeNull(); });
  it('search text cannot break the filter syntax', () => expect(cleanQuery(' a,b(c)*d%e ')).toBe('a b c  d e'));
});

describe('cleanLabels', () => {
  it('trims, drops blanks and repeats ignoring case', () => {
    expect(cleanLabels([' Luxury ', 'luxury', '', 'Necessity'])).toEqual(['Luxury', 'Necessity']);
  });
});
