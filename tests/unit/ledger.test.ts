import { describe, expect, it } from 'vitest';
import { buildLedger, describeNet, ledgerRow, projectedEnd, type LedgerTask } from '@/lib/domain/ledger-math';

const T = (o: Partial<LedgerTask> & { id: string }): LedgerTask => ({ title: o.id, status: 'todo', original_due_date: '2026-10-22', due_date: '2026-10-22', completed_at: null, done: false, ...o });
const TODAY = '2026-10-24';

describe('schedule ledger, both directions', () => {
  it('done early gains days, done late loses days', () => {
    expect(ledgerRow(T({ id: 'a', done: true, status: 'done', completed_at: '2026-10-19T08:00:00Z' }), TODAY)!.delta).toBe(-3);
    expect(ledgerRow(T({ id: 'b', done: true, status: 'done', completed_at: '2026-10-24T08:00:00Z' }), TODAY)!.delta).toBe(2);
  });
  it('uses the IST calendar day for completion', () => {
    // 20:00 UTC on the 21st is already the 22nd in IST: exactly on time
    expect(ledgerRow(T({ id: 'a', done: true, status: 'done', completed_at: '2026-10-21T20:00:00Z' }), TODAY)!.delta).toBe(0);
  });
  it('open work is forecast at its current deadline, or today when overdue', () => {
    expect(ledgerRow(T({ id: 'a', due_date: '2026-10-27' }), TODAY)!.delta).toBe(5);
    expect(ledgerRow(T({ id: 'b', due_date: '2026-10-22' }), TODAY)!.delta).toBe(2); // overdue by 2 days today
    expect(ledgerRow(T({ id: 'c', due_date: '2026-10-30', original_due_date: '2026-11-02' }), TODAY)!.delta).toBe(-3);
  });
  it('the net is the sum: 3 days early and 2 late improves the parent by 1', () => {
    const l = buildLedger([
      T({ id: 'early', done: true, status: 'done', completed_at: '2026-10-19T08:00:00Z' }),
      T({ id: 'late', done: true, status: 'done', completed_at: '2026-10-24T08:00:00Z' }),
    ], TODAY);
    expect(l.net).toBe(-1);
    expect(l.lateDays).toBe(2);
    expect(l.earlyDays).toBe(3);
    expect(describeNet(l.net, 'Launch MVP')).toBe('Launch MVP is 1 day ahead of schedule');
  });
  it('the dashboard example: +2, +3, +4 late and −3 early nets +6', () => {
    const mk = (id: string, ag: string, ac: string) => T({ id, original_due_date: ag, done: true, status: 'done', completed_at: `${ac}T08:00:00Z` });
    const l = buildLedger([mk('a', '2026-10-22', '2026-10-24'), mk('b', '2026-10-23', '2026-10-26'), mk('c', '2026-10-20', '2026-10-24'), mk('d', '2026-10-22', '2026-10-19')], TODAY);
    expect(l.net).toBe(6);
    expect(projectedEnd('2026-12-31', l.net)).toBe('2027-01-06');
  });
  it('tasks without an agreed deadline are not in the ledger', () => {
    expect(buildLedger([T({ id: 'x', original_due_date: null })], TODAY).rows).toHaveLength(0);
  });
});
