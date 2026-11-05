'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OwedList } from '@/components/money/OwedList';
import type { OwedByLabel, Wallet } from '@/lib/types/db';
import { Amt } from '@/components/money/Amt';


type WalletSummaryProps = {
  wallet: Wallet;
  owed: OwedByLabel[];
};

/** The four wallet numbers (spec section 5); expands to the per-label owed
 *  list with Settle buttons. */
export function WalletSummary({ wallet, owed }: WalletSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] items-start gap-x-4 gap-y-3">
        <Stat label="Cash on hand" value={<Amt value={wallet.cash_on_hand} />} />
        <Stat label="Owed to me" value={<Amt value={wallet.owed_to_me} />} tone="green" />
        <Stat label="I owe" value={<Amt value={wallet.i_owe} />} tone="red" />
        <Stat label="Net" value={<Amt value={wallet.net} />} tone={wallet.net >= 0 ? 'green' : 'red'} />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-3 h-11 px-2 text-xs text-muted-foreground sm:h-7"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        {expanded ? 'Hide who owes what' : 'Show who owes what'}
      </Button>

      {expanded && (
        <div className="mt-2">
          <OwedList owed={owed} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'green' | 'red' }) {
  const color =
    tone === 'green'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'red'
        ? 'text-red-600 dark:text-red-400'
        : 'text-foreground';
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold leading-tight tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export default WalletSummary;
