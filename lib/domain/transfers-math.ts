// Pure: spotting the two halves of a transfer between your own accounts (one account paid out, another received).

export type PairTx = {
  id: string;
  occurred_on: string;
  kind: 'expense' | 'income' | 'settlement' | 'transfer';
  amount: number;
  my_share: number | null;
  account_id: string | null;
  ext_ref: string | null;
  description: string | null;
};

export type TransferPair = {
  expenseId: string;
  incomeId: string;
  amount: number;
  date: string;
  /** the account the money left, and the account it reached */
  from: string;
  to: string;
  /** sure: the same bank reference on both sides. likely: same amount within two days. */
  confidence: 'sure' | 'likely';
  reason: string;
  expenseDescription: string | null;
  incomeDescription: string | null;
};

const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const whole = (t: PairTx) => t.kind === 'expense' && (t.my_share === null || Math.abs(Number(t.my_share) - Number(t.amount)) < 0.005);

/** Can `b` be the other half of `a` (opposite direction, another account, same amount, a day or two apart)? */
export function isCounterpart(a: PairTx, b: PairTx, maxDays = 2): { ok: boolean; sure: boolean } {
  const opposite = (a.kind === 'expense' && b.kind === 'income') || (a.kind === 'income' && b.kind === 'expense');
  if (!opposite || !a.account_id || !b.account_id || a.account_id === b.account_id) return { ok: false, sure: false };
  if (Math.abs(Number(a.amount) - Number(b.amount)) > 0.005) return { ok: false, sure: false };
  const sure = !!a.ext_ref && a.ext_ref === b.ext_ref;
  return { ok: sure || Math.abs(dayNumber(a.occurred_on) - dayNumber(b.occurred_on)) <= maxDays, sure };
}

/** Every expense that has a matching income elsewhere, each used once; the surest matches first. */
export function findTransferPairs(txs: PairTx[], maxDays = 2): TransferPair[] {
  const expenses = txs.filter((t) => whole(t) && t.account_id);
  const incomes = txs.filter((t) => t.kind === 'income' && t.account_id);
  const cands: { e: PairTx; i: PairTx; sure: boolean; gap: number }[] = [];
  for (const e of expenses) for (const i of incomes) {
    const c = isCounterpart(e, i, maxDays);
    if (c.ok) cands.push({ e, i, sure: c.sure, gap: Math.abs(dayNumber(e.occurred_on) - dayNumber(i.occurred_on)) });
  }
  cands.sort((a, b) => Number(b.sure) - Number(a.sure) || a.gap - b.gap);
  const usedE = new Set<string>(), usedI = new Set<string>();
  const out: TransferPair[] = [];
  for (const c of cands) {
    if (usedE.has(c.e.id) || usedI.has(c.i.id)) continue;
    usedE.add(c.e.id); usedI.add(c.i.id);
    out.push({
      expenseId: c.e.id, incomeId: c.i.id, amount: Number(c.e.amount), date: c.e.occurred_on,
      from: c.e.account_id!, to: c.i.account_id!, confidence: c.sure ? 'sure' : 'likely',
      reason: c.sure ? 'Same bank reference on both sides' : `Same amount, ${c.gap === 0 ? 'same day' : `${c.gap} day${c.gap === 1 ? '' : 's'} apart`}`,
      expenseDescription: c.e.description, incomeDescription: c.i.description,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
