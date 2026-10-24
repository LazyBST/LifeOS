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
  listTransactions,
  owedByLabel,
  settle,
  spendByCategory,
  wallet,
  type ExpenseInput,
  type IncomeInput,
  type RecordedTransaction,
  type SettleInput,
} from '@/lib/domain/money';
import type { Account, AccountBalance, Category, DateStr, OwedByLabel, Transaction, UUID, Wallet } from '@/lib/types/db';
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
