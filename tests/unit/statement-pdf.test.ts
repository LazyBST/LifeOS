import { describe, expect, it } from 'vitest';
import { detectSource, parseFederal, parseHdfc, parsePhonePe, parseStatement, StatementError, type PdfItem } from '@/lib/domain/statement-pdf';

const it_ = (page: number, x: number, r: number, y: number, s: string): PdfItem => ({ page, x, r, y, s });
const right = (page: number, rEdge: number, y: number, s: string) => it_(page, rEdge - s.length * 5, rEdge, y, s);

/** A Federal Bank page laid out like the real PDF (invented data). */
function federal(opts: { badBalance?: boolean; badTotal?: boolean } = {}): PdfItem[] {
  const items = [
    it_(1, 18, 90, 699, 'Account Number'), it_(1, 446, 503, 699, ': 00000000001234'),
    it_(1, 419, 460, 471, 'Withdrawals'), it_(1, 474, 501, 471, 'Deposits'), it_(1, 518, 544, 471, 'Balance'), it_(1, 173, 220, 471, 'Particulars'),
    it_(1, 129, 200, 450, 'Opening Balance'), right(1, 549, 450, '1000.00'),
    // a UPI payment whose particulars wrap onto a second line
    it_(1, 22, 60, 434, '28-OCT-2026'), it_(1, 79, 120, 434, '28-OCT-2026'), it_(1, 129, 230, 434, 'UPIOUT/502953727799'), it_(1, 129, 250, 425, '/upflexanarock330754.rzp@/5817'),
    it_(1, 273, 290, 434, 'TFR'), it_(1, 318, 360, 434, 'S43879427'), right(1, 461, 434, '531.00'), right(1, 549, 434, '469.00'), it_(1, 572, 579, 434, 'Cr'),
    // a deposit
    it_(1, 22, 60, 409, '29-OCT-2026'), it_(1, 129, 230, 409, 'UPI IN/355118176741'), it_(1, 129, 250, 400, '/someone@axl/Paym/0000'),
    it_(1, 318, 360, 409, 'S44878988'), right(1, 505, 409, '10000.00'), right(1, 549, 409, opts.badBalance ? '10470.00' : '10469.00'), it_(1, 572, 579, 409, 'Cr'),
    it_(1, 129, 200, 150, 'GRAND TOTAL'), right(1, 461, 150, '531.00'), right(1, 505, 150, opts.badTotal ? '9999.00' : '10000.00'),
    it_(1, 134, 300, 28, 'The Federal Bank Ltd. Corporate Office'),
  ];
  return items;
}

describe('Federal Bank PDF', () => {
  it('reads each line, the UPI reference and the account, and proves the balances', () => {
    const r = parseFederal(federal());
    expect(r.accountLast4).toBe('1234');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: '2026-10-28', direction: 'debit', amount: 531, balance: 469, ref: '502953727799', raw: 'UPIOUT/502953727799/upflexanarock330754.rzp@/5817' });
    expect(r.rows[1]).toMatchObject({ date: '2026-10-29', direction: 'credit', amount: 10000, ref: '355118176741' });
    expect(r.summary).toMatch(/match/);
  });
  it('refuses a statement whose running balance does not add up', () => {
    expect(() => parseFederal(federal({ badBalance: true }))).toThrow(StatementError);
  });
  it('refuses a statement whose totals do not add up', () => {
    expect(() => parseFederal(federal({ badTotal: true }))).toThrow(/totals/);
  });
});

/** An HDFC page: narrations wrap, and the summary block carries the opening balance and totals. */
function hdfc(totalDebits = '1,200.00'): PdfItem[] {
  return [
    it_(1, 28, 124, 50, 'HDFC BANK LIMITED'), it_(1, 340, 400, 688, 'Account No'), it_(1, 397, 459, 688, ': 50100000009999'),
    it_(1, 40, 56, 602, 'Date'), it_(1, 144, 178, 602, 'Narration'), it_(1, 405, 466, 602, 'Withdrawal Amt.'), it_(1, 491, 536, 602, 'Deposit Amt.'), it_(1, 564, 619, 602, 'Closing Balance'),
    it_(1, 34, 62, 584, '30/10/26'), it_(1, 72, 250, 584, 'NEFT CR-HSBC0560002-DEEL EOR PRIVATE LIM'), it_(1, 72, 224, 567, 'ITED-AYUSH ARORA-HSBCN30302124091'),
    it_(1, 282, 353, 584, 'HSBCN30302124091'), right(1, 548, 584, '5,000.00'), right(1, 627, 584, '6,000.00'),
    it_(1, 34, 62, 550, '03/11/26'), it_(1, 72, 128, 550, 'UPI-BHUPATHI'), it_(1, 68, 193, 533, 'ANUSHA-******9141@AXL-UTIB0'), it_(1, 72, 241, 516, '000037-926580140681-PAYMENT FROM PHONE'),
    it_(1, 289, 353, 550, '0000926580140681'), right(1, 470, 550, '1,200.00'), right(1, 627, 550, '4,800.00'),
    it_(1, 68, 198, 292, 'STATEMENT SUMMARY :-'), it_(1, 132, 191, 282, 'Opening Balance'),
    it_(1, 144, 180, 271, '1,000.00'), it_(1, 304, 308, 271, '1'), it_(1, 375, 379, 271, '1'), it_(1, 418, 454, 271, totalDebits), it_(1, 496, 532, 271, '5,000.00'), it_(1, 574, 610, 271, '4,800.00'),
  ];
}

describe('HDFC Bank PDF', () => {
  it('joins wrapped narrations, reads names and references, and checks the summary', () => {
    const r = parseHdfc(hdfc());
    expect(r.accountLast4).toBe('9999');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: '2026-10-30', direction: 'credit', amount: 5000, name: 'Deel Eor Private Limited', ref: 'HSBCN30302124091' });
    expect(r.rows[1]).toMatchObject({ date: '2026-11-03', direction: 'debit', amount: 1200, name: 'Bhupathi Anusha', ref: '0000926580140681' });
  });
  it('refuses lines that do not match the summary totals', () => {
    expect(() => parseHdfc(hdfc('1,300.00'))).toThrow(/totals/);
  });
});

function phonepe(): PdfItem[] {
  const block = (y: number, date: string, type: string, amt: string, line: string, utr: string, acct: string, credited = false): PdfItem[] => [
    it_(1, 40, 103, y, date), it_(1, 40, 85, y - 17, '09:59 pm'), it_(1, 424, 453, y, type), it_(1, 509, 509 + amt.length * 5, y, amt),
    it_(1, 125, 260, y, line), it_(1, 125, 339, y - 17, 'Transaction ID T2611052159330231863140'), it_(1, 125, 240, y - 32, `UTR No. ${utr}`),
    it_(1, 125, 158, y - 50, credited ? 'Credited to' : 'Paid by'), it_(1, 185, 273, y - 51, acct),
  ];
  return [
    it_(1, 100, 362, 807, 'Transaction Statement for 9999999999'), it_(1, 124, 231, 748, 'Transaction Details'),
    ...block(719, 'Nov 05, 2026', 'DEBIT', '₹248.2', 'Paid to ZOMATO', '985575939061', 'XXXXXXXXXX5047'),
    ...block(628, 'Nov 04, 2026', 'DEBIT', '₹10,000', 'Transfer to XXXXXXXXXX5047', '298466504591', 'XXXXXXXXXX3444'),
    ...block(538, 'Oct 23, 2026', 'CREDIT', '₹5,000', 'Received from PANKITA', '629643118929', 'XXXXXXXXXX5047', true),
    it_(1, 266, 330, 77, 'Page 1 of 1'), it_(1, 40, 400, 58, 'This is a system generated statement.'),
  ];
}

describe('PhonePe PDF', () => {
  it('reads payments, received money and transfers, with the UTR and the account', () => {
    const r = parsePhonePe(phonepe());
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ date: '2026-11-05', direction: 'debit', amount: 248.2, name: 'Zomato', ref: '985575939061', paid_by_last4: '5047' });
    expect(r.rows[1]).toMatchObject({ amount: 10000, transfer_to_last4: '5047', paid_by_last4: '3444' });
    expect(r.rows[2]).toMatchObject({ date: '2026-10-23', direction: 'credit', amount: 5000, name: 'Pankita', paid_by_last4: '5047' });
  });
  it('refuses an entry with no UTR', () => {
    expect(() => parsePhonePe(phonepe().filter((i) => i.s !== 'UTR No. 985575939061'))).toThrow(StatementError);
  });
});

describe('telling the statements apart', () => {
  it('recognises each one and refuses the wrong choice', () => {
    expect(detectSource(federal())).toBe('federal');
    expect(detectSource(hdfc())).toBe('hdfc');
    expect(detectSource(phonepe())).toBe('phonepe');
    expect(() => parseStatement('hdfc', phonepe())).toThrow(/looks like a PhonePe/);
    expect(() => parseStatement('federal', [it_(1, 1, 5, 5, 'hello')])).toThrow(/does not look like/);
  });
});
