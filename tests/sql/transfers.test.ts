import { describe, expect, test } from 'vitest';
import { freshDb, row, rows } from './harness';

describe('transfers between accounts', () => {
  async function two(db: Awaited<ReturnType<typeof freshDb>>) {
    const a = await row<{ id: string }>(db, `insert into accounts (name, opening_balance) values ('Federal', 1000) returning id`);
    const b = await row<{ id: string }>(db, `insert into accounts (name, opening_balance) values ('HDFC', 5000) returning id`);
    return [a!.id, b!.id] as const;
  }
  const bal = async (db: Awaited<ReturnType<typeof freshDb>>) =>
    Object.fromEntries((await rows<{ name: string; balance: string }>(db, `select name, balance from v_account_balances`)).map((r) => [r.name, Number(r.balance)]));

  test('a transfer takes money out of one account and puts it in the other, and the total does not change', async () => {
    const db = await freshDb();
    const [fed, hdfc] = await two(db);
    await db.query(`insert into transactions (kind, amount, account_id, to_account_id) values ('transfer', 700, $1, $2)`, [hdfc, fed]);
    expect(await bal(db)).toEqual({ Federal: 1700, HDFC: 4300 });
    const w = await row<{ cash_on_hand: string }>(db, `select cash_on_hand from v_wallet`);
    expect(Number(w!.cash_on_hand)).toBe(6000);
  });

  test('it needs two different accounts, and only a transfer has a destination', async () => {
    const db = await freshDb();
    const [fed, hdfc] = await two(db);
    await expect(db.query(`insert into transactions (kind, amount, account_id, to_account_id) values ('transfer', 5, $1, $1)`, [fed])).rejects.toThrow();
    await expect(db.query(`insert into transactions (kind, amount, account_id) values ('transfer', 5, $1)`, [fed])).rejects.toThrow();
    await expect(db.query(`insert into transactions (kind, amount, my_share, account_id, to_account_id) values ('expense', 5, 5, $1, $2)`, [fed, hdfc])).rejects.toThrow();
  });

  test('a transfer is neither spending nor income, and a deleted one stops counting', async () => {
    const db = await freshDb();
    const [fed, hdfc] = await two(db);
    const t = await row<{ id: string }>(db, `insert into transactions (kind, amount, account_id, to_account_id) values ('transfer', 700, $1, $2) returning id`, [hdfc, fed]);
    expect(await rows(db, `select 1 from v_my_spending`)).toHaveLength(0);
    const o = await row<{ owed: string }>(db, `select owed from v_transactions_owed where id = $1`, [t!.id]);
    expect(Number(o!.owed)).toBe(0);
    await db.query(`update transactions set deleted_at = now() where id = $1`, [t!.id]);
    expect(await bal(db)).toEqual({ Federal: 1000, HDFC: 5000 });
  });

  test('income can carry a category, and Salary and Refund exist', async () => {
    const db = await freshDb();
    const c = await rows<{ name: string }>(db, `select name from categories where name in ('Salary','Refund') order by name`);
    expect(c.map((x) => x.name)).toEqual(['Refund', 'Salary']);
    const s = await row<{ id: string }>(db, `select id from categories where name = 'Salary'`);
    const t = await row<{ category_id: string }>(db, `insert into transactions (kind, amount, category_id) values ('income', 100, $1) returning category_id`, [s!.id]);
    expect(t!.category_id).toBe(s!.id);
  });
});
