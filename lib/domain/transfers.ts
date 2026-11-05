import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { istDate, addDays } from '@/lib/time';
import type { Transaction } from '@/lib/types/db';
import { findTransferPairs, isCounterpart, type PairTx, type TransferPair } from './transfers-math';

const COLS = 'id,occurred_on,kind,amount,my_share,account_id,ext_ref,description,source';
const NEEDS_MIGRATION = 'Run supabase/migrations/0027_statement_import.sql in Supabase first.';

async function recent(days: number): Promise<(PairTx & { source: string | null })[]> {
  const from = addDays(istDate(), -days);
  let res = await admin().from('transactions').select(COLS).is('deleted_at', null).in('kind', ['expense', 'income']).gte('occurred_on', from).limit(5000);
  if (res.error) res = await admin().from('transactions').select('id,occurred_on,kind,amount,my_share,account_id,description').is('deleted_at', null).in('kind', ['expense', 'income']).gte('occurred_on', from).limit(5000) as typeof res;
  if (res.error) throw new Error(`transactions: ${res.error.message}`);
  return ((res.data ?? []) as unknown as (PairTx & { source?: string | null })[]).map((t) => ({ ...t, amount: Number(t.amount), my_share: t.my_share == null ? null : Number(t.my_share), ext_ref: t.ext_ref ?? null, source: t.source ?? null }));
}

export type NamedPair = TransferPair & { fromName: string; toName: string };

/** Pairs of entries (an expense on one account, an income of the same amount on another) that look like one transfer. */
export async function listTransferPairs(days = 180): Promise<NamedPair[]> {
  const [txs, acc] = await Promise.all([recent(days), admin().from('accounts').select('id,name')]);
  const name = new Map(((acc.data ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));
  return findTransferPairs(txs).map((p) => ({ ...p, fromName: name.get(p.from) ?? 'account', toName: name.get(p.to) ?? 'account' }));
}

async function load(id: string): Promise<Transaction> {
  const { data, error } = await admin().from('transactions').select('*').eq('id', id).is('deleted_at', null).single();
  if (error || !data) throw new Error('That transaction no longer exists.');
  return data as Transaction;
}

/** Entries that could be the other half of this one, to offer for removal when it is turned into a transfer. */
export async function counterpartsOf(id: string): Promise<{ id: string; description: string | null; occurred_on: string; account_id: string | null; sure: boolean }[]> {
  const t = await load(id);
  if (t.kind !== 'expense' && t.kind !== 'income') return [];
  const near = await recent(400);
  const me: PairTx = { id: t.id, occurred_on: t.occurred_on, kind: t.kind, amount: Number(t.amount), my_share: t.my_share == null ? null : Number(t.my_share), account_id: t.account_id, ext_ref: t.ext_ref ?? null, description: t.description };
  return near.filter((o) => o.id !== id).map((o) => ({ o, c: isCounterpart(me, o) })).filter((x) => x.c.ok)
    .map(({ o, c }) => ({ id: o.id, description: o.description, occurred_on: o.occurred_on, account_id: o.account_id, sure: c.sure }));
}

/**
 * Make an expense or income into a transfer. An expense becomes "from its account to `otherAccountId`"; an income becomes
 * "from `otherAccountId` into its account". `removeId` (an entry for the other half) is deleted so nothing counts twice.
 */
export async function convertToTransfer(id: string, otherAccountId: string, removeId?: string | null): Promise<Transaction> {
  const t = await load(id);
  if (t.kind !== 'expense' && t.kind !== 'income') throw new Error('Only an expense or an income can be turned into a transfer.');
  if (!t.account_id) throw new Error('Choose this transaction\'s account first.');
  if (otherAccountId === t.account_id) throw new Error('A transfer needs two different accounts.');
  const patch = t.kind === 'expense'
    ? { kind: 'transfer', to_account_id: otherAccountId, my_share: null, category_id: null, counterparty: null }
    : { kind: 'transfer', account_id: otherAccountId, to_account_id: t.account_id, category_id: null, counterparty: null };
  if (removeId) {
    const other = await load(removeId);
    const me: PairTx = { id: t.id, occurred_on: t.occurred_on, kind: t.kind, amount: Number(t.amount), my_share: null, account_id: t.account_id, ext_ref: t.ext_ref ?? null, description: null };
    const o: PairTx = { id: other.id, occurred_on: other.occurred_on, kind: other.kind, amount: Number(other.amount), my_share: null, account_id: other.account_id, ext_ref: other.ext_ref ?? null, description: null };
    if (!isCounterpart(me, o).ok) throw new Error('That entry is not the other half of this transfer.');
  }
  const { data, error } = await admin().from('transactions').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(/transactions_(kind|transfer)_check|to_account_id/.test(error.message) ? NEEDS_MIGRATION : `transfer: ${error.message}`);
  if (removeId) await admin().from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', removeId);
  return data as Transaction;
}

/** Undo: treat a transfer as money out of its account (an expense) or money into the other account (an income). */
export async function convertFromTransfer(id: string, as: 'expense' | 'income'): Promise<Transaction> {
  const t = await load(id);
  if (t.kind !== 'transfer') throw new Error('That is not a transfer.');
  const patch = as === 'expense'
    ? { kind: 'expense', to_account_id: null, my_share: Number(t.amount) }
    : { kind: 'income', account_id: t.to_account_id, to_account_id: null, my_share: null };
  const { data, error } = await admin().from('transactions').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(`transfer: ${error.message}`);
  return data as Transaction;
}

/** Turn detected pairs into transfers: the expense becomes the transfer, the matching income is removed. */
export async function mergeTransferPairs(pairs: { expenseId: string; incomeId: string }[]): Promise<number> {
  let done = 0;
  for (const p of pairs) {
    const income = await load(p.incomeId);
    if (!income.account_id) continue;
    await convertToTransfer(p.expenseId, income.account_id, p.incomeId);
    done++;
  }
  return done;
}
