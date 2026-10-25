'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OwedList } from '@/components/money/OwedList';
import type { OwedByLabel, Wallet } from '@/lib/types/db';
import { formatINR } from '@/lib/format';


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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Cash on hand" value={formatINR(wallet.cash_on_hand)} />
        <Stat label="Owed to me" value={formatINR(wallet.owed_to_me)} tone="green" />
        <Stat label="I owe" value={formatINR(wallet.i_owe)} tone="red" />
        <Stat label="Net" value={formatINR(wallet.net)} tone={wallet.net >= 0 ? 'green' : 'red'} />
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const color =
    tone === 'green'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'red'
        ? 'text-red-600 dark:text-red-400'
        : 'text-foreground';
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

export default WalletSummary;
