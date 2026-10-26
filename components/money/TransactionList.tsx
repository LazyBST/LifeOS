import { TransactionTable, type TableTx } from './TransactionTable';

export type TransactionRow = TableTx & { category_name: string | null; account_name: string | null };

/** This month's transactions on the Money page: every cell edits in place. */
export function TransactionList({ transactions, categories, accounts }: { transactions: TransactionRow[]; categories: { id: string; name: string }[]; accounts: { id: string; name: string }[] }) {
  return <TransactionTable transactions={transactions} categories={categories} accounts={accounts} emptyText="No transactions this month." />;
}

export default TransactionList;
