// Pure maths for importing bank / UPI statements: tidy the extracted rows, guess categories, recognise payments that are
// already recorded (or are the other half of a transfer between your own accounts). No Supabase, no server-only.

export type ImportSource = 'federal' | 'hdfc' | 'phonepe';

/** One line of a statement, as read from the file. */
export type ExtractedRow = {
  date: string;
  /** payee or merchant in plain words ("Zomato"), as best the file shows it */
  name: string;
  /** the full narration exactly as printed ("UPIOUT/502953727799/upflexanarock330754.rzp@/5817") */
  raw: string;
  direction: 'debit' | 'credit';
  amount: number;
  /** running balance after this line, when the statement prints one */
  balance: number | null;
  /** UPI reference (UTR / RRN) or NEFT / ACH reference as printed */
  ref: string | null;
  /** PhonePe: last digits of the bank account the money left from or arrived in */
  paid_by_last4: string | null;
  /** PhonePe "Transfer to XXXXXXXXXX5047": the last digits of the account the money was sent to */
  transfer_to_last4?: string | null;
};

export type ExistingTx = {
  id: string;
  occurred_on: string;
  kind: 'expense' | 'income' | 'settlement';
  amount: number;
  account_id: string | null;
  ext_ref: string | null;
  source: string | null;
  description: string | null;
  category_id: string | null;
  /** deleted, but remembered so an import does not bring it back */
  deleted?: boolean;
};

export type RowStatus = 'new' | 'duplicate' | 'merge' | 'transfer';

export type RowPatch = { ext_ref?: string; description?: string; category?: string };

export type Classified = ExtractedRow & {
  idx: number;
  ref: string | null;
  account_id: string | null;
  category: string | null;
  status: RowStatus;
  reason: string;
  /** the transaction already recorded that this line matches (duplicate / merge / transfer) */
  matchId: string | null;
  /** merge: what to fill in on that transaction */
  patch: RowPatch | null;
  /** transfer: the entries imported earlier that are the two sides of this transfer, so they can be removed */
  counterpartIds: string[];
};

export const IMPORT_SOURCES: Record<ImportSource, { label: string; account: RegExp }> = {
  federal: { label: 'Federal Bank', account: /federal/i },
  hdfc: { label: 'HDFC Bank', account: /hdfc/i },
  phonepe: { label: 'PhonePe', account: /phonepe/i },
};

const MS_DAY = 86_400_000;
const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / MS_DAY);

/** The bank reference without padding: a UPI RRN is 12 digits whether it is printed as "0000355118176741" or "355118176741". */
export function normalizeRef(ref: string | null | undefined, raw = ''): string | null {
  const clean = (ref ?? '').trim();
  if (/^\d+$/.test(clean)) return clean.replace(/^0+/, '') || null;
  if (clean) return clean.toUpperCase();
  const m = /(?:UPI(?:OUT|IN)\/|[-/ ])(\d{12})(?![\d])/.exec(raw);
  return m ? m[1] : null;
}

/** The merchant category code a Federal narration ends with ("…/5812"). */
export function mccOf(raw: string): string | null {
  const m = /\/(\d{4})\s*$/.exec(raw.trim());
  return m ? m[1] : null;
}

const MCC_CATEGORY: Record<string, string> = {
  '5812': 'Food', '5814': 'Food', '5811': 'Food', '5462': 'Food',
  '5411': 'Groceries', '5422': 'Groceries', '5499': 'Groceries', '5441': 'Groceries',
  '5541': 'Transport', '5542': 'Transport', '4121': 'Transport', '4111': 'Transport', '4112': 'Transport', '4131': 'Transport', '4784': 'Transport',
  '4814': 'Bills', '4900': 'Bills', '4899': 'Bills', '4816': 'Bills', '6300': 'Bills',
  '5611': 'Shopping', '5651': 'Shopping', '5691': 'Shopping', '5311': 'Shopping', '5399': 'Shopping', '5732': 'Shopping', '5944': 'Shopping',
  '5815': 'Entertainment', '5816': 'Entertainment', '7832': 'Entertainment', '7922': 'Entertainment', '7993': 'Entertainment',
  '5912': 'Health', '8011': 'Health', '8062': 'Health', '8099': 'Health', '7997': 'Health',
};

const KEYWORDS: [RegExp, string][] = [
  [/zomato|swiggy|domino|pizza|mcdonald|kfc|burger|restaurant|\bcafe\b|tomato|\bchai\b|bakery|biryani|starbucks|eatsure|box8|haldiram|\bfood/i, 'Food'],
  [/blinkit|zepto|bigbasket|instamart|dmart|grofers|grocer|vegetable|kirana|supermarket/i, 'Groceries'],
  [/\buber\b|\bola\b|rapido|\bmetro\b|irctc|redbus|petrol|\bfuel\b|fastag|indian ?oil|hpcl|bpcl|petro\b/i, 'Transport'],
  [/airtel|\bjio\b|vodafone|bsnl|electricity|bescom|recharge|broadband|insurance|bill ?pay|bajaj housing|\bemi\b|\bloan\b|ach d-? ?hdfc bank/i, 'Bills'],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa|powerlook|decathlon|croma/i, 'Shopping'],
  [/bookmyshow|netflix|spotify|hotstar|prime video|\bpvr\b|\binox\b|youtube/i, 'Entertainment'],
  [/pharmacy|apollo|medplus|1mg|pharmeasy|hospital|clinic|\bgym\b|cult\.?fit/i, 'Health'],
  [/\brent\b/i, 'Rent'],
];

/** A category for a payment: known merchant words first, then the card-network merchant code, else Misc. Credits stay uncategorised. */
export function categorize(row: Pick<ExtractedRow, 'name' | 'raw' | 'direction'>, categoryNames: string[]): string | null {
  if (row.direction === 'credit') return null;
  const has = (n: string) => categoryNames.find((c) => c.toLowerCase() === n.toLowerCase()) ?? null;
  const text = `${row.name} ${row.raw}`;
  for (const [re, name] of KEYWORDS) if (re.test(text)) return has(name) ?? has('Misc');
  const mcc = mccOf(row.raw);
  if (mcc && MCC_CATEGORY[mcc]) return has(MCC_CATEGORY[mcc]) ?? has('Misc');
  return has('Misc');
}

const isImported = (e: ExistingTx) => e.source === 'federal' || e.source === 'hdfc' || e.source === 'phonepe';
const kindOf = (d: 'debit' | 'credit') => (d === 'debit' ? 'expense' : 'income');

/**
 * Decide, for every line, whether it is new. A line is "already there" when an existing transaction has the same bank
 * reference; failing that, when a hand-entered one on the same account has the same amount within two days. The same
 * reference on the other side of a different account (money going out of one, in to another) is a transfer between
 * your own accounts, which is not income or spending.
 */
export function classifyRows(
  rows: (ExtractedRow & { account_id: string | null })[],
  existing: ExistingTx[],
  source: ImportSource,
  categoryNames: string[],
  /** last digits of your own accounts: a PhonePe "Transfer to XXXXXXXXXX5047" to one of them is not spending */
  ownLast4: ReadonlySet<string> = new Set(),
): Classified[] {
  const byRef = new Map<string, ExistingTx[]>();
  for (const e of existing) if (e.ext_ref) byRef.set(e.ext_ref, [...(byRef.get(e.ext_ref) ?? []), e]);
  const consumed = new Set<string>();
  const seenRefs = new Set<string>();

  return rows.map((r, idx) => {
    const ref = normalizeRef(r.ref, r.raw);
    const category = categorize(r, categoryNames);
    const base: Classified = { ...r, idx, ref, category, status: 'new', reason: '', matchId: null, patch: null, counterpartIds: [] };

    if (ref) {
      if (seenRefs.has(ref + r.direction)) return { ...base, status: 'duplicate', reason: 'Appears twice in this file' };
      seenRefs.add(ref + r.direction);
    }

    if (r.transfer_to_last4 && ownLast4.has(r.transfer_to_last4)) {
      const both = ref ? (byRef.get(ref) ?? []).filter((e) => isImported(e) && !e.deleted) : [];
      return { ...base, status: 'transfer', matchId: both[0]?.id ?? null, counterpartIds: both.map((e) => e.id), reason: `Sent to your own account ending ${r.transfer_to_last4}` };
    }

    if (ref && byRef.has(ref)) {
      const same = byRef.get(ref)!.find((e) => e.kind === kindOf(r.direction) && !consumed.has(e.id));
      if (same) {
        consumed.add(same.id);
        if (same.deleted) return { ...base, status: 'duplicate', reason: 'You removed this earlier (a transfer, or deleted by you)' };
        if (source === 'phonepe' && (same.source === 'federal' || same.source === 'hdfc') && same.description !== r.name) {
          const patch: RowPatch = { description: r.name };
          if (category) patch.category = category;
          return { ...base, status: 'merge', matchId: same.id, patch, reason: 'On your bank statement already: fills in the merchant name' };
        }
        return { ...base, status: 'duplicate', matchId: same.id, reason: 'Already recorded' };
      }
      const other = byRef.get(ref)!.find((e) => !e.deleted && e.kind !== 'settlement' && e.kind !== kindOf(r.direction) && e.account_id !== r.account_id);
      if (other) return { ...base, status: 'transfer', matchId: other.id, counterpartIds: isImported(other) ? [other.id] : [], reason: 'Money moved between your own accounts' };
    }

    const twin = existing.find((e) =>
      !e.deleted && !consumed.has(e.id) && !e.ext_ref && e.kind === kindOf(r.direction) && e.account_id === r.account_id &&
      Math.abs(Number(e.amount) - r.amount) < 0.005 && Math.abs(dayNumber(e.occurred_on) - dayNumber(r.date)) <= 2);
    if (twin) {
      consumed.add(twin.id);
      return { ...base, status: 'duplicate', matchId: twin.id, patch: ref ? { ext_ref: ref } : null, reason: `Same account, amount and date as "${twin.description ?? 'an entry'}" you entered` };
    }
    return base;
  });
}
