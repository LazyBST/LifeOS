// Reads the three statement PDFs by their layout: no guessing, no AI. Each parser takes the text items of the PDF
// (with positions) and returns the lines, then proves they add up: bank statements print a running balance and totals,
// so a line that was misread cannot slip through. Pure: the PDF itself is opened in statement-import.ts.
import type { ExtractedRow, ImportSource } from './statement-import-math';

export type PdfItem = { page: number; x: number; r: number; y: number; s: string };

export type ParsedStatement = {
  source: ImportSource;
  rows: ExtractedRow[];
  /** last 4 digits of the account number printed on the statement (bank statements) */
  accountLast4: string | null;
  /** what was proven: "45 lines, balance chain and totals match" */
  summary: string;
};

export class StatementError extends Error {}

const num = (s: string): number => Number(s.replace(/[,₹\s]/g, ''));
const money = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const iso = (y: number, mon: number, d: number) => `${y}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const AMOUNT = /^[\d,]+\.\d{2}$/;

/** Capitals to Title Case; mixed-case text is left as it is. */
const tidy = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t === t.toUpperCase() && /[A-Z]/.test(t) ? t.toLowerCase().replace(/(^|[\s.&-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()) : t;
};

/** The items of a row: everything on the page from its date line down to (not including) the next row's, or the bottom bound. */
function rowItems(items: PdfItem[], head: PdfItem, next: PdfItem | undefined, bottom: number): PdfItem[] {
  return items.filter((i) => i.page === head.page && i.y <= head.y + 2 && i.y > (next ? next.y + 2 : bottom));
}

const byPageThenTop = (a: PdfItem, b: PdfItem) => a.page - b.page || b.y - a.y || a.x - b.x;

/** The column whose header's right edge is nearest to the item's right edge. */
function nearestColumn(r: number, cols: Record<string, number>): string {
  let best = '', gap = Infinity;
  for (const [k, edge] of Object.entries(cols)) if (Math.abs(edge - r) < gap) { gap = Math.abs(edge - r); best = k; }
  return best;
}

function header(items: PdfItem[], labels: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, text] of Object.entries(labels)) {
    const h = items.find((i) => i.s === text);
    if (!h) throw new StatementError(`This does not look like the expected statement: the "${text}" column is missing.`);
    out[key] = h.r;
  }
  return out;
}

const text = (items: PdfItem[]) => items.map((i) => i.s).join(' ');

export function detectSource(items: PdfItem[]): ImportSource | null {
  const t = text(items.filter((i) => i.page === 1));
  if (/Transaction Statement for/i.test(t) && /Transaction Details/i.test(t)) return 'phonepe';
  if (/Federal Bank/i.test(t) && /Particulars/i.test(t)) return 'federal';
  if (/HDFC BANK/i.test(t) && /Narration/i.test(t)) return 'hdfc';
  return null;
}

/** The statement's own arithmetic: opening balance, every line, closing balance and totals must agree to the paisa. */
function proveBalances(label: string, opening: number, rows: ExtractedRow[], expect?: { debits?: number; credits?: number; drCount?: number; crCount?: number; closing?: number }): string {
  let bal = opening;
  rows.forEach((r, i) => {
    bal = money(bal + (r.direction === 'credit' ? r.amount : -r.amount));
    if (r.balance === null || Math.abs(r.balance - bal) > 0.011) throw new StatementError(`${label}: line ${i + 1} (${r.date}, ${r.name}) does not match the running balance, so nothing was imported.`);
  });
  const debits = money(rows.filter((r) => r.direction === 'debit').reduce((a, r) => a + r.amount, 0));
  const credits = money(rows.filter((r) => r.direction === 'credit').reduce((a, r) => a + r.amount, 0));
  const bad = (k: string, got: number, want: number | undefined) => want !== undefined && Math.abs(got - want) > 0.011 && `${k} ${got} vs ${want}`;
  const problems = [
    bad('debit total', debits, expect?.debits), bad('credit total', credits, expect?.credits),
    bad('debit count', rows.filter((r) => r.direction === 'debit').length, expect?.drCount), bad('credit count', rows.filter((r) => r.direction === 'credit').length, expect?.crCount),
    bad('closing balance', bal, expect?.closing),
  ].filter(Boolean);
  if (problems.length) throw new StatementError(`${label}: the lines do not add up to the statement's totals (${problems.join('; ')}), so nothing was imported.`);
  return `${rows.length} lines; running balance and totals match`;
}

// ---- Federal Bank ---------------------------------------------------------------------------------------------

/** A readable payee from a UPI handle: "zomato.eternaltsp.payu" is Zomato; a handle with no real word in it is kept whole. */
function upiName(handle: string): string {
  const first = handle.split('.')[0];
  const base = first.replace(/\d+$/, '');
  return (base.match(/[A-Za-z]/g) ?? []).length >= 4 ? base : first || handle;
}

export function parseFederal(all: PdfItem[]): ParsedStatement {
  const items = [...all].sort(byPageThenTop);
  const cols = header(items, { w: 'Withdrawals', d: 'Deposits', b: 'Balance' });
  const accNo = items.find((i) => /^:\s*\d{10,}$/.test(i.s) && items.some((h) => h.s === 'Account Number' && Math.abs(h.y - i.y) < 3 && h.page === i.page));
  const heads = items.filter((i) => i.x < 45 && /^\d{2}-[A-Z]{3}-\d{4}$/.test(i.s));
  const opening = items.find((i) => i.s === 'Opening Balance');
  const openRow = opening && items.find((i) => i.page === opening.page && Math.abs(i.y - opening.y) < 3 && AMOUNT.test(i.s));
  if (!heads.length || !openRow) throw new StatementError('Could not find the transactions in this Federal Bank statement.');
  const totals = items.find((i) => i.s === 'GRAND TOTAL');

  const rows: ExtractedRow[] = heads.map((h, k) => {
    const next = heads[k + 1]?.page === h.page ? heads[k + 1] : undefined;
    const stop = totals && totals.page === h.page && totals.y < h.y ? totals.y : 40;
    const mine = rowItems(items, h, next, Math.max(stop, 40));
    const raw = mine.filter((i) => i.x >= 120 && i.x < 262).sort((a, b) => b.y - a.y || a.x - b.x).map((i) => i.s).join('');
    const tranId = mine.find((i) => i.x >= 300 && i.x < 365)?.s ?? null;
    const amounts = mine.filter((i) => i.x > 395 && AMOUNT.test(i.s));
    const get = (c: string) => amounts.find((a) => nearestColumn(a.r, cols) === c);
    const w = get('w'), d = get('d'), b = get('b');
    if (!b || (!w && !d) || (w && d)) throw new StatementError(`Federal Bank: could not read the amounts on ${h.s}.`);
    const [dd, mon, yy] = h.s.split('-');
    const upi = /^UPI\s?(?:OUT|IN)\/(\d{6,})\/([^/]*)/i.exec(raw);
    const parts = raw.split('/').map((p) => p.trim()).filter(Boolean);
    const payee = upi ? upi[2] : parts.slice(2).filter((p) => /[A-Za-z]{3}/.test(p)).sort((a, b2) => b2.length - a.length)[0] ?? raw;
    const handle = payee.split('@')[0].replace(/^[.]+|[.]+$/g, '');
    return {
      date: iso(Number(yy), MONTHS.indexOf(mon) + 1, Number(dd)),
      name: tidy(upi ? upiName(handle) : payee),
      raw,
      direction: d ? 'credit' : 'debit',
      amount: num((d ?? w)!.s),
      balance: num(b.s) * (mine.find((i) => i.x > 560 && i.s === 'Dr') ? -1 : 1),
      ref: upi ? upi[1] : tranId,
      paid_by_last4: null,
    };
  });

  const gt = totals && items.filter((i) => i.page === totals.page && Math.abs(i.y - totals.y) < 3 && AMOUNT.test(i.s));
  const expect = gt && gt.length >= 2 ? {
    debits: num(gt.find((i) => nearestColumn(i.r, cols) === 'w')?.s ?? '0'),
    credits: num(gt.find((i) => nearestColumn(i.r, cols) === 'd')?.s ?? '0'),
  } : undefined;
  const summary = proveBalances('Federal Bank', num(openRow.s), rows, expect);
  return { source: 'federal', rows, accountLast4: accNo ? accNo.s.replace(/\D/g, '').slice(-4) : null, summary };
}

// ---- HDFC Bank ------------------------------------------------------------------------------------------------

/** HDFC wraps a narration onto several lines: a 40-character line was cut mid-word, a shorter one ended at a word. */
function joinNarration(lines: string[]): string {
  return lines.reduce((acc, l, i) => (i === 0 ? l : acc + (lines[i - 1].length >= 40 ? '' : ' ') + l), '');
}

function hdfcName(narr: string): string {
  const upi = /^UPI-(.+?)-(?:[*X\d]{4,}|[\w.]+@)/i.exec(narr);
  if (upi) return tidy(upi[1]);
  const neft = /^(?:NEFT|IMPS|RTGS) (?:CR|DR)-[A-Z0-9]+-(.+?)-/i.exec(narr);
  if (neft) return tidy(neft[1]);
  const ach = /^ACH [CD]- ?(.+?)-[A-Z0-9]+$/i.exec(narr);
  if (ach) return tidy(ach[1]);
  const bill = /^IB BILLPAY DR-(.+)$/i.exec(narr);
  if (bill) return `Bill payment ${bill[1]}`;
  return tidy(narr.slice(0, 60));
}

export function parseHdfc(all: PdfItem[]): ParsedStatement {
  const items = [...all].sort(byPageThenTop);
  const cols = header(items, { w: 'Withdrawal Amt.', d: 'Deposit Amt.', b: 'Closing Balance' });
  const accNo = items.find((i) => /^:\s*\d{10,}$/.test(i.s) && items.some((h) => h.s === 'Account No' && Math.abs(h.y - i.y) < 3 && h.page === i.page));
  const heads = items.filter((i) => i.x < 45 && /^\d{2}\/\d{2}\/\d{2}$/.test(i.s) && items.some((h) => h.page === i.page && h.s === 'Date' && h.y > i.y));
  if (!heads.length) throw new StatementError('Could not find the transactions in this HDFC Bank statement.');

  // the summary block: Opening Balance, Dr Count, Cr Count, Debits, Credits, Closing Bal, with the numbers on the line below
  const sumHead = items.find((i) => i.s === 'Opening Balance');
  const sumNums = sumHead ? items.filter((i) => i.page === sumHead.page && i.y < sumHead.y && i.y > sumHead.y - 20 && /^[\d,]+(\.\d{2})?$/.test(i.s)).sort((a, b) => a.x - b.x) : [];
  if (!sumHead || sumNums.length < 6) throw new StatementError('Could not find the statement summary in this HDFC Bank statement, so the lines cannot be checked.');
  const [opening, drCount, crCount, debits, credits, closing] = sumNums.map((i) => num(i.s));

  const rows: ExtractedRow[] = heads.map((h, k) => {
    const next = heads[k + 1]?.page === h.page ? heads[k + 1] : undefined;
    const summaryTop = items.find((i) => i.page === h.page && /^STATEMENT SUMMARY/.test(i.s));
    const mine = rowItems(items, h, next, Math.max(summaryTop && summaryTop.y < h.y ? summaryTop.y : 0, 55));
    const narration = joinNarration(mine.filter((i) => i.x >= 60 && i.x < 278).sort((a, b) => b.y - a.y || a.x - b.x).map((i) => i.s));
    const ref = mine.find((i) => i.x >= 278 && i.x < 358)?.s ?? null;
    const amounts = mine.filter((i) => i.x > 395 && AMOUNT.test(i.s));
    const get = (c: string) => amounts.find((a) => nearestColumn(a.r, cols) === c);
    const w = get('w'), d = get('d'), b = get('b');
    if (!b || (!w && !d) || (w && d)) throw new StatementError(`HDFC Bank: could not read the amounts on ${h.s}.`);
    const [dd, mm, yy] = h.s.split('/');
    return {
      date: iso(2000 + Number(yy), Number(mm), Number(dd)),
      name: hdfcName(narration), raw: narration,
      direction: d ? 'credit' : 'debit', amount: num((d ?? w)!.s), balance: num(b.s), ref, paid_by_last4: null,
    };
  });
  const summary = proveBalances('HDFC Bank', opening, rows, { debits, credits, drCount, crCount, closing });
  return { source: 'hdfc', rows, accountLast4: accNo ? accNo.s.replace(/\D/g, '').slice(-4) : null, summary };
}

// ---- PhonePe --------------------------------------------------------------------------------------------------

export function parsePhonePe(all: PdfItem[]): ParsedStatement {
  const items = [...all].sort(byPageThenTop);
  const heads = items.filter((i) => i.x < 110 && /^[A-Z][a-z]{2} \d{2}, \d{4}$/.test(i.s));
  if (!heads.length) throw new StatementError('Could not find the transactions in this PhonePe statement.');
  const rows: ExtractedRow[] = heads.map((h, k) => {
    const next = heads[k + 1]?.page === h.page ? heads[k + 1] : undefined;
    const footer = items.find((i) => i.page === h.page && /^Page \d+ of \d+$/.test(i.s) && i.y < h.y);
    const mine = rowItems(items, h, next, footer ? footer.y + 3 : 0);
    const type = mine.find((i) => i.x > 410 && i.x < 470 && /^(DEBIT|CREDIT)$/.test(i.s))?.s;
    const amt = mine.find((i) => i.x > 495 && /^₹[\d,]+(\.\d+)?$/.test(i.s))?.s;
    const utr = mine.map((i) => /^UTR No\.\s*(\S+)/.exec(i.s)?.[1]).find(Boolean) ?? null;
    if (!type || !amt || !utr) throw new StatementError(`PhonePe: could not read the transaction on ${h.s} (type, amount or UTR is missing), so nothing was imported.`);
    const lines = mine.filter((i) => i.x >= 120 && i.x < 400).sort((a, b) => b.y - a.y);
    const detail: string[] = [];
    for (const l of lines) { if (/^Transaction ID/.test(l.s)) break; detail.push(l.s); }
    const line = detail.join(' ').trim();
    const last4 = mine.map((i) => /^X+(\d{3,})$/.exec(i.s)?.[1]).find(Boolean) ?? null;
    const toAcct = /^Transfer to X+(\d{3,})$/.exec(line)?.[1] ?? null;
    const m = /^(\w{3}) (\d{2}), (\d{4})$/.exec(h.s)!;
    return {
      date: iso(Number(m[3]), MONTHS.indexOf(m[1].toUpperCase()) + 1, Number(m[2])),
      name: tidy(line.replace(/^(Paid to|Received from)\s+/i, '')),
      raw: `${line} | UTR ${utr}`,
      direction: type === 'CREDIT' ? 'credit' : 'debit',
      amount: money(num(amt)), balance: null, ref: utr, paid_by_last4: last4 ? last4.slice(-4) : null,
      transfer_to_last4: toAcct ? toAcct.slice(-4) : null,
    };
  });
  const ids = items.filter((i) => /^Transaction ID /.test(i.s)).length;
  if (ids !== rows.length) throw new StatementError(`PhonePe: found ${rows.length} entries but ${ids} transaction IDs, so nothing was imported.`);
  return { source: 'phonepe', rows, accountLast4: null, summary: `${rows.length} entries; every one has a type, amount and UTR` };
}

export function parseStatement(source: ImportSource, items: PdfItem[]): ParsedStatement {
  const found = detectSource(items);
  if (found && found !== source) {
    const name = { federal: 'Federal Bank', hdfc: 'HDFC Bank', phonepe: 'PhonePe' };
    throw new StatementError(`This looks like a ${name[found]} statement, but ${name[source]} is selected.`);
  }
  if (!found) throw new StatementError('This does not look like a Federal Bank, HDFC Bank or PhonePe statement PDF.');
  return source === 'federal' ? parseFederal(items) : source === 'hdfc' ? parseHdfc(items) : parsePhonePe(items);
}
