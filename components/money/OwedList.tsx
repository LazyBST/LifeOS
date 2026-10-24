'use client';

import { Button } from '@/components/ui/button';
import type { OwedByLabel } from '@/lib/types/db';
import { formatINR } from '@/lib/format';


/** Opens the chat panel with a prefilled message. The chat panel may not
 *  listen for the prefill event yet (another worker owns that); either way
 *  it must still open without throwing. */
function openChatWithPrefill(text: string) {
  try {
    window.dispatchEvent(new CustomEvent('lifeos:chat:open'));
    window.dispatchEvent(new CustomEvent('lifeos:chat:prefill', { detail: { text } }));
  } catch {
    // no-op: chat panel not mounted or event unsupported
  }
}

type OwedListProps = {
  owed: OwedByLabel[];
};

/** Per-label owed amounts with a Settle button each (spec section 5). */
export function OwedList({ owed }: OwedListProps) {
  if (owed.length === 0) {
    return <p className="p-2 text-sm text-muted-foreground">Nobody owes anything right now.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {owed.map((row) => {
        const positive = row.owed > 0;
        const amount = Math.abs(row.owed);
        return (
          <li
            key={row.label}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-2"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium capitalize">{row.label}</span>
              <span className={`text-xs ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {positive ? `owes you ${formatINR(amount)}` : `you owe ${formatINR(amount)}`}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 shrink-0 sm:h-7"
              onClick={() =>
                openChatWithPrefill(
                  positive
                    ? `${row.label} paid me back ${formatINR(amount)} on `
                    : `I paid ${row.label} ${formatINR(amount)}`,
                )
              }
            >
              Settle
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export default OwedList;
