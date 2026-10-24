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

describe('habit time blocks and calendar sync state', () => {
  test('a habit end time must be after its start time', async () => {
    const db = await freshDb();
    await db.query(`insert into habits (name, start_time, end_time) values ('Gym', '07:00', '08:00')`);
    await db.query(`insert into habits (name, start_time) values ('Read', '21:00')`);
    await expect(db.query(`insert into habits (name, start_time, end_time) values ('Bad', '09:00', '08:00')`)).rejects.toThrow();
  });
  test('calendar_sync_state is a single row that can be claimed atomically', async () => {
    const db = await freshDb();
    expect(await rows(db, 'select 1 from calendar_sync_state')).toHaveLength(1);
    const first = await rows(db, `update calendar_sync_state set last_polled_at = now() where id and (last_polled_at is null or last_polled_at < now() - interval '5 minutes') returning id`);
    const second = await rows(db, `update calendar_sync_state set last_polled_at = now() where id and (last_polled_at is null or last_polled_at < now() - interval '5 minutes') returning id`);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0); // someone already claimed this window
  });
});
