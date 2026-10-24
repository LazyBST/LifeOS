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
  const { data, error } = await admin().from('categories').insert({ name }).select('*').single();
  if (error) throw new Error(`category_create: ${error.message}`);
  return data as Category;
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
