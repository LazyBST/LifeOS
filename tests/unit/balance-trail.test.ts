import { describe, expect, it } from 'vitest';
import { balanceTrail, type TrailTx } from '@/lib/domain/balance-trail';

const tx = (id: string, kind: TrailTx['kind'], amount: number, account_id: string | null, day: string, to?: string): TrailTx => ({ id, kind, amount, account_id, to_account_id: to ?? null, occurred_on: day, created_at: `${day}T00:00:0${id.length}Z` });

describe('balanceTrail', () => {
  it('shows the balance after each transaction, walking back from today', () => {
    const t = balanceTrail([tx('a', 'income', 100, 'F', '2026-11-01'), tx('b', 'expense', 50, 'F', '2026-11-02')], new Map([['F', 50]]));
    expect(t.get('b')?.account).toBe(50);
    expect(t.get('a')?.account).toBe(100);
  });
  it('keeps accounts apart and handles transfers on both sides', () => {
    const t = balanceTrail([tx('a', 'transfer', 30, 'F', '2026-11-01', 'H'), tx('b', 'expense', 10, 'H', '2026-11-02')], new Map([['F', 70], ['H', 120]]));
    expect(t.get('b')?.account).toBe(120);
    expect(t.get('a')).toEqual({ account: 70, toAccount: 130 });
  });
  it('gives nothing for rows without an account', () => {
    expect(balanceTrail([tx('a', 'expense', 5, null, '2026-11-01')], new Map()).get('a')).toEqual({});
  });
});
