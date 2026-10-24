// Proves the database hierarchy rules from docs/SPEC.md section 4 (data
// model) and section 10 (analytics) and section 5 (money) against the real
// migration files, using an in-memory PGlite database per test.
import { describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { freshDb, row, rows } from './harness';

async function makeArea(db: PGlite, name = 'Test Area') {
  return row<{ id: string }>(
    db,
    `insert into areas (name) values ($1) returning id`,
    [name],
  ).then((r) => r!.id);
}

async function makeGoal(db: PGlite, areaId: string, title = 'Goal') {
  return row<{ id: string }>(
    db,
    `insert into goals (title, area_id) values ($1, $2) returning id`,
    [title, areaId],
  ).then((r) => r!.id);
}

async function makeProject(db: PGlite, goalId: string, title = 'Project') {
  return row<{ id: string; area_id: string | null }>(
    db,
    `insert into projects (goal_id, title) values ($1, $2) returning id, area_id`,
    [goalId, title],
  ).then((r) => r!);
}

describe('hierarchy: tasks inherit goal/project/area', () => {
  test('a task inserted with only project_id gets that project\'s goal_id and area_id', async () => {
    const db = await freshDb();
    const area = await makeArea(db);
    const goal = await makeGoal(db, area);
    const project = await makeProject(db, goal);

    const task = await row<{ goal_id: string; area_id: string }>(
      db,
      `insert into tasks (title, project_id) values ('T', $1) returning goal_id, area_id`,
      [project.id],
    );

    expect(task!.goal_id).toBe(goal);
    expect(task!.area_id).toBe(area);
  });

  test('a task inserted with project_id AND a wrong goal_id ends up with the project\'s goal (trigger corrects it)', async () => {
    const db = await freshDb();
    const area = await makeArea(db);
    const correctGoal = await makeGoal(db, area, 'Correct Goal');
    const wrongGoal = await makeGoal(db, area, 'Wrong Goal');
    const project = await makeProject(db, correctGoal);

    // tasks_inherit_bi is a BEFORE INSERT trigger that unconditionally
    // overwrites goal_id from the project when project_id is set, and that
    // happens before the composite FK is checked — so this should succeed
    // with the corrected goal_id, not be rejected by the FK.
    let outcome: 'corrected' | 'rejected';
    let resultGoalId: string | null = null;
    try {
      const task = await row<{ goal_id: string }>(
        db,
        `insert into tasks (title, project_id, goal_id) values ('T', $1, $2) returning goal_id`,
        [project.id, wrongGoal],
      );
      outcome = 'corrected';
      resultGoalId = task!.goal_id;
    } catch {
      outcome = 'rejected';
    }

    // Document which outcome actually happened.
    console.log(`wrong goal_id + project_id outcome: ${outcome}`);
    expect(outcome).toBe('corrected');
    expect(resultGoalId).toBe(correctGoal);
  });

  test('moving a project to another goal moves its tasks\' goal_id (ON UPDATE CASCADE)', async () => {
    const db = await freshDb();
    const area = await makeArea(db);
    const goalA = await makeGoal(db, area, 'Goal A');
    const goalB = await makeGoal(db, area, 'Goal B');
    const project = await makeProject(db, goalA);

    const task = await row<{ id: string; goal_id: string }>(
      db,
      `insert into tasks (title, project_id) values ('T', $1) returning id, goal_id`,
      [project.id],
    );
    expect(task!.goal_id).toBe(goalA);

    await db.query(`update projects set goal_id = $1 where id = $2`, [goalB, project.id]);

    const after = await row<{ goal_id: string }>(
      db,
      `select goal_id from tasks where id = $1`,
      [task!.id],
    );
    expect(after!.goal_id).toBe(goalB);
  });

  test('a subtask inherits goal_id, project_id and area_id from its parent task', async () => {
    const db = await freshDb();
    const area = await makeArea(db);
    const goal = await makeGoal(db, area);
    const project = await makeProject(db, goal);

    const parent = await row<{ id: string }>(
      db,
      `insert into tasks (title, project_id) values ('Parent', $1) returning id`,
      [project.id],
    );

    const sub = await row<{ goal_id: string; project_id: string; area_id: string }>(
      db,
      `insert into tasks (title, parent_task_id) values ('Sub', $1) returning goal_id, project_id, area_id`,
      [parent!.id],
    );

    expect(sub!.goal_id).toBe(goal);
    expect(sub!.project_id).toBe(project.id);
    expect(sub!.area_id).toBe(area);
  });

  test('a project inherits area_id from its goal', async () => {
    const db = await freshDb();
    const area = await makeArea(db);
    const goal = await makeGoal(db, area);

    const project = await makeProject(db, goal);
    expect(project.area_id).toBe(area);
  });
});

describe('task lifecycle: completed_at and task_events', () => {
  test('insert logs a "created" event', async () => {
    const db = await freshDb();
    const task = await row<{ id: string }>(
      db,
      `insert into tasks (title) values ('T') returning id`,
    );

    const events = await rows<{ event: string }>(
      db,
      `select event from task_events where task_id = $1 order by id`,
      [task!.id],
    );
    expect(events.map((e) => e.event)).toEqual(['created']);
  });

  test('setting status to done sets completed_at and logs event="completed"', async () => {
    const db = await freshDb();
    const task = await row<{ id: string }>(
      db,
      `insert into tasks (title) values ('T') returning id`,
    );

    await db.query(`update tasks set status = 'done' where id = $1`, [task!.id]);

    const after = await row<{ completed_at: string | null }>(
      db,
      `select completed_at from tasks where id = $1`,
      [task!.id],
    );
    expect(after!.completed_at).not.toBeNull();

    const events = await rows<{ event: string }>(
      db,
      `select event from task_events where task_id = $1 order by id`,
      [task!.id],
    );
    expect(events.map((e) => e.event)).toEqual(['created', 'completed']);
  });

  test('reopening (status away from done) clears completed_at and logs event="reopened"', async () => {
    const db = await freshDb();
    const task = await row<{ id: string }>(
      db,
      `insert into tasks (title) values ('T') returning id`,
    );
    await db.query(`update tasks set status = 'done' where id = $1`, [task!.id]);
    await db.query(`update tasks set status = 'todo' where id = $1`, [task!.id]);

    const after = await row<{ completed_at: string | null }>(
      db,
      `select completed_at from tasks where id = $1`,
      [task!.id],
    );
    expect(after!.completed_at).toBeNull();

    const events = await rows<{ event: string }>(
      db,
      `select event from task_events where task_id = $1 order by id`,
      [task!.id],
    );
    expect(events.map((e) => e.event)).toEqual(['created', 'completed', 'reopened']);
  });
});

describe('analytics views: v_goal_progress and v_task_effort', () => {
  test('v_goal_progress and v_task_effort match hand-checked numbers for a 4-task fixture', async () => {
    const db = await freshDb();
    const area = await makeArea(db);
    const goal = await makeGoal(db, area, 'Analytics Goal');

    // app_config.default_estimate_min is 30 (migration default).
    // 4 tasks under one goal, no project:
    //   T1: done,  estimate 60
    //   T2: done,  estimate null -> effort falls back to 30
    //   T3: todo,  estimate 90
    //   T4: todo,  estimate null -> effort falls back to 30
    // done_min      = 60 + 30 = 90
    // total_min     = 60 + 30 + 90 + 30 = 210
    // remaining_min = 90 + 30 = 120
    // unestimated   = 2 (T2, T4)
    await db.query(
      `insert into tasks (title, goal_id, status, estimate_min) values
         ('T1', $1, 'done', 60),
         ('T2', $1, 'done', null),
         ('T3', $1, 'todo', 90),
         ('T4', $1, 'todo', null)`,
      [goal],
    );

    const progress = await row<{
      done_min: string;
      total_min: string;
      remaining_min: string;
      unestimated: string;
    }>(db, `select done_min, total_min, remaining_min, unestimated from v_goal_progress where goal_id = $1`, [goal]);

    expect(Number(progress!.done_min)).toBe(90);
    expect(Number(progress!.total_min)).toBe(210);
    expect(Number(progress!.remaining_min)).toBe(120);
    expect(Number(progress!.unestimated)).toBe(2);

    // v_task_effort.effort_min falls back to app_config.default_estimate_min
    // (30) when estimate_min is null, and otherwise equals estimate_min.
    const effortRows = await rows<{ title: string; effort_min: string }>(
      db,
      `select title, effort_min from v_task_effort where goal_id = $1 order by title`,
      [goal],
    );
    const byTitle = Object.fromEntries(effortRows.map((r) => [r.title, Number(r.effort_min)]));
    expect(byTitle).toEqual({ T1: 60, T2: 30, T3: 90, T4: 30 });
  });
});

describe('money views: worked examples from SPEC section 5', () => {
  async function makeAccount(db: PGlite, name: string, opening = 0, isDefault = false) {
    return row<{ id: string }>(
      db,
      `insert into accounts (name, opening_balance, is_default) values ($1, $2, $3) returning id`,
      [name, opening, isDefault],
    ).then((r) => r!.id);
  }

  test('v_owed_by_label and v_wallet reproduce the three worked examples', async () => {
    const db = await freshDb();
    const cash = await makeAccount(db, 'Cash');

    // expense(paid=200, share=100, 'brother')      -> owed +100 (brother owes me)
    // expense(paid=0,   share=200, 'Ravi')         -> owed -200 (I owe Ravi)
    // expense(paid=150, share=150, null)           -> owed 0 (solo, unspecified)
    await db.query(
      `insert into transactions (kind, amount, my_share, counterparty, account_id) values
         ('expense', 200, 100, 'brother', $1),
         ('expense', 0,   200, 'Ravi',    $1),
         ('expense', 150, 150, null,      $1)`,
      [cash],
    );

    const owed = await rows<{ label: string; owed: string }>(
      db,
      `select label, owed from v_owed_by_label order by label`,
    );
    const byLabel = Object.fromEntries(owed.map((r) => [r.label, Number(r.owed)]));
    expect(byLabel['brother']).toBe(100);
    expect(byLabel['Ravi']).toBe(-200);
    expect(byLabel['unspecified']).toBe(0);

    const wallet = await row<{ owed_to_me: string; i_owe: string }>(
      db,
      `select owed_to_me, i_owe from v_wallet`,
    );
    expect(Number(wallet!.owed_to_me)).toBe(100);
    expect(Number(wallet!.i_owe)).toBe(200);
  });

  test('a settlement of +100 against "brother" brings that label to 0 and raises the account balance by 100', async () => {
    const db = await freshDb();
    const cash = await makeAccount(db, 'Cash', 0, true);

    await db.query(
      `insert into transactions (kind, amount, my_share, counterparty, account_id) values
         ('expense', 200, 100, 'brother', $1)`,
      [cash],
    );

    const beforeBalance = await row<{ balance: string }>(
      db,
      `select balance from v_account_balances where id = $1`,
      [cash],
    );
    // opening 0, minus the 200 cash paid out = -200
    expect(Number(beforeBalance!.balance)).toBe(-200);

    // Settlement: brother paid me 100 on Cash.
    await db.query(
      `insert into transactions (kind, amount, counterparty, account_id) values
         ('settlement', 100, 'brother', $1)`,
      [cash],
    );

    const owedAfter = await row<{ owed: string }>(
      db,
      `select owed from v_owed_by_label where label = 'brother'`,
    );
    expect(Number(owedAfter!.owed)).toBe(0);

    const afterBalance = await row<{ balance: string }>(
      db,
      `select balance from v_account_balances where id = $1`,
      [cash],
    );
    // -200 + 100 (settlement received) = -100, i.e. raised by 100
    expect(Number(afterBalance!.balance)).toBe(Number(beforeBalance!.balance) + 100);
  });
});
