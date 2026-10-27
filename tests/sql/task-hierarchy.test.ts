import { describe, expect, test } from 'vitest';
import { freshDb, row } from './harness';

async function setup() {
  const db = await freshDb();
  const g1 = (await row<{ id: string }>(db, `insert into goals (title) values ('G1') returning id`))!.id;
  const g2 = (await row<{ id: string }>(db, `insert into goals (title) values ('G2') returning id`))!.id;
  const p1 = (await row<{ id: string }>(db, `insert into projects (title, goal_id) values ('P1', $1) returning id`, [g1]))!.id;
  const p2 = (await row<{ id: string }>(db, `insert into projects (title, goal_id) values ('P2', $1) returning id`, [g2]))!.id;
  return { db, g1, g2, p1, p2 };
}

describe('goal > project > task > subtask links', () => {
  test('linking a task to a project fills its goal', async () => {
    const { db, g1, p1 } = await setup();
    const t = await row<{ id: string }>(db, `insert into tasks (title) values ('t') returning id`);
    const r = await row<{ goal_id: string; project_id: string }>(db, `update tasks set project_id = $1 where id = $2 returning goal_id, project_id`, [p1, t!.id]);
    expect(r).toMatchObject({ goal_id: g1, project_id: p1 });
  });

  test('a subtask takes the project and goal of its parent, and follows when the parent moves', async () => {
    const { db, g1, g2, p1, p2 } = await setup();
    const parent = (await row<{ id: string }>(db, `insert into tasks (title, project_id) values ('parent', $1) returning id`, [p1]))!.id;
    const kid = (await row<{ id: string }>(db, `insert into tasks (title, parent_task_id) values ('kid', $1) returning id`, [parent]))!.id;
    const grandkid = (await row<{ id: string }>(db, `insert into tasks (title, parent_task_id) values ('grandkid', $1) returning id`, [kid]))!.id;
    expect(await row(db, `select goal_id, project_id from tasks where id = $1`, [grandkid])).toMatchObject({ goal_id: g1, project_id: p1 });
    await db.query(`update tasks set project_id = $1 where id = $2`, [p2, parent]);
    expect(await row(db, `select goal_id, project_id from tasks where id = $1`, [kid])).toMatchObject({ goal_id: g2, project_id: p2 });
    expect(await row(db, `select goal_id, project_id from tasks where id = $1`, [grandkid])).toMatchObject({ goal_id: g2, project_id: p2 });
  });

  test('choosing a different goal drops a project that belongs to another goal; the same goal keeps it', async () => {
    const { db, g1, g2, p1 } = await setup();
    const t = (await row<{ id: string }>(db, `insert into tasks (title, project_id) values ('t', $1) returning id`, [p1]))!.id;
    expect(await row(db, `update tasks set goal_id = $1 where id = $2 returning goal_id, project_id`, [g1, t])).toMatchObject({ goal_id: g1, project_id: p1 });
    expect(await row(db, `update tasks set goal_id = $1 where id = $2 returning goal_id, project_id`, [g2, t])).toMatchObject({ goal_id: g2, project_id: null });
  });
});
