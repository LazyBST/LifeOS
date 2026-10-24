-- LifeOS 0009: habits can hang off a task ("sub-habits"), as well as a goal
alter table habits add column if not exists task_id uuid references tasks(id) on delete set null;
create index if not exists habits_task_id_idx on habits (task_id);
