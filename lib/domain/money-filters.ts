// Client-safe: the filters of the transactions page and the rules for editing one.
import type { TxKind } from '@/lib/types/db';

export type TxFilters = {
  q?: string;
  kinds?: TxKind[];
  /** category ids; 'none' means uncategorised */
  categoryIds?: string[];
  accountIds?: string[];
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  counterparty?: string;
  /** to_me: others owe me · i_owe: I owe others */
  owed?: 'to_me' | 'i_owe';
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
};

export type TxPatch = {
  occurred_on?: string;
  description?: string | null;
  category_id?: string | null;
  account_id?: string | null;
  amount?: number;
  my_share?: number | null;
  counterparty?: string | null;
  note?: string | null;
};

/** Remove the characters that would break a PostgREST `or(...)` filter. */
export const cleanQuery = (q: string): string => q.replace(/[,()*%\\]/g, ' ').trim();

/**
 * What the amount fields should become when `amount` is edited. A solo expense (my share = the whole amount) keeps
 * following the amount; a split expense keeps its share, but never more than the amount.
 */
export function shareAfterAmountEdit(kind: TxKind, oldAmount: number, oldShare: number | null, newAmount: number): number | null {
  if (kind !== 'expense') return null;
  const share = oldShare ?? oldAmount;
  return Math.abs(share - oldAmount) < 0.005 ? newAmount : Math.min(share, newAmount);
}
