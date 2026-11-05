import { getDocumentProxy } from 'unpdf';
import { admin } from '@/lib/supabase/admin';
import { istDate } from '@/lib/time';
import { listAccounts, listCategories } from './money';
import {
  IMPORT_SOURCES, classifyRows, normalizeRef,
  type Classified, type ExistingTx, type ExtractedRow, type ImportSource,
} from './statement-import-math';
import { parseStatement, StatementError, type PdfItem } from './statement-pdf';

export { StatementError };

/** Every piece of text on every page, with its position. Statements are laid out in fixed columns, so position is what reads them. */
async function pdfItems(data: Uint8Array): Promise<PdfItem[]> {
  let pdf;
  try { pdf = await getDocumentProxy(data); } catch (e) {
    if (/password/i.test(String((e as Error)?.name) + String((e as Error)?.message))) throw new StatementError('This PDF is password protected. Unlock it first, then import it.');
    throw new StatementError('That file is not a readable PDF.');
  }
  const out: PdfItem[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const tc = await (await pdf.getPage(n)).getTextContent();
    for (const it of tc.items as { str: string; transform: number[]; width: number }[]) {
      if (typeof it.str === 'string' && it.str.trim()) out.push({ page: n, x: Math.round(it.transform[4]), r: Math.round(it.transform[4] + it.width), y: Math.round(it.transform[5]), s: it.str.trim() });
    }
  }
  return out;
}

export type ReadStatement = { rows: ExtractedRow[]; accountLast4: string | null; summary: string };

/** Read one statement PDF: the lines, the account it belongs to, and proof that the lines add up. */
export async function readStatementPdf(source: ImportSource, data: Uint8Array): Promise<ReadStatement> {
  const items = await pdfItems(data);
  if (!items.length) throw new StatementError('This PDF has no text in it (a scan or a photo). Download the statement as a PDF from the bank or the app.');
  const { rows, accountLast4, summary } = parseStatement(source, items);
  return { rows, accountLast4, summary };
}

export type ImportPreview = {
  rows: Classified[];
  accounts: { id: string; name: string }[];
  categories: string[];
  /** which account each PhonePe "paid by" number maps to, when known */
  defaultAccountId: string | null;
  /** PhonePe "paid by" digits that match one of your accounts already */
  knownLast4: Record<string, string>;
};

/**
 * Tidy the extracted lines, resolve each one's account and compare with what is already recorded.
 * `accountFor` maps a PhonePe "paid by" number to an account id; `accountId` is the account for the whole file.
 */
export async function previewImport(source: ImportSource, rows: ExtractedRow[], accountId: string | null, accountFor: Record<string, string> = {}, accountLast4: string | null = null): Promise<ImportPreview> {
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  // which account is this file for: the one that already carries its number, else one named like the bank
  const byNumber = accountLast4 ? accounts.find((a) => a.number_last4 === accountLast4)?.id ?? null : null;
  const guess = byNumber ?? accounts.find((a) => IMPORT_SOURCES[source].account.test(a.name))?.id ?? null;
  const fileAccount = accountId ?? guess;
  const knownLast4: Record<string, string> = {};
  for (const a of accounts) if (a.number_last4) knownLast4[a.number_last4] = a.id;
  const withAccount = rows.map((r) => ({
    ...r,
    account_id: source === 'phonepe' ? (r.paid_by_last4 && (accountFor[r.paid_by_last4] || knownLast4[r.paid_by_last4])) || fileAccount : fileAccount,
  }));
  const dates = withAccount.map((r) => r.date).sort();
  let existing: ExistingTx[] = [];
  if (dates.length) {
    const from = new Date(Date.parse(`${dates[0]}T00:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await admin()
      .from('transactions')
      .select('id,occurred_on,kind,amount,account_id,ext_ref,source,description,category_id,deleted_at')
      .gte('occurred_on', from).lte('occurred_on', to).limit(5000);
    // before migration 0027 the reference columns do not exist: fall back to amount / date / account matching only
    if (error && /ext_ref|source/.test(error.message)) {
      const r = await admin().from('transactions').select('id,occurred_on,kind,amount,account_id,description,category_id').is('deleted_at', null).gte('occurred_on', from).lte('occurred_on', to).limit(5000);
      existing = ((r.data ?? []) as Omit<ExistingTx, 'ext_ref' | 'source'>[]).map((e) => ({ ...e, ext_ref: null, source: null, amount: Number(e.amount) }));
    } else if (error) throw new Error(error.message);
    else {
      // deleted entries an import created are remembered too, so removing a transfer (or deleting a line) sticks
      existing = ((data ?? []) as (ExistingTx & { deleted_at: string | null })[])
        .filter((e) => !e.deleted_at || e.source === 'federal' || e.source === 'hdfc' || e.source === 'phonepe')
        .map((e) => ({ ...e, amount: Number(e.amount), deleted: !!e.deleted_at }));
    }
  }
  return {
    rows: classifyRows(withAccount, existing, source, categories.map((c) => c.name), new Set(Object.keys(knownLast4).concat(accountLast4 ? [accountLast4] : []))),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    categories: categories.map((c) => c.name),
    defaultAccountId: fileAccount,
    knownLast4,
  };
}

export type CommitItem = {
  date: string; name: string; raw: string; direction: 'debit' | 'credit'; amount: number;
  ref: string | null; account_id: string | null; category: string | null;
  /** a transfer between your own accounts: kept out of your books, but remembered so a later import does not add it */
  remembered?: boolean;
};
export type CommitMerge = { id: string; description?: string; category?: string; ext_ref?: string };
export type CommitResult = { added: number; merged: number; removed: number };

/** Write what the user ticked: new transactions, fill-ins on merged ones, and removal of the other half of a transfer. */
export async function commitImport(source: ImportSource, items: CommitItem[], merges: CommitMerge[], removeIds: string[], newAccountName?: string, accountLast4: string | null = null): Promise<CommitResult> {
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  const catId = (n: string | null) => (n ? categories.find((c) => c.name.toLowerCase() === n.toLowerCase())?.id ?? null : null);
  let fallbackAccount: string | null = null;
  if (newAccountName && items.some((i) => !i.account_id)) {
    const existing = accounts.find((a) => a.name.toLowerCase() === newAccountName.toLowerCase());
    if (existing) fallbackAccount = existing.id;
    else {
      const { data, error } = await admin().from('accounts').insert({ name: newAccountName, ...(source !== 'phonepe' && accountLast4 ? { number_last4: accountLast4 } : {}) }).select('id').single();
      if (error) throw new Error(`account_create: ${error.message}`);
      fallbackAccount = (data as { id: string }).id;
    }
  }
  const valid = new Set(accounts.map((a) => a.id));
  const rows = items.map((i) => {
    const expense = i.direction === 'debit';
    const account_id = i.account_id && valid.has(i.account_id) ? i.account_id : fallbackAccount;
    return {
      occurred_on: /^\d{4}-\d{2}-\d{2}$/.test(i.date) ? i.date : istDate(),
      kind: expense ? 'expense' : 'income',
      description: i.name.trim().slice(0, 200) || null,
      category_id: expense ? catId(i.category) : catId(i.category),
      account_id,
      amount: Math.abs(i.amount),
      my_share: expense ? Math.abs(i.amount) : null,
      raw_text: i.raw.slice(0, 500) || null,
      source,
      ext_ref: normalizeRef(i.ref, i.raw),
      ...(i.remembered ? { deleted_at: new Date().toISOString() } : {}),
    };
  });
  if (rows.some((r) => !(r.amount > 0))) throw new Error('A line has no amount.');
  let added = 0;
  for (let k = 0; k < rows.length; k += 200) {
    const { error } = await admin().from('transactions').insert(rows.slice(k, k + 200));
    if (error) throw new Error(/ext_ref|source/.test(error.message) ? 'Run supabase/migrations/0027_statement_import.sql in Supabase, then try again.' : `import: ${error.message}`);
    added += rows.slice(k, k + 200).filter((r) => !('deleted_at' in r)).length;
  }
  // remember the account number's last digits, so PhonePe's "paid by …5047" finds this account next time
  if (source !== 'phonepe' && accountLast4) {
    const used = [...rows.reduce((m, r) => (r.account_id ? m.set(r.account_id, (m.get(r.account_id) ?? 0) + 1) : m), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0];
    const acc = accounts.find((a) => a.id === used);
    if (used && (!acc || !acc.number_last4)) await admin().from('accounts').update({ number_last4: accountLast4 }).eq('id', used);
  }
  let merged = 0;
  for (const m of merges) {
    const { data: cur } = await admin().from('transactions').select('id,source,description,category_id').eq('id', m.id).is('deleted_at', null).maybeSingle();
    const t = cur as { id: string; source: string | null; description: string | null; category_id: string | null } | null;
    if (!t) continue;
    const patch: Record<string, unknown> = {};
    // only fill in: a name or category you typed yourself is never replaced
    if (m.description && (t.source === 'federal' || t.source === 'hdfc')) patch.description = m.description.slice(0, 200);
    if (m.ext_ref) patch.ext_ref = m.ext_ref;
    const misc = categories.find((c) => c.name.toLowerCase() === 'misc')?.id;
    if (m.category && (!t.category_id || t.category_id === misc) && (t.source === 'federal' || t.source === 'hdfc')) patch.category_id = catId(m.category);
    if (Object.keys(patch).length) {
      const { error } = await admin().from('transactions').update(patch).eq('id', t.id);
      if (error) throw new Error(`import_merge: ${error.message}`);
      merged++;
    }
  }
  let removed = 0;
  if (removeIds.length) {
    // only entries an earlier import created: anything entered by hand stays
    const { data, error } = await admin().from('transactions').update({ deleted_at: new Date().toISOString() }).in('id', removeIds).in('source', ['federal', 'hdfc', 'phonepe']).is('deleted_at', null).select('id');
    if (error) throw new Error(`import_remove: ${error.message}`);
    removed = (data ?? []).length;
  }
  return { added, merged, removed };
}
