import Link from 'next/link';
import { SetPageContext } from '@/components/chat/page-context';
import { TransactionsExplorer } from '@/components/money/TransactionsExplorer';
import { listAccounts, listCategories } from '@/lib/domain/money';

/** All transactions with filters. Every cell is editable in place. */
export default async function TransactionsPage() {
  const [categories, accounts] = await Promise.all([listCategories(), listAccounts()]);
  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <SetPageContext ctx={{ route: '/money/transactions', entity_type: 'none' }} />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <Link href="/money" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">← Money</Link>
      </div>
      <TransactionsExplorer categories={categories.map((c) => ({ id: c.id, name: c.name }))} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
    </div>
  );
}
