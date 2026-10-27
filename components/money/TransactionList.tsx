import type { TxLabel } from '@/lib/types/db';
import { TransactionTable, type TableTx } from './TransactionTable';

export type TransactionRow = TableTx & { category_name: string | null; account_name: string | null };

/** This month's transactions on the Money page: every cell edits in place. */
export function TransactionList({ transactions, categories, accounts, labels }: { transactions: TransactionRow[]; categories: { id: string; name: string }[]; accounts: { id: string; name: string }[]; labels: TxLabel[] }) {
  return <TransactionTable transactions={transactions} categories={categories} accounts={accounts} labels={labels} emptyText="No transactions this month." />;
}

export default TransactionList;
