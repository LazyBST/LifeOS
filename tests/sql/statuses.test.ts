import { describe, expect, test } from 'vitest';
import { freshDb, row, rows } from './harness';

describe('statuses table', () => {
  test('seeds the six statuses with colour fields', async () => {
    const db = await freshDb();
    const r = await rows<{ key: string; color: string; bg_color: string }>(
      db, `select key, color, bg_color from statuses order by sort_order`);
    expect(r.map((x) => x.key)).toEqual(['todo', 'doing', 'done', 'active', 'paused', 'dropped']);
    expect(r.every((x) => /^#[0-9a-f]{6}$/i.test(x.color) && /^#[0-9a-f]{6}$/i.test(x.bg_color))).toBe(true);
  });

  test('an unknown status is rejected by the foreign key', async () => {
    const db = await freshDb();
    await expect(db.query(`insert into tasks (title, status) values ('x', 'bogus')`)).rejects.toThrow();
  });

  test('a status that does not apply to the entity kind is rejected', async () => {
    const db = await freshDb();
    await expect(db.query(`insert into tasks (title, status) values ('x', 'paused')`)).rejects.toThrow(/not valid for a task/);
    await expect(db.query(`insert into goals (title, status) values ('g', 'doing')`)).rejects.toThrow(/not valid for a goal/);
    await db.query(`insert into goals (title, status) values ('g', 'paused')`);
  });

  test('done still stamps completed_at', async () => {
    const db = await freshDb();
    const t = await row<{ id: string }>(db, `insert into tasks (title) values ('x') returning id`);
    const d = await row<{ completed_at: string | null }>(
      db, `update tasks set status='done' where id=$1 returning completed_at`, [t!.id]);
    expect(d!.completed_at).not.toBeNull();
  });

  test('one default status per entity kind', async () => {
    const db = await freshDb();
    const r = await rows<{ k: string; n: number }>(db, `
      select k, count(*)::int as n from (values ('task'),('project'),('goal')) v(k)
      join statuses s on s.is_default and v.k = any(s.default_for) group by k`);
    expect(r).toHaveLength(3);
    expect(r.every((x) => x.n === 1)).toBe(true);
  });
});
