import { describe, expect, it } from 'vitest';
import { findTransferPairs, isCounterpart, type PairTx } from '@/lib/domain/transfers-math';

const tx = (o: Partial<PairTx>): PairTx => ({ id: 'a', occurred_on: '2026-11-04', kind: 'expense', amount: 10000, my_share: null, account_id: 'hdfc', ext_ref: null, description: null, ...o });

describe('finding transfers', () => {
  it('pairs an expense with an income of the same amount on another account', () => {
    const p = findTransferPairs([tx({ id: 'e' }), tx({ id: 'i', kind: 'income', account_id: 'fed', occurred_on: '2026-11-05' })]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ expenseId: 'e', incomeId: 'i', from: 'hdfc', to: 'fed', confidence: 'likely' });
  });
  it('is sure when both sides carry the same bank reference', () => {
    const p = findTransferPairs([tx({ id: 'e', ext_ref: '355118176741' }), tx({ id: 'i', kind: 'income', account_id: 'fed', ext_ref: '355118176741', occurred_on: '2026-11-04' })]);
    expect(p[0].confidence).toBe('sure');
  });
  it('does not pair the same account, another amount, a distant date or a split expense', () => {
    expect(findTransferPairs([tx({ id: 'e' }), tx({ id: 'i', kind: 'income', account_id: 'hdfc' })])).toEqual([]);
    expect(findTransferPairs([tx({ id: 'e' }), tx({ id: 'i', kind: 'income', account_id: 'fed', amount: 9999 })])).toEqual([]);
    expect(findTransferPairs([tx({ id: 'e' }), tx({ id: 'i', kind: 'income', account_id: 'fed', occurred_on: '2026-11-09' })])).toEqual([]);
    expect(findTransferPairs([tx({ id: 'e', my_share: 5000 }), tx({ id: 'i', kind: 'income', account_id: 'fed' })])).toEqual([]);
  });
  it('uses each entry once: two equal transfers pair up one to one, the sure match first', () => {
    const p = findTransferPairs([
      tx({ id: 'e1', ext_ref: 'X' }), tx({ id: 'e2', ext_ref: 'Y' }),
      tx({ id: 'i2', kind: 'income', account_id: 'fed', ext_ref: 'Y' }), tx({ id: 'i1', kind: 'income', account_id: 'fed', ext_ref: 'X' }),
    ]);
    expect(p.map((x) => `${x.expenseId}-${x.incomeId}`).sort()).toEqual(['e1-i1', 'e2-i2']);
  });
  it('knows a counterpart when asked directly', () => {
    expect(isCounterpart(tx({ id: 'e' }), tx({ id: 'i', kind: 'income', account_id: 'fed' })).ok).toBe(true);
    expect(isCounterpart(tx({ id: 'e' }), tx({ id: 'i', kind: 'expense', account_id: 'fed' })).ok).toBe(false);
  });
});
