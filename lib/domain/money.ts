import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { istDate } from '@/lib/time';
export { formatINR } from '@/lib/format';
import type {
  Account,
  AccountBalance,
  Category,
  DateStr,
  OwedByLabel,
  Transaction,
  TxLabel,
  UUID,
  Wallet,
} from '@/lib/types/db';

// ---- accounts and categories ----------------------------------------------

export async function listAccounts(includeArchived = false): Promise<Account[]> {
  let q = admin().from('accounts').select('*');
  if (!includeArchived) q = q.is('archived_at', null);
  const { data, error } = await q.order('name');
  if (error) throw new Error(`accounts: ${error.message}`);
  return data as Account[];
}

export async function defaultAccount(): Promise<Account | null> {
  const accounts = await listAccounts();
  return accounts.find((a) => a.is_default) ?? accounts[0] ?? null;
}

/** Loose name match for the agent ("gpay", "HDFC"). */
export async function accountByName(name?: string | null): Promise<Account | null> {
  if (!name) return null;
  const accounts = await listAccounts();
  const n = name.trim().toLowerCase();
  return (
    accounts.find((a) => a.name.toLowerCase() === n) ??
    accounts.find((a) => a.name.toLowerCase().startsWith(n)) ??
    accounts.find((a) => a.name.toLowerCase().includes(n)) ??
    null
  );
}

export async function createAccount(input: { name: string; opening_balance?: number; is_default?: boolean }): Promise<Account> {
  if (input.is_default) await admin().from('accounts').update({ is_default: false }).neq('name', '');
  const { data, error } = await admin()
    .from('accounts')
    .insert({
      name: input.name,
      opening_balance: input.opening_balance ?? 0,
      is_default: input.is_default ?? false,
    })
    .select('*')
    .single();
  if (error) throw new Error(`account_create: ${error.message}`);
  return data as Account;
}

export async function archiveAccount(id: UUID): Promise<void> {
  await admin().from('accounts').update({ archived_at: new Date().toISOString() }).eq('id', id);
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await admin().from('categories').select('*').order('name');
  if (error) throw new Error(`categories: ${error.message}`);
  return data as Category[];
}

export async function categoryByName(name?: string | null): Promise<Category | null> {
  if (!name) return null;
  const cats = await listCategories();
  const n = name.trim().toLowerCase();
  return cats.find((c) => c.name.toLowerCase() === n) ?? cats.find((c) => c.name.toLowerCase().startsWith(n)) ?? null;
}

export async function createCategory(name: string): Promise<Category> {
  const clean = name.trim();
  if (!clean) throw new Error('Give the category a name.');
  const { data, error } = await admin().from('categories').insert({ name: clean }).select('*').single();
  if (error) throw new Error(error.code === '23505' ? `There is already a category called “${clean}”.` : `category_create: ${error.message}`);
  return data as Category;
}

export async function renameCategory(id: UUID, name: string): Promise<Category> {
  const clean = name.trim();
  if (!clean) throw new Error('Give the category a name.');
  const { data, error } = await admin().from('categories').update({ name: clean }).eq('id', id).select('*').single();
  if (error) throw new Error(error.code === '23505' ? `There is already a category called “${clean}”.` : `category_rename: ${error.message}`);
  return data as Category;
}

/** Transactions and scheduled payments in the category become uncategorised; its budget goes with it. */
export async function deleteCategory(id: UUID): Promise<{ transactions: number }> {
  const { count } = await admin().from('transactions').select('id', { count: 'exact', head: true }).eq('category_id', id).is('deleted_at', null);
  const a = await admin().from('transactions').update({ category_id: null }).eq('category_id', id);
  if (a.error) throw new Error(`category_delete: ${a.error.message}`);
  const b = await admin().from('scheduled_payments').update({ category_id: null }).eq('category_id', id);
  if (b.error && b.error.code !== '42P01') throw new Error(`category_delete: ${b.error.message}`);
  const { error } = await admin().from('categories').delete().eq('id', id);
  if (error) throw new Error(`category_delete: ${error.message}`);
  return { transactions: count ?? 0 };
}

// ---- labels (migration 0024) ------------------------------------------------------------------------------

/** The label list; empty before the migration has been run. */
export async function listLabels(): Promise<TxLabel[]> {
  const { data, error } = await admin().from('transaction_labels').select('*').order('created_at').order('name');
  if (error) return [];
  return data as TxLabel[];
}

export async function createLabel(name: string, color?: string): Promise<TxLabel> {
  const clean = name.trim();
  if (!clean) throw new Error('Give the label a name.');
  const { data, error } = await admin().from('transaction_labels').insert({ name: clean, ...(color ? { color } : {}) }).select('*').single();
  if (error) throw new Error(error.code === '23505' ? `There is already a label called “${clean}”.` : error.code === '42P01' ? 'Run migration 0024_transaction_labels.sql in Supabase first.' : `label_create: ${error.message}`);
  return data as TxLabel;
}

export async function updateLabel(id: UUID, patch: { name?: string; color?: string }): Promise<TxLabel> {
  const { data: cur } = await admin().from('transaction_labels').select('*').eq('id', id).single();
  if (!cur) throw new Error('That label no longer exists.');
  const old = (cur as TxLabel).name;
  const row: Record<string, string> = {};
  if (patch.color) row.color = patch.color;
  if (patch.name !== undefined) { if (!patch.name.trim()) throw new Error('Give the label a name.'); row.name = patch.name.trim(); }
  const { data, error } = await admin().from('transaction_labels').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(error.code === '23505' ? `There is already a label called “${row.name}”.` : `label_update: ${error.message}`);
  if (row.name && row.name !== old) await replaceLabelOnTransactions(old, row.name);
  return data as TxLabel;
}

/** Remove the label everywhere it was used. */
export async function deleteLabel(id: UUID): Promise<{ transactions: number }> {
  const { data: cur } = await admin().from('transaction_labels').select('*').eq('id', id).single();
  if (!cur) return { transactions: 0 };
  const n = await replaceLabelOnTransactions((cur as TxLabel).name, null);
  const { error } = await admin().from('transaction_labels').delete().eq('id', id);
  if (error) throw new Error(`label_delete: ${error.message}`);
  return { transactions: n };
}

async function replaceLabelOnTransactions(from: string, to: string | null): Promise<number> {
  const { data } = await admin().from('transactions').select('id,labels').contains('labels', [from]).limit(5000);
  const rows = (data ?? []) as { id: string; labels: string[] }[];
  await Promise.all(rows.map((r) => {
    const next = r.labels.flatMap((l) => (l === from ? (to && !r.labels.includes(to) ? [to] : []) : [l]));
    return admin().from('transactions').update({ labels: next }).eq('id', r.id);
  }));
  return rows.length;
}

/** My share of this period's expenses by label; a transaction with two labels counts under both. */
export async function spendByLabel(from: DateStr, to: DateStr): Promise<{ label: string; amount: number; count: number }[]> {
  const { data, error } = await admin().from('transactions').select('amount,my_share,labels').eq('kind', 'expense').is('deleted_at', null).gte('occurred_on', from).lte('occurred_on', to).limit(5000);
  if (error) return [];
  const out = new Map<string, { amount: number; count: number }>();
  for (const r of (data ?? []) as { amount: number; my_share: number | null; labels: string[] | null }[]) {
    const v = Number(r.my_share ?? r.amount);
    for (const l of r.labels?.length ? r.labels : ['Unlabelled']) {
      const e = out.get(l) ?? { amount: 0, count: 0 };
      e.amount += v; e.count += 1; out.set(l, e);
    }
  }
  return [...out].map(([label, e]) => ({ label, ...e })).sort((a, b) => b.amount - a.amount);
}

/** Keyword guess from the description; falls back to Misc (spec section 5). */
const CATEGORY_HINTS: [RegExp, string][] = [
  [/lunch|dinner|breakfast|food|restaurant|cafe|coffee|snack|chai|zomato|swiggy/i, 'Food'],
  [/grocer|vegetable|supermarket|bigbasket|blinkit|zepto/i, 'Groceries'],
  [/uber|ola|taxi|cab|bus|train|metro|petrol|fuel|auto/i, 'Transport'],
  [/rent/i, 'Rent'],
  [/bill|electricity|water|internet|recharge|phone|broadband/i, 'Bills'],
  [/amazon|flipkart|clothes|shoes|shopping|myntra/i, 'Shopping'],
  [/medicine|doctor|pharmacy|hospital|gym|health/i, 'Health'],
  [/movie|netflix|spotify|game|concert|entertainment/i, 'Entertainment'],
  [/family|mom|dad|brother|sister|parents/i, 'Family'],
];

export function guessCategoryName(description?: string | null): string {
  if (!description) return 'Misc';
  for (const [re, name] of CATEGORY_HINTS) if (re.test(description)) return name;
  return 'Misc';
}

// ---- transactions ----------------------------------------------------------

export type ExpenseInput = {
  amount: number;
  description?: string | null;
  my_share?: number | null;
  counterparty?: string | null;
  category?: string | null;
  category_id?: UUID | null;
  account?: string | null;
  account_id?: UUID | null;
  date?: DateStr;
  note?: string | null;
  raw_text?: string | null;
  labels?: string[];
};

export type IncomeInput = Omit<ExpenseInput, 'my_share' | 'counterparty'>;

export type SettleInput = {
  amount: number;
  /** 'received' makes the amount positive, 'paid' makes it negative */
  direction: 'received' | 'paid';
  counterparty: string;
  account?: string | null;
  account_id?: UUID | null;
  date?: DateStr;
  description?: string | null;
  raw_text?: string | null;
};

async function resolveIds(input: {
  category?: string | null;
  category_id?: UUID | null;
  account?: string | null;
  account_id?: UUID | null;
  description?: string | null;
}): Promise<{ category_id: UUID | null; account_id: UUID | null; category_name: string | null; account_name: string | null }> {
  const cat =
    input.category_id
      ? (await listCategories()).find((c) => c.id === input.category_id) ?? null
      : (await categoryByName(input.category)) ?? (await categoryByName(guessCategoryName(input.description)));
  const acc = input.account_id
    ? (await listAccounts(true)).find((a) => a.id === input.account_id) ?? null
    : (await accountByName(input.account)) ?? (await defaultAccount());
  return {
    category_id: cat?.id ?? null,
    account_id: acc?.id ?? null,
    category_name: cat?.name ?? null,
    account_name: acc?.name ?? null,
  };
}

export type RecordedTransaction = Transaction & {
  category_name: string | null;
  account_name: string | null;
  /** paid minus my share: positive means others owe him */
  owed: number;
};

export async function addExpense(input: ExpenseInput): Promise<RecordedTransaction> {
  const { category_id, account_id, category_name, account_name } = await resolveIds(input);
  const my_share = input.my_share ?? input.amount;
  const row = {
    occurred_on: input.date ?? istDate(),
    kind: 'expense' as const,
    description: input.description ?? null,
    category_id,
    account_id,
    amount: input.amount,
    my_share,
    counterparty: input.counterparty ?? null,
    note: input.note ?? null,
    raw_text: input.raw_text ?? null,
    ...(input.labels?.length ? { labels: cleanLabels(input.labels) } : {}),
  };
  const { data, error } = await admin().from('transactions').insert(row).select('*').single();
  if (error) throw new Error(`expense_add: ${error.message}`);
  const t = data as Transaction;
  return { ...t, category_name, account_name, owed: Number(t.amount) - Number(t.my_share ?? t.amount) };
}

export async function addIncome(input: IncomeInput): Promise<RecordedTransaction> {
  const { category_id, account_id, category_name, account_name } = await resolveIds(input);
  const row = {
    occurred_on: input.date ?? istDate(),
    kind: 'income' as const,
    description: input.description ?? null,
    category_id,
    account_id,
    amount: input.amount,
    my_share: null,
    note: input.note ?? null,
    raw_text: input.raw_text ?? null,
    ...(input.labels?.length ? { labels: cleanLabels(input.labels) } : {}),
  };
  const { data, error } = await admin().from('transactions').insert(row).select('*').single();
  if (error) throw new Error(`income_add: ${error.message}`);
  const t = data as Transaction;
  return { ...t, category_name, account_name, owed: 0 };
}

/**
 * A settlement moves cash without being spending: positive when he received
 * money, negative when he paid it (spec section 5).
 */
export async function settle(input: SettleInput): Promise<RecordedTransaction> {
  const { account_id, account_name } = await resolveIds(input);
  const signed = input.direction === 'received' ? Math.abs(input.amount) : -Math.abs(input.amount);
  const row = {
    occurred_on: input.date ?? istDate(),
    kind: 'settlement' as const,
    description: input.description ?? `Settled with ${input.counterparty}`,
    category_id: null,
    account_id,
    amount: signed,
    my_share: null,
    counterparty: input.counterparty,
    raw_text: input.raw_text ?? null,
  };
  const { data, error } = await admin().from('transactions').insert(row).select('*').single();
  if (error) throw new Error(`settle: ${error.message}`);
  const t = data as Transaction;
  return { ...t, category_name: null, account_name, owed: -signed };
}

export async function listTransactions(opts: { from?: DateStr; to?: DateStr; limit?: number; counterparty?: string } = {}): Promise<Transaction[]> {
  let q = admin().from('transactions').select('*').is('deleted_at', null);
  if (opts.from) q = q.gte('occurred_on', opts.from);
  if (opts.to) q = q.lte('occurred_on', opts.to);
  if (opts.counterparty) q = q.eq('counterparty', opts.counterparty);
  const { data, error } = await q.order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(opts.limit ?? 200);
  if (error) throw new Error(`transactions: ${error.message}`);
  return data as Transaction[];
}

export async function deleteTransaction(id: UUID): Promise<Transaction> {
  const { data, error } = await admin()
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`transaction_delete: ${error.message}`);
  return data as Transaction;
}

export async function restoreTransaction(id: UUID): Promise<void> {
  await admin().from('transactions').update({ deleted_at: null }).eq('id', id);
}

// ---- views -----------------------------------------------------------------

export async function owedByLabel(): Promise<OwedByLabel[]> {
  const { data, error } = await admin().from('v_owed_by_label').select('*');
  if (error) throw new Error(`v_owed_by_label: ${error.message}`);
  return ((data ?? []) as OwedByLabel[])
    .map((r) => ({ ...r, owed: Number(r.owed) }))
    .filter((r) => Math.abs(r.owed) >= 0.01)
    .sort((a, b) => b.owed - a.owed);
}

export async function accountBalances(): Promise<AccountBalance[]> {
  const { data, error } = await admin().from('v_account_balances').select('*');
  if (error) throw new Error(`v_account_balances: ${error.message}`);
  return ((data ?? []) as AccountBalance[]).map((r) => ({ ...r, balance: Number(r.balance) }));
}

export async function wallet(): Promise<Wallet> {
  const { data, error } = await admin().from('v_wallet').select('*').maybeSingle();
  if (error) throw new Error(`v_wallet: ${error.message}`);
  const w = (data ?? { cash_on_hand: 0, owed_to_me: 0, i_owe: 0, net: 0 }) as Wallet;
  return {
    cash_on_hand: Number(w.cash_on_hand),
    owed_to_me: Number(w.owed_to_me),
    i_owe: Number(w.i_owe),
    net: Number(w.net),
  };
}

export type SpendRow = { occurred_on: DateStr; category_id: UUID | null; amount: number };

/** Analytics use my share, never the cash paid (spec section 5). */
export async function mySpending(from: DateStr, to: DateStr): Promise<SpendRow[]> {
  const { data, error } = await admin()
    .from('v_my_spending')
    .select('*')
    .gte('occurred_on', from)
    .lte('occurred_on', to);
  if (error) throw new Error(`v_my_spending: ${error.message}`);
  return ((data ?? []) as SpendRow[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function spendByCategory(from: DateStr, to: DateStr): Promise<{ category: string; amount: number }[]> {
  const [rows, cats] = await Promise.all([mySpending(from, to), listCategories()]);
  const byId = new Map(cats.map((c) => [c.id, c.name]));
  const out = new Map<string, number>();
  for (const r of rows) {
    const name = (r.category_id && byId.get(r.category_id)) || 'Uncategorised';
    out.set(name, (out.get(name) ?? 0) + r.amount);
  }
  return [...out].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

// ---- editing and searching transactions -------------------------------------------------------------------

import { cleanLabels, cleanQuery, shareAfterAmountEdit, type TxFilters, type TxPatch } from './money-filters';

/** Edit one transaction in place. Keeps the rules the database checks: shares only on expenses, signed settlements. */
export async function updateTransaction(id: UUID, patch: TxPatch): Promise<Transaction> {
  const { data: cur, error: e0 } = await admin().from('transactions').select('*').eq('id', id).is('deleted_at', null).single();
  if (e0 || !cur) throw new Error('That transaction no longer exists.');
  const t = cur as Transaction;
  const row: Record<string, unknown> = {};
  if (patch.occurred_on !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.occurred_on)) throw new Error('Pick a valid date.');
    row.occurred_on = patch.occurred_on;
  }
  if (patch.description !== undefined) row.description = patch.description?.trim() || null;
  if (patch.note !== undefined) row.note = patch.note?.trim() || null;
  if (patch.counterparty !== undefined) row.counterparty = patch.counterparty?.trim() || null;
  if (patch.account_id !== undefined) row.account_id = patch.account_id;
  if (patch.labels !== undefined) row.labels = cleanLabels(patch.labels);
  if (patch.category_id !== undefined) row.category_id = t.kind === 'settlement' ? null : patch.category_id;

  if (patch.amount !== undefined) {
    if (!Number.isFinite(patch.amount)) throw new Error('Enter a valid amount.');
    if (t.kind === 'settlement') {
      if (patch.amount === 0) throw new Error('A settlement cannot be zero.');
      row.amount = patch.amount;
    } else {
      if (patch.amount < 0) throw new Error('The amount cannot be negative.');
      row.amount = patch.amount;
      if (t.kind === 'expense' && patch.my_share === undefined) row.my_share = shareAfterAmountEdit('expense', Number(t.amount), t.my_share == null ? null : Number(t.my_share), patch.amount);
    }
  }
  if (patch.my_share !== undefined) {
    if (t.kind !== 'expense') throw new Error('Only expenses have a share.');
    const amount = Number(row.amount ?? t.amount);
    if (patch.my_share === null || !(patch.my_share >= 0)) throw new Error('Enter your share.');
    if (patch.my_share > amount) throw new Error('Your share cannot be more than the amount.');
    row.my_share = patch.my_share;
  }
  if (Object.keys(row).length === 0) return t;
  const { data, error } = await admin().from('transactions').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(`transaction_update: ${error.message}`);
  return data as Transaction;
}

/** The filters as a query on the owed view (or the table when migration 0021 has not been run). */
function applyFilters(q: any, f: TxFilters, view: boolean) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (f.kinds?.length) q = q.in('kind', f.kinds);
  if (f.accountIds?.length) q = q.in('account_id', f.accountIds);
  if (f.categoryIds?.length) {
    const ids = f.categoryIds.filter((c) => c !== 'none');
    q = f.categoryIds.includes('none') ? q.or(`category_id.is.null${ids.length ? `,category_id.in.(${ids.join(',')})` : ''}`) : q.in('category_id', ids);
  }
  if (f.labels?.length) q = q.overlaps('labels', f.labels);
  if (f.from) q = q.gte('occurred_on', f.from);
  if (f.to) q = q.lte('occurred_on', f.to);
  if (f.counterparty) q = q.eq('counterparty', f.counterparty);
  const text = f.q ? cleanQuery(f.q) : '';
  if (text) q = q.or(`description.ilike.%${text}%,note.ilike.%${text}%,counterparty.ilike.%${text}%`);
  // the size of the amount, whichever way a settlement points
  const lo = f.minAmount, hi = f.maxAmount;
  if (lo !== undefined && hi !== undefined) q = q.or(`and(amount.gte.${lo},amount.lte.${hi}),and(amount.lte.${-lo},amount.gte.${-hi})`);
  else if (lo !== undefined) q = q.or(`amount.gte.${lo},amount.lte.${-lo}`);
  else if (hi !== undefined) q = q.lte('amount', hi).gte('amount', -hi);
  if (view && f.owed === 'to_me') q = q.gt('owed', 0);
  if (view && f.owed === 'i_owe') q = q.lt('owed', 0);
  const sort = f.sort ?? 'date_desc';
  q = sort === 'date_asc' ? q.order('occurred_on', { ascending: true }).order('created_at', { ascending: true })
    : sort === 'amount_desc' ? q.order('amount', { ascending: false })
    : sort === 'amount_asc' ? q.order('amount', { ascending: true })
    : q.order('occurred_on', { ascending: false }).order('created_at', { ascending: false });
  return q;
}

export type TxRow = Transaction & { owed: number };

export async function searchTransactions(f: TxFilters, page = 0, size = 100): Promise<{ rows: TxRow[]; total: number; owedFilter: boolean }> {
  const run = async (view: boolean) => {
    const base = admin().from(view ? 'v_transactions_owed' : 'transactions').select('*', { count: 'exact' });
    const q = applyFilters(view ? base : base.is('deleted_at', null), f, view);
    return q.range(page * size, page * size + size - 1);
  };
  let view = true;
  let res = await run(true);
  if (res.error) { view = false; res = await run(false); }
  if (res.error) throw new Error(`transactions: ${res.error.message}`);
  const rows = ((res.data ?? []) as (Transaction & { owed?: number })[]).map((t) => ({
    ...t, owed: t.owed != null ? Number(t.owed) : t.kind === 'expense' ? Number(t.amount) - Number(t.my_share ?? t.amount) : t.kind === 'settlement' ? -Number(t.amount) : 0,
  }));
  return { rows, total: res.count ?? rows.length, owedFilter: view };
}

/** What the filtered set adds up to: spending (my share), income, and what is owed overall. Reads up to 5000 rows. */
export async function transactionTotals(f: TxFilters): Promise<{ count: number; spent: number; income: number; owed: number }> {
  let spent = 0, income = 0, owed = 0, count = 0;
  for (let page = 0; page < 5; page++) {
    const { rows, total } = await searchTransactions(f, page, 1000);
    for (const t of rows) {
      if (t.kind === 'expense') spent += Number(t.my_share ?? t.amount);
      else if (t.kind === 'income') income += Number(t.amount);
      owed += t.owed;
    }
    count = total;
    if ((page + 1) * 1000 >= total) break;
  }
  return { count, spent, income, owed };
}

export async function counterpartyLabels(): Promise<string[]> {
  const { data } = await admin().from('transactions').select('counterparty').is('deleted_at', null).not('counterparty', 'is', null).limit(1000);
  return [...new Set(((data ?? []) as { counterparty: string }[]).map((r) => r.counterparty))].sort();
}
