// The balance an account had right after each transaction: start from today's balance and walk back through the
// ledger, newest first, undoing each transaction as we go. Pure, so it is easy to test.
export type TrailTx = { id: string; kind: 'expense' | 'income' | 'settlement' | 'transfer'; amount: number; account_id: string | null; to_account_id?: string | null; occurred_on: string; created_at: string };
export type BalanceAfter = { account?: number; toAccount?: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Newest first: the same order the transaction list uses. */
export const newestFirst = (a: TrailTx, b: TrailTx) =>
  a.occurred_on !== b.occurred_on ? (a.occurred_on < b.occurred_on ? 1 : -1) : a.created_at !== b.created_at ? (a.created_at < b.created_at ? 1 : -1) : a.id < b.id ? -1 : 1;

/** `current` is each account's balance now. Returns, per transaction id, the balance of its account (and of the
 *  receiving account for a transfer) right after it happened. */
export function balanceTrail(txs: TrailTx[], current: Map<string, number>): Map<string, BalanceAfter> {
  const running = new Map(current);
  const out = new Map<string, BalanceAfter>();
  for (const t of [...txs].sort(newestFirst)) {
    const amt = Number(t.amount);
    const entry: BalanceAfter = {};
    if (t.account_id && running.has(t.account_id)) {
      entry.account = round2(running.get(t.account_id)!);
      running.set(t.account_id, running.get(t.account_id)! - (t.kind === 'expense' || t.kind === 'transfer' ? -amt : amt));
    }
    if (t.kind === 'transfer' && t.to_account_id && running.has(t.to_account_id)) {
      entry.toAccount = round2(running.get(t.to_account_id)!);
      running.set(t.to_account_id, running.get(t.to_account_id)! - amt);
    }
    out.set(t.id, entry);
  }
  return out;
}
