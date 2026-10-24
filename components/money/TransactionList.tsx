'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { deleteTransactionAction } from '@/app/actions/money';
import { formatDate } from '@/lib/time';
import type { Transaction } from '@/lib/types/db';
import { formatINR } from '@/lib/format';


export type TransactionRow = Transaction & {
  category_name: string | null;
  account_name: string | null;
};

type TransactionListProps = {
  transactions: TransactionRow[];
};

/** This month's transactions: description, category, account, amount, my
 *  share, counterparty, owed (green/red) and a delete button. */
export function TransactionList({ transactions }: TransactionListProps) {
  const router = useRouter();
  const [rows, setRows] = useState(transactions);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await deleteTransactionAction(id);
    setDeletingId(null);
    if (!res.ok) {
      toast.error(res.error || 'Could not delete transaction');
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success('Transaction deleted');
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No transactions this month.</p>;
  }

  return (
    <div className="rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Account</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">My share</TableHead>
            <TableHead>Counterparty</TableHead>
            <TableHead className="text-right">Owed</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => {
            const owed = t.kind === 'expense' ? Number(t.amount) - Number(t.my_share ?? t.amount) : t.kind === 'settlement' ? -Number(t.amount) : 0;
            return (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(t.occurred_on)}</TableCell>
                <TableCell className="max-w-48 truncate">{t.description || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-muted-foreground">{t.category_name ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{t.account_name ?? '—'}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatINR(Number(t.amount))}</TableCell>
                <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                  {t.my_share != null ? formatINR(Number(t.my_share)) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground capitalize">{t.counterparty ?? '—'}</TableCell>
                <TableCell
                  className={`text-right whitespace-nowrap font-medium ${
                    owed === 0 ? 'text-muted-foreground' : owed > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {owed === 0 ? '—' : formatINR(owed)}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-11 text-muted-foreground hover:text-destructive sm:size-7"
                    disabled={deletingId === t.id}
                    onClick={() => handleDelete(t.id)}
                    aria-label="Delete transaction"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default TransactionList;
