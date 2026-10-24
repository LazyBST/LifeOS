import Link from 'next/link';
import { wallet } from '@/lib/domain/money';
import type { Wallet } from '@/lib/types/db';

async function loadWallet(): Promise<Wallet | null> {
  try {
    return await wallet();
  } catch {
    // money tables may be empty or mid-migration; render an empty state
    return null;
  }
}

function formatINR(amount: number): string {
  const n = Math.round(amount * 100) / 100;
  const s = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}₹${s}`;
}

/** Compact wallet card for the dashboard: four numbers, links to /money
 *  (spec section 6). */
export async function WalletCard() {
  const w = await loadWallet();
  return (
    <Link
      href="/money"
      className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/20"
    >
      <h2 className="mb-2 text-sm font-semibold">Wallet</h2>
      {!w ? (
        <p className="text-sm text-muted-foreground">No money data yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Cash on hand</div>
            <div className="font-medium">{formatINR(w.cash_on_hand)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Net</div>
            <div className={`font-medium ${w.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatINR(w.net)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Owed to me</div>
            <div className="font-medium text-emerald-600 dark:text-emerald-400">{formatINR(w.owed_to_me)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">I owe</div>
            <div className="font-medium text-red-600 dark:text-red-400">{formatINR(w.i_owe)}</div>
          </div>
        </div>
      )}
    </Link>
  );
}

export default WalletCard;
