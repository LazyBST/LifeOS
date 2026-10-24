-- LifeOS 0001: core schema (spec section 4)
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- one row of settings
create table app_config (
  id boolean primary key default true check (id),
  owner_user_id uuid,
  timezone text not null default 'Asia/Kolkata',
  morning_time time not null default '07:30',
  night_time time not null default '21:30',
  push_enabled boolean not null default true,
  default_estimate_min int not null default 30
);
insert into app_config default values;

create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  sort_order int not null default 0
);
insert into areas (name, sort_order) values
  ('Business',1), ('Health & Fitness',2), ('Relationships',3), ('Finances',4);

create table goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  emoji text,
  description text,
  area_id uuid references areas(id),
  status text not null default 'active' check (status in ('active','paused','done','dropped')),
  priority text not null default 'P1' check (priority in ('P0','P1','P2','P3')),
  start_date date,
  target_date date,
  notes_md text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  title text not null,
  emoji text,
  description text,
  area_id uuid references areas(id),
  status text not null default 'active' check (status in ('active','paused','done','dropped')),
  priority text not null default 'P1' check (priority in ('P0','P1','P2','P3')),
  start_date date,
  target_date date,
  notes_md text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, goal_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  goal_id uuid references goals(id) on delete cascade,
  project_id uuid,
  parent_task_id uuid references tasks(id) on delete cascade,
  area_id uuid references areas(id),
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority text not null default 'P2' check (priority in ('P0','P1','P2','P3')),
  due_date date,
  due_at timestamptz,            -- set when the task has a clock time; drives calendar and reminders
  duration_min int,
  estimate_min int,              -- effort; falls back to app_config.default_estimate_min
  notes_md text not null default '',   -- the task's page: description, commands, code
  tags text[] not null default '{}',
  sort_order double precision not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (project_id, goal_id) references projects(id, goal_id) on update cascade on delete cascade,
  check (project_id is null or goal_id is not null),
  check (parent_task_id is distinct from id)
);
create index on tasks (due_date) where deleted_at is null;
create index on tasks (status);
create index on tasks (goal_id);
create index on tasks (project_id);
create index on tasks (parent_task_id);
create index on tasks using gin (title gin_trgm_ops);
create index on goals using gin (title gin_trgm_ops);
create index on projects using gin (title gin_trgm_ops);

-- lineage: a task always takes goal/project/area from its parent task or project
create function tasks_inherit() returns trigger language plpgsql as $$
declare p record;
begin
  if new.parent_task_id is not null then
    select goal_id, project_id, area_id into p from tasks where id = new.parent_task_id;
    new.goal_id := p.goal_id; new.project_id := p.project_id;
    new.area_id := coalesce(new.area_id, p.area_id);
  elsif new.project_id is not null then
    select goal_id, area_id into p from projects where id = new.project_id;
    new.goal_id := p.goal_id;
    new.area_id := coalesce(new.area_id, p.area_id);
  elsif new.goal_id is not null then
    select area_id into p from goals where id = new.goal_id;
    new.area_id := coalesce(new.area_id, p.area_id);
  end if;
  return new;
end $$;
create trigger tasks_inherit_bi before insert or update of project_id, parent_task_id, goal_id
  on tasks for each row execute function tasks_inherit();

-- projects inherit Area from their goal
create function projects_inherit() returns trigger language plpgsql as $$
begin
  new.area_id := coalesce(new.area_id, (select area_id from goals where id = new.goal_id));
  return new;
end $$;
create trigger projects_inherit_bi before insert on projects
  for each row execute function projects_inherit();

-- completed_at follows status; updated_at follows any change
create function tasks_stamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger tasks_stamp_bi before insert or update on tasks
  for each row execute function tasks_stamp();

-- when a project moves to another goal, its tasks follow (the composite FK has ON UPDATE CASCADE)
-- append-only activity log; feeds analytics and survives deletes
create table task_events (
  id bigserial primary key,
  task_id uuid not null,
  goal_id uuid, project_id uuid, area_id uuid,
  event text not null check (event in ('created','completed','reopened','deleted')),
  estimate_min int,
  at timestamptz not null default now(),
  source text not null default 'web'   -- web | chat | gcal | system
);
create function log_task_event() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into task_events (task_id, goal_id, project_id, area_id, event, estimate_min) values (new.id, new.goal_id, new.project_id, new.area_id, 'created', new.estimate_min);
  elsif new.status = 'done' and old.status <> 'done' then
    insert into task_events (task_id, goal_id, project_id, area_id, event, estimate_min) values (new.id, new.goal_id, new.project_id, new.area_id, 'completed', new.estimate_min);
  elsif old.status = 'done' and new.status <> 'done' then
    insert into task_events (task_id, goal_id, project_id, area_id, event, estimate_min) values (new.id, new.goal_id, new.project_id, new.area_id, 'reopened', new.estimate_min);
  end if;
  return new;
end $$;
create trigger tasks_log_ai after insert or update of status on tasks
  for each row execute function log_task_event();

-- habits
create table habits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text,
  time_of_day text not null default 'any' check (time_of_day in ('morning','afternoon','evening','any')),
  kind text not null default 'boolean' check (kind in ('boolean','count')),
  target_value numeric not null default 1,
  unit text,
  days_of_week smallint[],            -- 1=Mon..7=Sun; null = every day
  reminder_time time,
  area_id uuid references areas(id),
  goal_id uuid references goals(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create table habit_checkins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  checkin_date date not null,
  value numeric not null default 1,
  note text,
  unique (habit_id, checkin_date)
);

-- journal: one entry per day
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null unique,
  body_md text not null default '',
  mood smallint check (mood between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reminders, daily plan, chat, audit, job idempotency
create table reminders (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  remind_at timestamptz not null,
  task_id uuid references tasks(id) on delete cascade,
  habit_id uuid references habits(id) on delete cascade,
  recurrence text,                    -- null | 'daily' | 'weekdays' | 'weekly'
  sent_at timestamptz,
  cancelled_at timestamptz
);
create index on reminders (remind_at) where sent_at is null and cancelled_at is null;
create table daily_plans (plan_date date primary key, task_ids uuid[] not null default '{}', plan_md text, accepted_at timestamptz);
create table chat_messages (
  id bigserial primary key,
  channel text not null check (channel in ('web','system')),
  role text not null check (role in ('user','assistant','tool')),
  content jsonb not null,
  page_context jsonb,
  created_at timestamptz not null default now()
);
create table agent_actions (
  id bigserial primary key,
  tool text not null, input jsonb, before jsonb, after jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create table job_runs (job_key text primary key, ran_at timestamptz not null default now());
