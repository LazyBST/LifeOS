import { describe, expect, test } from 'vitest';
import { freshDb, row, rows } from './harness';

describe('transaction labels and categories', () => {
  test('seeds Necessity and Luxury, and a transaction carries several labels', async () => {
    const db = await freshDb();
    const l = await rows<{ name: string }>(db, `select name from transaction_labels order by name`);
    expect(l.map((x) => x.name)).toEqual(['Luxury', 'Necessity']);
    const t = await row<{ labels: string[] }>(db, `insert into transactions (kind, amount, my_share, labels) values ('expense', 300, 300, '{Luxury,Necessity}') returning labels`);
    expect(t!.labels).toEqual(['Luxury', 'Necessity']);
  });

  test('the owed view carries labels, and the overlap filter finds them', async () => {
    const db = await freshDb();
    await db.query(`insert into transactions (kind, amount, my_share, labels) values ('expense', 100, 100, '{Luxury}'), ('expense', 50, 50, '{}')`);
    const r = await rows<{ amount: string }>(db, `select amount from v_transactions_owed where labels && '{Luxury}'`);
    expect(r).toHaveLength(1);
  });

  test('label names are unique', async () => {
    const db = await freshDb();
    await expect(db.query(`insert into transaction_labels (name) values ('Luxury')`)).rejects.toThrow();
  });
});
