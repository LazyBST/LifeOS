import { describe, expect, it } from 'vitest';
import { categorize, classifyRows, mccOf, normalizeRef, reconcileBalances, type ExistingTx, type ExtractedRow } from '@/lib/domain/statement-import-math';

const CATS = ['Food', 'Groceries', 'Transport', 'Rent', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Family', 'Misc'];
const row = (o: Partial<ExtractedRow>): ExtractedRow => ({ date: '2026-10-28', name: 'X', raw: '', direction: 'debit', amount: 100, balance: null, ref: null, paid_by_last4: null, ...o });
const ex = (o: Partial<ExistingTx>): ExistingTx => ({ id: 'e1', occurred_on: '2026-10-28', kind: 'expense', amount: 100, account_id: 'fed', ext_ref: null, source: null, description: null, category_id: null, ...o });
const withAcc = (r: ExtractedRow, account_id = 'fed') => ({ ...r, account_id });

describe('references', () => {
  it('reads the same UPI reference from Federal, HDFC and PhonePe', () => {
    expect(normalizeRef(null, 'UPIOUT/502953727799/upflexanarock330754.rzp@/5817')).toBe('502953727799');
    expect(normalizeRef(null, 'UPI IN/355118176741/ayusharora17785@axl/0000')).toBe('355118176741');
    expect(normalizeRef('0000355118176741')).toBe('355118176741');
    expect(normalizeRef('502953727799')).toBe('502953727799');
    expect(normalizeRef('hsbcn30302124091')).toBe('HSBCN30302124091');
  });
});

describe('categories', () => {
  const cat = (name: string, raw = '') => categorize({ name, raw, direction: 'debit' }, CATS);
  it('knows food and shopping words, and the merchant code', () => {
    expect(cat('Zomato')).toBe('Food');
    expect(cat('DOMINOS PIZZA')).toBe('Food');
    expect(cat('tomato')).toBe('Food');
    expect(cat('Bharti Airtel Limited')).toBe('Bills');
    expect(cat('Powerlook', 'UPIOUT/667427503215/powerlook.esbz@hdfcbank//5611')).toBe('Shopping');
    expect(cat('Dhruv Pan shop', 'UPIOUT/521312731275/Q134018239@ybl/Payment f/5993')).toBe('Misc');
    expect(cat('Someone', 'UPIOUT/1/x@ybl/5411')).toBe('Groceries');
    expect(cat('Geeta Petro Station')).toBe('Transport');
    expect(cat('Bajaj Housing Finance', 'ACH D- BAJAJ HOUSING FINANC-H401')).toBe('Bills');
  });
  it('does not mistake words that merely contain a keyword, and leaves credits alone', () => {
    expect(cat('Cola corner')).toBe('Misc');
    expect(categorize({ name: 'Salary', raw: '', direction: 'credit' }, CATS)).toBeNull();
    expect(mccOf('UPIOUT/1/x@ybl/Payment f/5814')).toBe('5814');
  });
});

describe('running balance check', () => {
  it('fixes an amount the balance contradicts', () => {
    const r = reconcileBalances([
      row({ amount: 531, balance: 27143.95 }),
      row({ amount: 112, direction: 'credit', balance: 27255.95 }),
      row({ amount: 15, balance: 27104.95 }), // misread: really 151
    ]);
    expect(r.rows.map((x) => x.amount)).toEqual([531, 112, 151]);
    expect(r.rows[2].corrected).toBe(true);
    expect(r.fixed).toBe(1);
  });
  it('copes with a newest-first statement', () => {
    const r = reconcileBalances([
      row({ amount: 189, balance: 26803.95 }),
      row({ amount: 151, balance: 26992.95 }),
      row({ amount: 531, balance: 27143.95 }),
    ]);
    expect(r.fixed).toBe(0);
    const bad = reconcileBalances([row({ amount: 18, balance: 26803.95 }), row({ amount: 151, balance: 26992.95 }), row({ amount: 531, balance: 27143.95 })]);
    expect(bad.rows[0].amount).toBe(189);
  });
});

describe('already there, merge and transfer', () => {
  it('skips a line whose reference is on file', () => {
    const [c] = classifyRows([withAcc(row({ ref: '502953727799', amount: 531 }))], [ex({ ext_ref: '502953727799', amount: 531, source: 'federal' })], 'federal', CATS);
    expect(c.status).toBe('duplicate');
  });
  it('matches a hand-entered payment on account, amount and date, and remembers the reference', () => {
    const [c] = classifyRows([withAcc(row({ ref: '111111111111', amount: 280, date: '2026-10-29' }))], [ex({ amount: 280, description: 'Lunch' })], 'federal', CATS);
    expect(c.status).toBe('duplicate');
    expect(c.patch).toEqual({ ext_ref: '111111111111' });
  });
  it('does not match another account, another amount or a different day', () => {
    const e = [ex({ amount: 280 })];
    expect(classifyRows([withAcc(row({ amount: 280 }), 'hdfc')], e, 'hdfc', CATS)[0].status).toBe('new');
    expect(classifyRows([withAcc(row({ amount: 281 }))], e, 'federal', CATS)[0].status).toBe('new');
    expect(classifyRows([withAcc(row({ amount: 280, date: '2026-11-02' }))], e, 'federal', CATS)[0].status).toBe('new');
  });
  it('a hand-entered payment with a different reference is a different payment', () => {
    const [c] = classifyRows([withAcc(row({ ref: '222222222222', amount: 280 }))], [ex({ amount: 280, ext_ref: '999999999999' })], 'federal', CATS);
    expect(c.status).toBe('new');
  });
  it('two equal payments on one day both import, but one match consumes one entry', () => {
    const r = classifyRows([withAcc(row({ amount: 281 })), withAcc(row({ amount: 281 }))], [ex({ amount: 281 })], 'federal', CATS);
    expect(r.map((x) => x.status)).toEqual(['duplicate', 'new']);
  });
  it('merges a PhonePe line into the bank entry that has the same reference, filling in the merchant', () => {
    const [c] = classifyRows(
      [withAcc(row({ name: 'Zomato', ref: '561031391672', amount: 248.2 }))],
      [ex({ id: 'b1', ext_ref: '561031391672', amount: 248.2, source: 'federal', description: 'zomato.eternaltsp.payu@h' })], 'phonepe', CATS);
    expect(c.status).toBe('merge');
    expect(c.matchId).toBe('b1');
    expect(c.patch).toEqual({ description: 'Zomato', category: 'Food' });
  });
  it('a bank line over a PhonePe entry is simply already there', () => {
    const [c] = classifyRows([withAcc(row({ ref: '561031391672', amount: 248.2 }))], [ex({ ext_ref: '561031391672', amount: 248.2, source: 'phonepe' })], 'federal', CATS);
    expect(c.status).toBe('duplicate');
  });
  it('recognises the other half of a transfer between your own accounts', () => {
    // Federal credit "UPI IN/355118176741" was imported first; HDFC now shows the 10,000 going out with the same reference
    const [c] = classifyRows(
      [withAcc(row({ amount: 10000, ref: '0000355118176741' }), 'hdfc')],
      [ex({ id: 'fedIn', kind: 'income', amount: 10000, account_id: 'fed', ext_ref: '355118176741', source: 'federal' })], 'hdfc', CATS);
    expect(c.status).toBe('transfer');
    expect(c.counterpartId).toBe('fedIn');
  });
  it('never offers to remove a hand-entered counterpart', () => {
    const [c] = classifyRows([withAcc(row({ amount: 10000, ref: '355118176741' }), 'hdfc')], [ex({ kind: 'income', amount: 10000, ext_ref: '355118176741', source: null })], 'hdfc', CATS);
    expect(c.status).toBe('transfer');
    expect(c.counterpartId).toBeNull();
  });
  it('drops a line repeated in the same file (overlapping screenshots)', () => {
    const r = classifyRows([withAcc(row({ ref: '333333333333' })), withAcc(row({ ref: '333333333333' }))], [], 'federal', CATS);
    expect(r.map((x) => x.status)).toEqual(['new', 'duplicate']);
  });
});
