import { describe, it, expect } from 'vitest';
import { owedOf, owedByLabel, walletFrom, splitEqually, type OwedRow } from '@/lib/domain/money-math';

// Spec section 5 worked examples table.
describe('owedOf (spec section 5 worked examples)', () => {
  it('spent 200 with brother, half his -> +100, brother owes him', () => {
    expect(owedOf({ kind: 'expense', amount: 200, my_share: 100 })).toBe(100);
  });

  it('friend paid 600 for 3 people -> paid 0, share 200, owed -200', () => {
    expect(owedOf({ kind: 'expense', amount: 0, my_share: 200 })).toBe(-200);
  });

  it('solo lunch, paid 150 share 150 -> 0', () => {
    expect(owedOf({ kind: 'expense', amount: 150, my_share: 150 })).toBe(0);
  });

  it('settlement subtracts its signed amount', () => {
    expect(owedOf({ kind: 'settlement', amount: 100 })).toBe(-100);
    expect(owedOf({ kind: 'settlement', amount: -200 })).toBe(200);
  });

  it('income contributes nothing to owed', () => {
    expect(owedOf({ kind: 'income', amount: 500 })).toBe(0);
  });
});

describe('owedByLabel', () => {
  it('groups by counterparty and sums owed, using "unspecified" for null/empty', () => {
    const rows: OwedRow[] = [
      { kind: 'expense', amount: 200, my_share: 100, counterparty: 'brother' },
      { kind: 'expense', amount: 0, my_share: 200, counterparty: 'friend' },
      { kind: 'expense', amount: 150, my_share: 150, counterparty: null },
    ];
    expect(owedByLabel(rows)).toEqual({ brother: 100, friend: -200, unspecified: 0 });
  });

  it('a settlement of +100 against brother brings that label to 0', () => {
    const rows: OwedRow[] = [
      { kind: 'expense', amount: 200, my_share: 100, counterparty: 'brother' },
      { kind: 'settlement', amount: 100, counterparty: 'brother' },
    ];
    expect(owedByLabel(rows)).toEqual({ brother: 0 });
  });
});

describe('walletFrom', () => {
  it('computes the wallet numbers for the worked-example set', () => {
    // brother +100 owed to me, friend -200 I owe, cash from accounts 800.
    const owed = { brother: 100, friend: -200 };
    const wallet = walletFrom([800], owed);
    expect(wallet).toEqual({
      cash_on_hand: 800,
      owed_to_me: 100,
      i_owe: 200,
      net: 700, // 800 + 100 - 200
    });
  });

  it('sums multiple accounts and handles no owed labels', () => {
    const wallet = walletFrom([500, 300], {});
    expect(wallet).toEqual({ cash_on_hand: 800, owed_to_me: 0, i_owe: 0, net: 800 });
  });
});

describe('splitEqually', () => {
  it('rounds the per-person share to 2dp', () => {
    expect(splitEqually(600, 3)).toBe(200);
    expect(splitEqually(100, 3)).toBe(33.33);
    expect(splitEqually(10, 4)).toBe(2.5);
  });

  it('returns 0 for zero or negative people', () => {
    expect(splitEqually(100, 0)).toBe(0);
    expect(splitEqually(100, -1)).toBe(0);
  });
});
