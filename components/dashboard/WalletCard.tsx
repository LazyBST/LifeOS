import { admin } from '@/lib/supabase/admin';

type WalletRow = { cash_on_hand: number; owed_to_me: number; i_owe: number; net: number };

async function loadWallet(): Promise<WalletRow | null> {
  try {
    const { data, error } = await admin().from('v_wallet').select('*').maybeSingle();
    if (error || !data) return null;
    return data as WalletRow;
  } catch {
    // money tables are Part 3; render an empty state until they exist
    return null;
  }
}

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
}

/** Four numbers: cash on hand, owed to me (green), I owe (red), net (spec section 5). */
export async function WalletCard() {
  const wallet = await loadWallet();
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold">Wallet</h2>
      {!wallet ? (
        <p className="text-sm text-muted-foreground">No money data yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Cash on hand</div>
            <div className="font-medium">{money(wallet.cash_on_hand)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Net</div>
            <div className={`font-medium ${wallet.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {money(wallet.net)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Owed to me</div>
            <div className="font-medium text-emerald-600 dark:text-emerald-400">{money(wallet.owed_to_me)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">I owe</div>
            <div className="font-medium text-red-600 dark:text-red-400">{money(wallet.i_owe)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WalletCard;
