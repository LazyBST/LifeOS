import { describe, expect, test } from 'vitest';
import { freshDb, row, rows } from './harness';

describe('first agreed deadline', () => {
  test('is set on insert and never moves, while every change is logged', async () => {
    const db = await freshDb();
    const t = await row<{ id: string; original_due_date: string }>(db, `insert into tasks (title, due_date) values ('x', '2026-10-22') returning id, original_due_date::text`);
    expect(t!.original_due_date).toBe('2026-10-22');
    await db.query(`update tasks set due_date = '2026-10-24' where id = $1`, [t!.id]);
    await db.query(`update tasks set due_date = '2026-10-27' where id = $1`, [t!.id]);
    const r = await row<{ original_due_date: string; due_date: string }>(db, `select original_due_date::text, due_date::text from tasks where id=$1`, [t!.id]);
    expect(r).toEqual({ original_due_date: '2026-10-22', due_date: '2026-10-27' });
    const log = await rows<{ old_date: string; new_date: string }>(db, `select old_date::text, new_date::text from deadline_changes where entity_id=$1 order by id`, [t!.id]);
    expect(log).toEqual([{ old_date: '2026-10-22', new_date: '2026-10-24' }, { old_date: '2026-10-24', new_date: '2026-10-27' }]);
  });
  test('a task given its first deadline later gets that as the original', async () => {
    const db = await freshDb();
    const t = await row<{ id: string }>(db, `insert into tasks (title) values ('x') returning id`);
    await db.query(`update tasks set due_date = '2026-11-01' where id=$1`, [t!.id]);
    const r = await row<{ original_due_date: string }>(db, `select original_due_date::text from tasks where id=$1`, [t!.id]);
    expect(r!.original_due_date).toBe('2026-11-01');
    expect(await rows(db, `select 1 from deadline_changes where entity_id=$1`, [t!.id])).toHaveLength(0);
  });
  test('goals and projects track target dates and stamp completed_on', async () => {
    const db = await freshDb();
    const g = await row<{ id: string }>(db, `insert into goals (title, target_date) values ('g', '2026-12-31') returning id`);
    await db.query(`update goals set target_date='2027-01-06' where id=$1`, [g!.id]);
    await db.query(`update goals set status='done' where id=$1`, [g!.id]);
    const r = await row<{ original_target_date: string; completed_on: string | null }>(db, `select original_target_date::text, completed_on::text from goals where id=$1`, [g!.id]);
    expect(r!.original_target_date).toBe('2026-12-31');
    expect(r!.completed_on).not.toBeNull();
    await db.query(`update goals set status='active' where id=$1`, [g!.id]);
    expect((await row<{ completed_on: string | null }>(db, `select completed_on from goals where id=$1`, [g!.id]))!.completed_on).toBeNull();
  });
});

describe('correcting the first agreed deadline and completion date by hand', () => {
  test('an edited original survives later moves, and one set together with a move is kept', async () => {
    const db = await freshDb();
    const t = await row<{ id: string }>(db, `insert into tasks (title, due_date) values ('x', '2026-10-22') returning id`);
    await db.query(`update tasks set original_due_date = '2026-10-10' where id=$1`, [t!.id]);
    await db.query(`update tasks set due_date = '2026-10-30' where id=$1`, [t!.id]);
    expect((await row<{ o: string }>(db, `select original_due_date::text o from tasks where id=$1`, [t!.id]))!.o).toBe('2026-10-10');
    await db.query(`update tasks set due_date = '2026-11-05', original_due_date = '2026-10-01' where id=$1`, [t!.id]);
    expect((await row<{ o: string }>(db, `select original_due_date::text o from tasks where id=$1`, [t!.id]))!.o).toBe('2026-10-01');
  });
  test('a completion date set by hand is not overwritten when the status is set to done together with it', async () => {
    const db = await freshDb();
    const g = await row<{ id: string }>(db, `insert into goals (title, target_date) values ('g', '2026-12-31') returning id`);
    await db.query(`update goals set status='done', completed_on='2026-03-01' where id=$1`, [g!.id]);
    expect((await row<{ c: string }>(db, `select completed_on::text c from goals where id=$1`, [g!.id]))!.c).toBe('2026-03-01');
    await db.query(`update goals set completed_on='2026-04-02' where id=$1`, [g!.id]);
    expect((await row<{ c: string }>(db, `select completed_on::text c from goals where id=$1`, [g!.id]))!.c).toBe('2026-04-02');
  });
});

describe('daily priorities', () => {
  test('at most three positions per day', async () => {
    const db = await freshDb();
    await db.query(`insert into daily_priorities (plan_date, position, text) values ('2026-10-24', 1, 'a')`);
    await expect(db.query(`insert into daily_priorities (plan_date, position, text) values ('2026-10-24', 4, 'd')`)).rejects.toThrow();
    await expect(db.query(`insert into daily_priorities (plan_date, position, text) values ('2026-10-24', 1, 'dup')`)).rejects.toThrow();
  });
});
