import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { freshDb, row, rows } from './harness';
import { buildPlan, type AfDump } from '../../lib/appflowy/transform';

// Loads the import plan from your real AppFlowy export (when it exists) into the real schema, in the same order
// and with the same columns as scripts/appflowy/import.ts, to prove every row passes the database's own rules.
describe.skipIf(!existsSync('data/appflowy/dump.json'))('AppFlowy plan against the real schema', () => {
  test('every goal, project, task and habit inserts; lineage and completion dates come out right', async () => {
    const notes = existsSync('data/appflowy/notes.json') ? (JSON.parse(readFileSync('data/appflowy/notes.json', 'utf8')) as Record<string, string>) : {};
    const plan = buildPlan(JSON.parse(readFileSync('data/appflowy/dump.json', 'utf8')) as AfDump, undefined, notes);
    const db = await freshDb();
    const area = async (name: string | null) => (name ? (await row<{ id: string }>(db, 'select id from areas where name=$1', [name]))?.id ?? null : null);
    const uuid = () => crypto.randomUUID();
    const g = new Map<string, string>(), p = new Map<string, string>();

    for (const x of plan.goals) {
      g.set(x.id, uuid());
      await db.query('insert into goals (id, external_id, title, area_id, status, priority, start_date, target_date, notes_md) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [g.get(x.id), x.external_id, x.title, await area(x.area), x.status, x.priority, x.start_date, x.target_date, x.notes_md]);
    }
    for (const x of plan.projects) {
      p.set(x.id, uuid());
      await db.query('insert into projects (id, external_id, goal_id, title, area_id, status, priority, start_date, target_date) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [p.get(x.id), x.external_id, g.get(x.goal_id), x.title, await area(x.area), x.status, x.priority, x.start_date, x.target_date]);
    }
    for (const x of plan.tasks) {
      await db.query('insert into tasks (id, external_id, title, project_id, area_id, status, priority, due_date, due_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [uuid(), x.external_id, x.title, x.project_id ? p.get(x.project_id) : null, await area(x.area), x.status, x.priority, x.due_date, x.due_at]);
    }
    for (const x of plan.tasks.filter((t) => t.status === 'done' && t.completed_at)) {
      await db.query('update tasks set completed_at=$1 where external_id=$2', [x.completed_at, x.external_id]);
      await db.query(`update task_events set at=$1 where event='completed' and task_id=(select id from tasks where external_id=$2)`, [x.completed_at, x.external_id]);
    }
    for (const x of plan.habits) {
      await db.query('insert into habits (external_id, name, time_of_day, kind, target_value, unit, days_of_week, area_id) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [x.external_id, x.name, x.time_of_day, x.kind, x.target_value, x.unit, x.days_of_week, await area(x.area)]);
    }

    expect((await row<{ n: number }>(db, 'select count(*)::int n from goals'))!.n).toBe(plan.goals.length);
    expect((await row<{ n: number }>(db, 'select count(*)::int n from tasks'))!.n).toBe(plan.tasks.length);
    // a task under a project carries that project's goal
    expect((await row<{ n: number }>(db, 'select count(*)::int n from tasks t join projects p on p.id=t.project_id where t.goal_id is distinct from p.goal_id'))!.n).toBe(0);
    // completed tasks keep their real completion time, not the import time
    expect((await row<{ n: number }>(db, `select count(*)::int n from tasks where status='done' and completed_at > now() - interval '1 hour'`))!.n).toBe(0);
    expect((await row<{ n: number }>(db, `select count(*)::int n from task_events where event='completed' and at > now() - interval '1 hour'`))!.n).toBe(0);
    // re-running cannot duplicate: external ids are unique
    await expect(db.query(`insert into tasks (title, external_id) select 'x', external_id from tasks limit 1`)).rejects.toThrow();
    expect((await rows(db, 'select 1 from habits where days_of_week is not null')).length).toBeGreaterThan(0);
  });
});
