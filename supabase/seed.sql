-- LifeOS seed data for testing (spec section 11).
-- Run once on a fresh database after migrations 0001-0005.
begin;

insert into accounts (name, opening_balance, is_default) values
  ('Cash', 5000, true), ('HDFC', 42000, false), ('GPay', 1500, false);

insert into goals (title, emoji, description, area_id, status, priority, start_date, target_date)
values
  ('Launch MVP', '🚀', 'Ship the first paying version',
   (select id from areas where name = 'Business'), 'active', 'P0', current_date - 20, current_date + 40),
  ('Get fit', '💪', 'Strength plus 10k steps a day',
   (select id from areas where name = 'Health & Fitness'), 'active', 'P1', current_date - 10, current_date + 80);

insert into projects (goal_id, title, emoji, priority, target_date)
select g.id, v.title, v.emoji, v.priority, v.target_date
from (values
  ('Launch MVP', 'Website',  '🌐', 'P0', current_date + 20),
  ('Launch MVP', 'Billing',  '💳', 'P1', current_date + 35),
  ('Get fit',    'Gym plan', '🏋', 'P1', current_date + 60)
) as v(goal, title, emoji, priority, target_date)
join goals g on g.title = v.goal;

insert into tasks (title, project_id, status, priority, due_date, estimate_min)
select v.title, p.id, v.status, v.priority, v.due, v.est
from (values
  ('Fix login redirect',   'Website',  'todo',  'P0', current_date,      45),
  ('Login page copy',      'Website',  'doing', 'P1', current_date + 2,  30),
  ('Set up analytics',     'Website',  'todo',  'P2', current_date + 6,  60),
  ('Deploy to production', 'Website',  'todo',  'P1', current_date + 12, 90),
  ('Write landing hero',   'Website',  'done',  'P2', current_date - 3,  30),
  ('Stripe test keys',     'Billing',  'done',  'P1', current_date - 5,  30),
  ('Checkout flow',        'Billing',  'doing', 'P0', current_date + 1, 120),
  ('Invoice emails',       'Billing',  'todo',  'P2', null,              60),
  ('Book gym induction',   'Gym plan', 'todo',  'P1', current_date - 1,  30),
  ('Buy shoes',            'Gym plan', 'done',  'P3', current_date - 7,  45),
  ('Plan week 1 split',    'Gym plan', 'todo',  'P2', current_date + 4, null)
) as v(title, project, status, priority, due, est)
join projects p on p.title = v.project;

-- one goal-level task with no project, and one subtask
insert into tasks (title, goal_id, status, priority, estimate_min)
select 'Talk to three users', id, 'todo', 'P1', 60 from goals where title = 'Launch MVP';
insert into tasks (title, parent_task_id, status, priority, estimate_min)
select 'Draft the redirect fix', id, 'todo', 'P2', 20 from tasks where title = 'Fix login redirect';

insert into habits (name, emoji, time_of_day, kind, target_value, unit, reminder_time, area_id)
values
  ('Gym',        '🏋', 'morning',  'boolean', 1, null,    '07:00',
    (select id from areas where name = 'Health & Fitness')),
  ('10k steps',  '🚶', 'any',      'count',   10000, 'steps', null,
    (select id from areas where name = 'Health & Fitness')),
  ('Read',       '📖', 'evening',  'count',   20, 'pages', '21:00',
    (select id from areas where name = 'Business'));

insert into habit_checkins (habit_id, checkin_date, value)
select h.id, current_date - d, case when h.kind = 'count' then h.target_value else 1 end
from habits h, generate_series(0, 4) d
where h.name = 'Gym';

insert into transactions (occurred_on, kind, description, category_id, account_id, amount, my_share, counterparty)
values
  (current_date,     'expense', 'Lunch with brother',
    (select id from categories where name = 'Food'),    (select id from accounts where name = 'Cash'),  200, 100, 'brother'),
  (current_date,     'expense', 'Solo lunch',
    (select id from categories where name = 'Food'),    (select id from accounts where name = 'Cash'),  150, 150, null),
  (current_date - 1, 'expense', 'Ravi paid for dinner for 3',
    (select id from categories where name = 'Food'),    (select id from accounts where name = 'Cash'),    0, 200, 'Ravi'),
  (current_date - 2, 'expense', 'Groceries',
    (select id from categories where name = 'Groceries'),(select id from accounts where name = 'HDFC'), 1200, 1200, null),
  (current_date - 3, 'income',  'Freelance payment',
    null,                                                (select id from accounts where name = 'HDFC'), 25000, null, null);

insert into journal_entries (entry_date, body_md, mood) values
  (current_date - 1, 'Shipped the login fix. Felt good.', 4),
  (current_date - 2, 'Slow day, too many meetings.', 3);

commit;
