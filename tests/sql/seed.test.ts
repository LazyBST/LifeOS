// Proves that supabase/seed.sql loads cleanly on top of a freshly migrated
// database (spec section 11: "Seed data for testing").
import { describe, expect, test } from 'vitest';
import { freshDb, loadSeed, row, rows } from './harness';

describe('supabase/seed.sql', () => {
  test('loads without error on top of the migrations', async () => {
    const db = await freshDb();
    await expect(loadSeed(db)).resolves.not.toThrow();
  });

  test('seeded data matches the shape described in spec section 11', async () => {
    const db = await freshDb();
    await loadSeed(db);

    const areas = await row<{ count: string }>(db, `select count(*) from areas`);
    expect(Number(areas!.count)).toBe(4);

    const goals = await row<{ count: string }>(db, `select count(*) from goals`);
    expect(Number(goals!.count)).toBe(2);

    const projects = await row<{ count: string }>(db, `select count(*) from projects`);
    expect(Number(projects!.count)).toBe(3);

    // 11 project tasks + 1 goal-level task + 1 subtask = 13
    const tasks = await row<{ count: string }>(db, `select count(*) from tasks`);
    expect(Number(tasks!.count)).toBe(13);

    const habits = await row<{ count: string }>(db, `select count(*) from habits`);
    expect(Number(habits!.count)).toBe(3);

    const transactions = await row<{ count: string }>(db, `select count(*) from transactions`);
    expect(Number(transactions!.count)).toBe(5);
  });
});

describe('v_transactions_owed', () => {
  test('works out who owes whom per transaction and hides deleted ones', async () => {
    const db = await freshDb();
    await db.query(`insert into transactions (kind, amount, my_share, counterparty, description) values ('expense', 1000, 400, 'raj', 'dinner'), ('expense', 200, 200, null, 'tea'), ('settlement', -300, null, 'raj', 'paid raj')`);
    await db.query(`insert into transactions (kind, amount, deleted_at) values ('income', 5, now())`);
    const r = await rows<{ description: string; owed: string }>(db, `select description, owed::text from v_transactions_owed order by description`);
    expect(r).toEqual([{ description: 'dinner', owed: '600.00' }, { description: 'paid raj', owed: '300.00' }, { description: 'tea', owed: '0.00' }]);
  });
});
