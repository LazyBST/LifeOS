import Link from 'next/link';
import { SetPageContext } from '@/components/chat/page-context';
import { WalletSummary } from '@/components/money/WalletSummary';
import { SpendByCategory } from '@/components/money/SpendByCategory';
import { AddTransactionForm } from '@/components/money/AddTransactionForm';
import { AccountsPanel } from '@/components/money/AccountsPanel';
import { TransactionList, type TransactionRow } from '@/components/money/TransactionList';
import {
  accountBalances,
  listAccounts,
  listCategories,
  listTransactions,
  owedByLabel,
  spendByCategory,
  wallet,
} from '@/lib/domain/money';
import { istDate } from '@/lib/time';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthRange(offset: number) {
  const today = istDate();
  const [y, m] = today.split('-').map(Number);
  let year = y;
  let month = m - 1 + offset; // 0-based
  while (month < 0) {
    month += 12;
    year -= 1;
  }
  while (month > 11) {
    month -= 12;
    year += 1;
  }
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to, label: `${MONTH_NAMES[month]} ${year}` };
}

type MoneyPageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function MoneyPage({ searchParams }: MoneyPageProps) {
  const sp = await searchParams;
  const offset = sp.month === 'last' ? -1 : 0;
  const { from, to, label } = monthRange(offset);

  const [w, owed, balances, accounts, categories, spend, transactions] = await Promise.all([
    wallet(),
    owedByLabel(),
    accountBalances(),
    listAccounts(),
    listCategories(),
    spendByCategory(from, to),
    listTransactions({ from, to, limit: 500 }),
  ]);

  const activeAccountIds = new Set(accounts.map((a) => a.id));
  const visibleBalances = balances.filter((b) => activeAccountIds.has(b.id));

  const catById = new Map(categories.map((c) => [c.id, c.name]));
  const accById = new Map(accounts.map((a) => [a.id, a.name]));
  const rows: TransactionRow[] = transactions.map((t) => ({
    ...t,
    category_name: t.category_id ? catById.get(t.category_id) ?? null : null,
    account_name: t.account_id ? accById.get(t.account_id) ?? null : null,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <SetPageContext ctx={{ route: '/money', entity_type: 'none' }} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Money</h1>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-sm">
          <Link
            href="/money?month=this"
            className={`rounded-md px-3 py-1.5 ${offset === 0 ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
          >
            This month
          </Link>
          <Link
            href="/money?month=last"
            className={`rounded-md px-3 py-1.5 ${offset === -1 ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
          >
            Last month
          </Link>
        </div>
      </div>

      <WalletSummary wallet={w} owed={owed} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AddTransactionForm categories={categories} accounts={accounts} />
        </div>
        <AccountsPanel balances={visibleBalances} />
      </div>

      <SpendByCategory rows={spend} monthLabel={label} />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Transactions — {label}</h2>
        <TransactionList transactions={rows} />
      </section>
    </div>
  );
}
