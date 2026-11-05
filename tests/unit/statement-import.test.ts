import { describe, expect, it } from 'vitest';
import { categorize, classifyRows, mccOf, normalizeRef, type ExistingTx, type ExtractedRow } from '@/lib/domain/statement-import-math';

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
    expect(c.counterpartIds).toEqual(['fedIn']);
  });
  it('never offers to remove a hand-entered counterpart', () => {
    const [c] = classifyRows([withAcc(row({ amount: 10000, ref: '355118176741' }), 'hdfc')], [ex({ kind: 'income', amount: 10000, ext_ref: '355118176741', source: null })], 'hdfc', CATS);
    expect(c.status).toBe('transfer');
    expect(c.counterpartIds).toEqual([]);
  });
  it('drops a line repeated in the same file (overlapping screenshots)', () => {
    const r = classifyRows([withAcc(row({ ref: '333333333333' })), withAcc(row({ ref: '333333333333' }))], [], 'federal', CATS);
    expect(r.map((x) => x.status)).toEqual(['new', 'duplicate']);
  });
  it('a PhonePe "Transfer to" one of your own accounts is not spending, and both earlier entries can go', () => {
    const own = new Set(['5047']);
    const [c] = classifyRows(
      [withAcc(row({ name: 'Transfer to XXXXXXXXXX5047', amount: 10000, ref: '298466504591', transfer_to_last4: '5047' }), 'hdfc')],
      [ex({ id: 'h1', kind: 'expense', amount: 10000, account_id: 'hdfc', ext_ref: '298466504591', source: 'hdfc' }), ex({ id: 'f1', kind: 'income', amount: 10000, account_id: 'fed', ext_ref: '298466504591', source: 'federal' })],
      'phonepe', CATS, own);
    expect(c.status).toBe('transfer');
    expect(c.counterpartIds.sort()).toEqual(['f1', 'h1']);
    // before you have imported the account that number belongs to, it cannot be told from a payment to someone else
    const [d] = classifyRows([withAcc(row({ amount: 10000, ref: '482360841714', transfer_to_last4: '5047' }), 'hdfc')], [], 'phonepe', CATS);
    expect(d.status).toBe('new');
  });
});

describe('what you removed stays removed', () => {
  it('does not bring back an imported entry that was deleted, and does not merge into one', () => {
    const gone = ex({ id: 'g', kind: 'income', amount: 10000, ext_ref: '355118176741', source: 'federal', deleted: true });
    expect(classifyRows([withAcc(row({ direction: 'credit', amount: 10000, ref: '355118176741' }))], [gone], 'federal', CATS)[0].status).toBe('duplicate');
    const goneBank = ex({ id: 'g2', amount: 248.2, ext_ref: '561031391672', source: 'federal', deleted: true });
    expect(classifyRows([withAcc(row({ name: 'Zomato', amount: 248.2, ref: '561031391672' }))], [goneBank], 'phonepe', CATS)[0].status).toBe('duplicate');
  });
  it('a merge that already happened is just a duplicate', () => {
    const done = ex({ ext_ref: '561031391672', amount: 248.2, source: 'federal', description: 'Zomato' });
    expect(classifyRows([withAcc(row({ name: 'Zomato', amount: 248.2, ref: '561031391672' }))], [done], 'phonepe', CATS)[0].status).toBe('duplicate');
  });
});
