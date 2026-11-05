'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import {
  accountBalances,
  addExpense,
  addIncome,
  deleteTransaction,
  listAccounts,
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  spendByLabel,
  listTransactions,
  owedByLabel,
  settle,
  spendByCategory,
  searchTransactions,
  transactionTotals,
  counterpartyLabels,
  updateTransaction,
  type TxRow,
  wallet,
  type ExpenseInput,
  type IncomeInput,
  type RecordedTransaction,
  type SettleInput,
} from '@/lib/domain/money';
import type { TxFilters, TxPatch } from '@/lib/domain/money-filters';
import type { Account, AccountBalance, Category, DateStr, OwedByLabel, Transaction, TxLabel, UUID, Wallet } from '@/lib/types/db';
import { convertFromTransfer, convertToTransfer, counterpartsOf, listTransferPairs, mergeTransferPairs, type NamedPair } from '@/lib/domain/transfers';
import { commitImport, previewImport, type CommitItem, type CommitMerge, type CommitResult, type ImportPreview } from '@/lib/domain/statement-import';
import type { ExtractedRow, ImportSource } from '@/lib/domain/statement-import-math';
import { type ActionResult, run } from './_result';

export async function walletAction(): Promise<ActionResult<Wallet>> {
  return run(async () => {
    await requireUser();
    return wallet();
  });
}

export async function owedByLabelAction(): Promise<ActionResult<OwedByLabel[]>> {
  return run(async () => {
    await requireUser();
    return owedByLabel();
  });
}

export async function accountBalancesAction(): Promise<ActionResult<AccountBalance[]>> {
  return run(async () => {
    await requireUser();
    return accountBalances();
  });
}

export async function listTransactionsAction(opts: {
  from?: DateStr;
  to?: DateStr;
  limit?: number;
  counterparty?: string;
} = {}): Promise<ActionResult<Transaction[]>> {
  return run(async () => {
    await requireUser();
    return listTransactions(opts);
  });
}

export async function addExpenseAction(input: ExpenseInput): Promise<ActionResult<RecordedTransaction>> {
  return run(async () => {
    await requireUser();
    const t = await addExpense(input);
    revalidatePath('/', 'layout');
    return t;
  });
}

export async function addIncomeAction(input: IncomeInput): Promise<ActionResult<RecordedTransaction>> {
  return run(async () => {
    await requireUser();
    const t = await addIncome(input);
    revalidatePath('/', 'layout');
    return t;
  });
}

export async function settleAction(input: SettleInput): Promise<ActionResult<RecordedTransaction>> {
  return run(async () => {
    await requireUser();
    const t = await settle(input);
    revalidatePath('/', 'layout');
    return t;
  });
}

export async function deleteTransactionAction(id: UUID): Promise<ActionResult<Transaction>> {
  return run(async () => {
    await requireUser();
    const t = await deleteTransaction(id);
    revalidatePath('/', 'layout');
    return t;
  });
}

export async function listAccountsAction(): Promise<ActionResult<Account[]>> {
  return run(async () => {
    await requireUser();
    return listAccounts();
  });
}

export async function listCategoriesAction(): Promise<ActionResult<Category[]>> {
  return run(async () => {
    await requireUser();
    return listCategories();
  });
}

export async function spendByCategoryAction(
  from: DateStr,
  to: DateStr,
): Promise<ActionResult<{ category: string; amount: number }[]>> {
  return run(async () => {
    await requireUser();
    return spendByCategory(from, to);
  });
}

export async function updateTransactionAction(id: UUID, patch: TxPatch): Promise<ActionResult<Transaction>> {
  return run(async () => {
    await requireUser();
    const t = await updateTransaction(id, patch);
    revalidatePath('/', 'layout');
    return t;
  });
}

export async function searchTransactionsAction(filters: TxFilters, page = 0): Promise<ActionResult<{ rows: TxRow[]; total: number; owedFilter: boolean; totals: { count: number; spent: number; income: number; owed: number } | null; counterparties: string[] }>> {
  return run(async () => {
    await requireUser();
    const [r, totals, counterparties] = await Promise.all([
      searchTransactions(filters, page),
      page === 0 ? transactionTotals(filters).catch(() => null) : Promise.resolve(null),
      page === 0 ? counterpartyLabels().catch(() => []) : Promise.resolve([] as string[]),
    ]);
    return { ...r, totals, counterparties };
  });
}

export async function listLabelsAction(): Promise<ActionResult<TxLabel[]>> {
  return run(async () => { await requireUser(); return listLabels(); });
}

export async function createCategoryAction(name: string): Promise<ActionResult<Category>> {
  return run(async () => { await requireUser(); const c = await createCategory(name); revalidatePath('/', 'layout'); return c; });
}

export async function renameCategoryAction(id: UUID, name: string): Promise<ActionResult<Category>> {
  return run(async () => { await requireUser(); const c = await renameCategory(id, name); revalidatePath('/', 'layout'); return c; });
}

export async function deleteCategoryAction(id: UUID): Promise<ActionResult<{ transactions: number }>> {
  return run(async () => { await requireUser(); const r = await deleteCategory(id); revalidatePath('/', 'layout'); return r; });
}

export async function createLabelAction(name: string, color?: string): Promise<ActionResult<TxLabel>> {
  return run(async () => { await requireUser(); const l = await createLabel(name, color); revalidatePath('/', 'layout'); return l; });
}

export async function updateLabelAction(id: UUID, patch: { name?: string; color?: string }): Promise<ActionResult<TxLabel>> {
  return run(async () => { await requireUser(); const l = await updateLabel(id, patch); revalidatePath('/', 'layout'); return l; });
}

export async function deleteLabelAction(id: UUID): Promise<ActionResult<{ transactions: number }>> {
  return run(async () => { await requireUser(); const r = await deleteLabel(id); revalidatePath('/', 'layout'); return r; });
}

export async function spendByLabelAction(from: DateStr, to: DateStr): Promise<ActionResult<{ label: string; amount: number; count: number }[]>> {
  return run(async () => { await requireUser(); return spendByLabel(from, to); });
}

// ---- statement import --------------------------------------------------------------------------------------

export async function previewImportAction(source: ImportSource, rows: ExtractedRow[], accountId: string | null, accountFor: Record<string, string>, accountLast4: string | null): Promise<ActionResult<ImportPreview>> {
  return run(async () => { await requireUser(); return previewImport(source, rows, accountId, accountFor, accountLast4); });
}

export async function commitImportAction(source: ImportSource, items: CommitItem[], merges: CommitMerge[], removeIds: string[], newAccountName?: string, accountLast4: string | null = null): Promise<ActionResult<CommitResult>> {
  return run(async () => {
    await requireUser();
    const r = await commitImport(source, items, merges, removeIds, newAccountName, accountLast4);
    revalidatePath('/', 'layout');
    return r;
  });
}

// ---- transfers between your own accounts -------------------------------------------------------------------

export async function convertToTransferAction(id: UUID, otherAccountId: UUID, removeId?: UUID | null): Promise<ActionResult<Transaction>> {
  return run(async () => { await requireUser(); const t = await convertToTransfer(id, otherAccountId, removeId); revalidatePath('/', 'layout'); return t; });
}

export async function convertFromTransferAction(id: UUID, as: 'expense' | 'income'): Promise<ActionResult<Transaction>> {
  return run(async () => { await requireUser(); const t = await convertFromTransfer(id, as); revalidatePath('/', 'layout'); return t; });
}

export async function transferCounterpartsAction(id: UUID): Promise<ActionResult<{ id: string; description: string | null; occurred_on: string; account_id: string | null; sure: boolean }[]>> {
  return run(async () => { await requireUser(); return counterpartsOf(id); });
}

export async function findTransferPairsAction(): Promise<ActionResult<NamedPair[]>> {
  return run(async () => { await requireUser(); return listTransferPairs(); });
}

export async function mergeTransferPairsAction(pairs: { expenseId: string; incomeId: string }[]): Promise<ActionResult<number>> {
  return run(async () => { await requireUser(); const n = await mergeTransferPairs(pairs); revalidatePath('/', 'layout'); return n; });
}
