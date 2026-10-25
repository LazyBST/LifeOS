import type { AccountBalance } from '@/lib/types/db';
import { formatINR } from '@/lib/format';


type AccountsPanelProps = {
  balances: AccountBalance[];
};

/** Each account's current balance (spec section 6). Managing accounts
 *  themselves happens on /settings. */
export function AccountsPanel({ balances }: AccountsPanelProps) {
  return (
    <div>
      {balances.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts yet. Add one in Settings.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {balances.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span className="truncate">{a.name}</span>
              <span className={`font-medium ${a.balance < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatINR(a.balance)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AccountsPanel;
