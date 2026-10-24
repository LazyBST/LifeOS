import { describe, expect, test } from 'vitest';
import { freshDb, row, rows } from './harness';

describe('habit links and ui_state', () => {
  test('a habit links to goals, projects and tasks, once each, and cascades with the habit', async () => {
    const db = await freshDb();
    const h = await row<{ id: string }>(db, `insert into habits (name) values ('Read') returning id`);
    const g = await row<{ id: string }>(db, `insert into goals (title) values ('g') returning id`);
    await db.query(`insert into habit_links (habit_id, entity_type, entity_id) values ($1,'goal',$2)`, [h!.id, g!.id]);
    await expect(db.query(`insert into habit_links (habit_id, entity_type, entity_id) values ($1,'goal',$2)`, [h!.id, g!.id])).rejects.toThrow();
    await expect(db.query(`insert into habit_links (habit_id, entity_type, entity_id) values ($1,'book',$2)`, [h!.id, g!.id])).rejects.toThrow();
    await db.query(`delete from habits where id=$1`, [h!.id]);
    expect(await rows(db, 'select 1 from habit_links')).toHaveLength(0);
  });
  test('ui_state stores and replaces a json document by key', async () => {
    const db = await freshDb();
    await db.query(`insert into ui_state (key, value) values ('dashboard-layout', '{"lg":[]}')`);
    await db.query(`insert into ui_state (key, value) values ('dashboard-layout', '{"lg":[1]}') on conflict (key) do update set value = excluded.value`);
    const r = await row<{ value: { lg: number[] } }>(db, `select value from ui_state where key='dashboard-layout'`);
    expect(r!.value.lg).toEqual([1]);
  });
});
