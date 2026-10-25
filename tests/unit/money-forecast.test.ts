import { describe, expect, it } from 'vitest';
import { addMonthsClamped, balanceDelta, changePct, cumulativeByDay, dailyBalances, forecast, nextAfter, occurrences, typicalDailySpend, type ScheduledLike } from '@/lib/domain/money-forecast-math';

const rent: ScheduledLike = { id: 'r', name: 'Rent', kind: 'expense', amount: 20000, frequency: 'monthly', next_due: '2026-01-31', end_date: null, active: true };

describe('recurring dates', () => {
  it('keeps the day of month, clamping short months without drifting', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(occurrences(rent, '2026-01-01', '2026-04-30').map((o) => o.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('steps weekly, once, and stops at the end date', () => {
    const w: ScheduledLike = { ...rent, frequency: 'weekly', next_due: '2026-10-01', end_date: '2026-10-15' };
    expect(occurrences(w, '2026-10-01', '2026-12-31').map((o) => o.date)).toEqual(['2026-10-01', '2026-10-08', '2026-10-15']);
    expect(nextAfter('2026-10-15', 'weekly', '2026-10-15')).toBeNull();
    expect(nextAfter('2026-10-01', 'once')).toBeNull();
    expect(nextAfter('2026-10-01', 'yearly')).toBe('2027-10-01');
  });
  it('counts an unpaid past payment once, as overdue today', () => {
    const o = occurrences({ ...rent, next_due: '2026-09-01' }, '2026-10-25', '2026-11-30');
    expect(o[0]).toMatchObject({ date: '2026-10-25', overdue: true });
    expect(o.slice(1).map((x) => x.date)).toEqual(['2026-11-01']);
  });
  it('ignores inactive payments', () => expect(occurrences({ ...rent, active: false }, '2026-01-01', '2026-12-31')).toEqual([]));
});

describe('balances and forecast', () => {
  const txs = [
    { occurred_on: '2026-10-02', kind: 'income' as const, amount: 1000 },
    { occurred_on: '2026-10-03', kind: 'expense' as const, amount: 300, my_share: 100 },
  ];
  it('treats expenses as outflow and settlements as signed', () => {
    expect(balanceDelta(txs[1])).toBe(-300);
    expect(balanceDelta({ occurred_on: 'x', kind: 'settlement', amount: -50 })).toBe(-50);
  });
  it('works balances backwards from today', () => {
    const b = dailyBalances(1700, txs, '2026-10-01', '2026-10-31', '2026-10-04');
    expect(b.map((x) => x.balance)).toEqual([1000, 2000, 1700, 1700]);
  });
  it('accumulates expense by my share and income separately', () => {
    expect(cumulativeByDay(txs, '2026-10-01', '2026-10-04', 'expense').map((x) => x.value)).toEqual([0, 0, 100, 100]);
    expect(cumulativeByDay(txs, '2026-10-01', '2026-10-04', 'income').map((x) => x.value)).toEqual([0, 1000, 1000, 1000]);
    expect(cumulativeByDay(txs, '2026-10-01', '2026-10-04', 'expense', '2026-10-02')).toHaveLength(2);
  });
  it('projects committed and expected balance', () => {
    const f = forecast({ start: 50000, today: '2026-10-25', days: 10, scheduled: [{ ...rent, next_due: '2026-10-31' }], dailySpend: 100 });
    expect(f[0]).toMatchObject({ committed: 50000, expected: 50000 });
    expect(f[6]).toMatchObject({ date: '2026-10-31', committed: 30000, expected: 29400 });
    expect(f[10].committed).toBe(30000);
  });
  it('leaves scheduled payments out of typical spend and compares periods', () => {
    const t = [{ occurred_on: 'a', kind: 'expense' as const, amount: 600, my_share: 600, description: 'Lunch' }, { occurred_on: 'b', kind: 'expense' as const, amount: 20000, my_share: 20000, description: 'rent' }];
    expect(typicalDailySpend(t, ['Rent'], 60)).toBe(10);
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(5, 0)).toBeNull();
  });
});
