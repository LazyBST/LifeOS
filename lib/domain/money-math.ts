// Pure money maths (spec section 5). No Supabase, no server-only import, so
// the wallet card and chat echoes can share the exact rule the SQL views use.
//
// owed = paid - my_share (expenses); settlements subtract their signed amount.

export type OwedRow = {
  kind: 'expense' | 'income' | 'settlement';
  amount: number;
  my_share?: number | null;
  counterparty?: string | null;
};

/** Owed contribution of a single transaction row (mirrors v_owed_by_label). */
export function owedOf(t: OwedRow): number {
  if (t.kind === 'expense') return t.amount - (t.my_share ?? t.amount);
  if (t.kind === 'settlement') return -t.amount;
  return 0;
}

/** Sum owed per counterparty label; null/empty counterparty groups as 'unspecified'. */
export function owedByLabel(ts: OwedRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of ts) {
    const label = t.counterparty || 'unspecified';
    out[label] = (out[label] ?? 0) + owedOf(t);
  }
  return out;
}

export type Wallet = {
  cash_on_hand: number;
  owed_to_me: number;
  i_owe: number;
  net: number;
};

/** Mirrors v_wallet: cash on hand, owed to me / I owe split from the per-label sums, and net. */
export function walletFrom(accountBalances: number[], owed: Record<string, number>): Wallet {
  const cash_on_hand = accountBalances.reduce((a, b) => a + b, 0);
  let owed_to_me = 0;
  let i_owe = 0;
  let owedTotal = 0;
  for (const v of Object.values(owed)) {
    if (v > 0) owed_to_me += v;
    else i_owe += -v;
    owedTotal += v;
  }
  return { cash_on_hand, owed_to_me, i_owe, net: cash_on_hand + owedTotal };
}

/** My share of an equal split, rounded to 2dp. */
export function splitEqually(amount: number, people: number): number {
  if (people <= 0) return 0;
  return Math.round((amount / people) * 100) / 100;
}
